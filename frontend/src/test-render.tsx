import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async'
import { StaticRouter } from 'react-router-dom/server'
import { AppRoutes, preloadRoute } from '../App'
import { MotionProvider } from './components/MotionProvider'
import { AuthProvider } from './hooks/useAuth'
import { StaffAuthProvider } from './hooks/useStaffAuth'
import { SubscriptionProvider } from './hooks/useSubscription'
import type { JsonLd } from './lib/structured-data'

export interface RenderedPage {
  /** The page body, as the build-time prerender would write it. */
  html: string
  /** Every JSON-LD block the page put in <head>, parsed. */
  jsonLd: JsonLd[]
}

function parseJsonLd(helmet: HelmetServerState | null | undefined): JsonLd[] {
  const scripts = helmet?.script.toString() ?? ''
  return [...scripts.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1] ?? '{}') as JsonLd)
}

/**
 * Renders a public page the way the prerender does, for tests that check what
 * a crawler is handed. Tests using it must run in the node environment.
 *
 * Routes App.tsx loads lazily cannot be awaited by a synchronous render; pass
 * such a page as `page` to render it directly at that URL.
 */
export async function renderPublicPage(route: string, page?: ReactElement): Promise<RenderedPage> {
  const helmetContext: { helmet?: HelmetServerState | null } = {}
  await preloadRoute(route)
  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <AuthProvider>
        <SubscriptionProvider>
          <StaffAuthProvider>
            <MotionProvider>
              <StaticRouter location={route}>{page ?? <AppRoutes />}</StaticRouter>
            </MotionProvider>
          </StaffAuthProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </HelmetProvider>,
  )
  return { html, jsonLd: parseJsonLd(helmetContext.helmet) }
}
