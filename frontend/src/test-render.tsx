import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async'
import { StaticRouter } from 'react-router-dom/server'
import { AppRoutes, preloadRoute } from '../App'
import { MotionProvider } from './components/MotionProvider'
import { AuthProvider } from './hooks/useAuth'
import { StaffAuthProvider } from './hooks/useStaffAuth'
import { SubscriptionProvider } from './hooks/useSubscription'
import type { JsonLd, JsonValue } from './lib/structured-data'

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

/** A page's visible text, tags and React's comment markers removed, entities decoded. */
export function plainText(html: string): string {
  const text = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ')
  return text.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

/** The paragraph directly under the page's h1. */
export function openingParagraph(html: string): string {
  return plainText(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '')
}

/** The page's h2 headings that are phrased as questions. */
export function questionHeadings(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => plainText(match[1] ?? '')).filter((heading) => heading.endsWith('?'))
}

export function asRecord(value: JsonValue | undefined): JsonLd {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected an object')
  return value
}

export function asArray(value: JsonValue | undefined): JsonValue[] {
  if (!Array.isArray(value)) throw new Error('expected an array')
  return value
}

/** Every question and answer the page publishes as FAQPage schema. */
export function publishedFaqText(jsonLd: JsonLd[]): string[] {
  const nodes = jsonLd.flatMap((block) => asArray(block['@graph']).map(asRecord))
  const questions = nodes.filter((node) => node['@type'] === 'FAQPage').flatMap((node) => asArray(node.mainEntity).map(asRecord))
  return questions.flatMap((question) => [String(question.name), String(asRecord(question.acceptedAnswer).text)])
}
