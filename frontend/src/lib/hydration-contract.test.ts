import { describe, expect, it } from 'vitest'
import mainSource from '../../main.tsx?raw'
import prerenderSource from '../../prerender-entry.tsx?raw'

/**
 * main.tsx hydrates what prerender-entry.tsx rendered. Hydration holds only
 * while both render the same tree; when they drift React logs a recoverable
 * error, discards the prerendered page and renders it again. Nothing looks
 * broken -- the page is just a second slower to settle on a phone, which is
 * the regression this file exists to catch before a Lighthouse run does.
 */

/** Provider components in the order they wrap the app, outermost first. */
function providerOrder(source: string): string[] {
  return [...source.matchAll(/<(\w+Provider)\b/g)].map((match) => match[1] ?? '')
}

describe('hydration contract', () => {
  it('hydrates a prerendered page and renders the empty app shell', () => {
    expect(mainSource).toContain('hydrateRoot(container, app)')
    expect(mainSource).toContain('createRoot(container).render(app)')
  })

  // A lazy route still waiting on its chunk when hydration starts is discarded
  // on the first update that reaches it (React error #421), which on a slow
  // connection is every load of a blog page.
  it('waits for the lazy chunks of the current route before hydrating', () => {
    expect(mainSource).toMatch(/preloadRoute\(window\.location\.pathname\)[\s\S]*\.finally\(\(\) => ReactDOM\.hydrateRoot\(container, app\)\)/)
  })

  it("prerenders App.tsx's own route tree, not a second list of routes", () => {
    expect(prerenderSource).toContain('<AppRoutes />')
    expect(prerenderSource).not.toMatch(/<Route\s/)
  })

  it('wraps the app in the same providers, in the same order, on both sides', () => {
    expect(providerOrder(mainSource).length).toBeGreaterThan(3)
    expect(providerOrder(prerenderSource)).toEqual(providerOrder(mainSource))
  })
})
