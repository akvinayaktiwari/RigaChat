// @vitest-environment node
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { HelmetProvider } from 'react-helmet-async'
import { StaticRouter } from 'react-router-dom/server'
import { describe, expect, it } from 'vitest'
import { AppRoutes, preloadRoute } from '../../App'
import { MotionProvider } from '../components/MotionProvider'
import { getAllSlugs } from '../content/blog/registry'
import { AuthProvider } from '../hooks/useAuth'
import { StaffAuthProvider } from '../hooks/useStaffAuth'
import { SubscriptionProvider } from '../hooks/useSubscription'
import DataDeletionStatus from '../pages/DataDeletionStatus'
import LoginPage from '../pages/LoginPage'
import SignupPage from '../pages/SignupPage'
import Status from '../pages/Status'
import { PRERENDERED_STATIC_ROUTES } from './crawl-files'

/**
 * A screen reader user moves through a page by its headings, so a page that
 * jumps from an h1 to an h4 reads as if two levels of it were missing. Nothing
 * looks wrong -- every heading here is sized by its classes, not its tag -- so
 * the only thing that notices a skipped level is this file or an audit.
 */

/** Every page the build prerenders, rendered through the app's own routes. */
const PRERENDERED_ROUTES = ['/', ...PRERENDERED_STATIC_ROUTES, ...getAllSlugs().map((slug) => `/blog/${slug}`)]

/**
 * Public pages that are not prerendered. App.tsx loads them lazily, which a
 * synchronous render cannot wait for, so they are rendered directly.
 */
const LAZY_PAGES: Record<string, ReactElement> = {
  '/system-status': <Status />,
  '/data-deletion-status': <DataDeletionStatus />,
  '/login': <LoginPage />,
  '/signup': <SignupPage />,
}

async function renderPage(route: string): Promise<string> {
  await preloadRoute(route)
  return renderToString(
    <HelmetProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <StaffAuthProvider>
            <MotionProvider>
              <StaticRouter location={route}>{LAZY_PAGES[route] ?? <AppRoutes />}</StaticRouter>
            </MotionProvider>
          </StaffAuthProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </HelmetProvider>,
  )
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

/** Each place a heading sits more than one level below the one before it. */
function skippedLevels(levels: number[]): string[] {
  return levels.flatMap((level, index) => {
    const previous = levels[index - 1] ?? level
    return level - previous > 1 ? [`h${previous} then h${level}`] : []
  })
}

function unlabelledSelects(html: string): number {
  return (html.match(/<select(?![^>]*aria-label)/g) ?? []).length
}

describe('skippedLevels', () => {
  it('flags a jump down of more than one level, and nothing else', () => {
    expect(skippedLevels([1, 2, 3, 2, 3, 4, 2])).toEqual([])
    expect(skippedLevels([1, 4, 2, 4])).toEqual(['h1 then h4', 'h2 then h4'])
  })
})

describe.each([...PRERENDERED_ROUTES, ...Object.keys(LAZY_PAGES)])('%s', (route) => {
  it('starts at an h1 and never skips a heading level', async () => {
    const levels = headingLevels(await renderPage(route))
    expect(levels[0]).toBe(1)
    expect(skippedLevels(levels)).toEqual([])
  })

  // A <select> with no label is announced as just "combo box".
  it('labels every dropdown', async () => {
    expect(unlabelledSelects(await renderPage(route))).toBe(0)
  })
})
