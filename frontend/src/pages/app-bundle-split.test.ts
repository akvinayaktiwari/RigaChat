import { describe, expect, it } from 'vitest'
import appSource from '../../App.tsx?raw'
import { PRERENDERED_STATIC_ROUTES } from '../lib/crawl-files'

/**
 * The split that keeps the dashboard out of the marketing bundle.
 *
 * Every page used to be imported eagerly, so a first-time visitor on "/"
 * downloaded the journey builder, the voice agents and the admin console
 * before the hero could paint.
 *
 * Both directions matter, which is why this file tests both:
 *  - an app page imported eagerly quietly puts itself back in the entry chunk
 *  - a PRERENDERED page made lazy is worse: main.tsx uses createRoot, not
 *    hydrateRoot, so React replaces the prerendered markup with the Suspense
 *    fallback on first paint -- a blank flash on the pages meant to rank.
 */

/** Components imported at the top of App.tsx: these ship in the entry chunk. */
function eagerComponents(): Set<string> {
  return new Set([...appSource.matchAll(/^import (\w+) from '\.\/src\/(?:pages|components)\//gm)].map((m) => m[1] ?? ''))
}

/** Components declared as lazy(): these get their own chunk. */
function lazyComponents(): Set<string> {
  return new Set([...appSource.matchAll(/^const (\w+) = lazy\(/gm)].map((m) => m[1] ?? ''))
}

/** Route path -> the component name in its element prop. */
function routeComponents(): Map<string, string> {
  const pairs = [...appSource.matchAll(/<Route\s+path="([^"]*)"\s+element={<(\w+)/g)]
  return new Map(pairs.map((m) => [m[1] ?? '', m[2] ?? '']))
}

describe('app bundle split', () => {
  const eager = eagerComponents()
  const lazyLoaded = lazyComponents()
  const routes = routeComponents()

  it('parses App.tsx', () => {
    expect(routes.size).toBeGreaterThan(20)
    expect(eager.size).toBeGreaterThan(5)
    expect(lazyLoaded.size).toBeGreaterThan(20)
  })

  // A prerendered route is served as finished HTML; its component must already
  // be in the entry chunk or the first paint throws that HTML away.
  it.each(['/', ...PRERENDERED_STATIC_ROUTES].filter((route) => route !== '/blog'))(
    'keeps %s eager, because it is prerendered',
    (route) => {
      const component = routes.get(route)
      expect(component, `no <Route path="${route}"> found`).toBeTruthy()
      expect(lazyLoaded.has(component ?? '')).toBe(false)
      expect(eager.has(component ?? '')).toBe(true)
    },
  )

  it('loads every signed-in and admin page on demand', () => {
    const appRoutes = [...routes.entries()].filter(
      ([path]) => path.startsWith('/dashboard') || path.startsWith('/admin') || path === '/login' || path === '/signup',
    )
    expect(appRoutes.length).toBeGreaterThanOrEqual(3)

    const eagerlyImported = appRoutes.filter(([, component]) => eager.has(component)).map(([path]) => path)
    expect(eagerlyImported).toEqual([])
  })

  it('loads the dashboard shell and its child pages on demand', () => {
    // Nested <Route>s: no leading slash, and not the "*" catch-all, whose
    // NotFound stays eager because it renders for any unmatched path.
    const children = [...appSource.matchAll(/<Route\s+(?:index|path="(?![/*])[^"]*")\s+element={<(\w+)/g)].map((m) => m[1] ?? '')
    expect(children.length).toBeGreaterThan(15)
    expect(children.filter((component) => eager.has(component))).toEqual([])
    expect(lazyLoaded.has('DashboardLayout')).toBe(true)
  })
})
