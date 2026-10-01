import { Writable } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async'
import { StaticRouter } from 'react-router-dom/server'
import { AppRoutes } from './App'
import { MotionProvider } from './src/components/MotionProvider'
import { AuthProvider } from './src/hooks/useAuth'
import { StaffAuthProvider } from './src/hooks/useStaffAuth'
import { SubscriptionProvider } from './src/hooks/useSubscription'
import { getAllPosts, getAllSlugs } from './src/content/blog/registry'
import { PRERENDERED_STATIC_ROUTES, buildLlmsTxt, buildRobotsTxt, buildSitemapXml, sitemapEntries } from './src/lib/crawl-files'
import { WHAT_IS_VYOSTRA } from './src/components/landing/WhatIsVyostra'
import { PRICING_TIERS } from './src/lib/pricingTiers'
import { postDescription } from './src/lib/search-snippet'
import { SUPPORT_EMAIL } from './src/lib/structured-data'
import { SITE_URL } from './src/lib/site'

export { SITE_URL }

/**
 * The URL rendered into dist/404.html. It matches no route in App.tsx, so it
 * falls through to the catch-all and renders the same NotFound page a visitor gets
 * client-side. The path itself never appears anywhere -- only the output file
 * does, and S3 serves that as the website ErrorDocument.
 */
export const NOT_FOUND_RENDER_PATH = '/__not-found__'

/**
 * SSR entry used only at build time by scripts/prerender.mjs.
 *
 * The site ships as a client-rendered SPA; this exists so the public pages
 * also land in dist/ as real static HTML, which is what search crawlers and
 * link-preview scrapers (which never run JS) actually read.
 *
 * It renders App.tsx's own route tree, under the same providers as main.tsx,
 * because the browser HYDRATES this markup: a tree that differs from the
 * client's is a hydration error, and React recovers from one by throwing the
 * prerendered page away and rendering it again. Which routes are written to
 * disk is decided by getRoutes() below, not by what is mounted.
 *
 * The homepage is the page most likely to rank and the one AI crawlers most
 * often fetch. The legal pages matter for a
 * different reader than crawlers: Meta App Review fetches the Privacy Policy and
 * Terms URLs declared in App Settings, and a client-rendered page answers that
 * fetch with an empty <div id="root"> -- a documented App Review rejection, even
 * though a human in a browser sees the full policy. Both pages touch window/
 * document only inside useEffect, which never runs during SSR, so they render
 * cleanly in Node.
 *
 * /data-deletion-status is deliberately NOT prerendered: its content is fetched
 * per confirmation code at runtime, so a static render would only ever emit the
 * empty state. Meta is given the callback endpoint, not this page.
 *
 * The authenticated dashboard and auth pages are mounted (they are part of the
 * one tree) but never rendered: they are lazy, and no prerendered URL matches
 * them, so their code is never loaded in Node.
 */

// react-helmet-async decides between its client and server dispatcher off this
// flag; without it the head tags never reach the server state object.
HelmetProvider.canUseDOM = false

/**
 * Removes the NUL bytes react-dom's stream writer leaves in its output.
 *
 * It encodes into a fixed 2048-byte view, and when a multi-byte character does
 * not fit in what is left, it flushes the WHOLE view -- unfilled tail included
 * -- before starting the next one (writeStringChunk, react-dom 18.3.1). So a
 * curly quote or a rupee sign that happens to land on a boundary ships one or
 * two zero bytes in front of it. Which page is hit changes with every edit to
 * the markup above it. HTML never contains a NUL, so dropping them is lossless.
 */
function stripStreamPadding(html: string): string {
  return html.replaceAll('\0', '')
}

/** Renders one route to fully-resolved HTML plus its <head> tags. */
export async function renderRoute(url: string): Promise<{ html: string; head: string }> {
  const helmetContext: { helmet?: HelmetServerState | null } = {}

  // The same providers, in the same order, as main.tsx: the browser hydrates
  // this markup, so the two trees have to agree.
  const app = (
    <HelmetProvider context={helmetContext}>
      <AuthProvider>
        <SubscriptionProvider>
          <StaffAuthProvider>
            <MotionProvider>
              <StaticRouter location={url}>
                <AppRoutes />
              </StaticRouter>
            </MotionProvider>
          </StaffAuthProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </HelmetProvider>
  )

  const html = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []

    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk))
        callback()
      },
    })

    sink.on('finish', () => resolve(stripStreamPadding(Buffer.concat(chunks).toString('utf8'))))
    sink.on('error', reject)

    // onAllReady (not onShellReady) so lazy post bodies inside <Suspense>
    // are fully resolved in the output rather than emitting the skeleton.
    const { pipe, abort } = renderToPipeableStream(app, {
      onAllReady() {
        pipe(sink)
      },
      onError(error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    })

    const timeout = setTimeout(() => {
      abort()
      reject(new Error(`Prerender timed out after 20s for route ${url}`))
    }, 20_000)

    sink.on('finish', () => clearTimeout(timeout))
  })

  const helmet = helmetContext.helmet
  const head = helmet
    ? [helmet.title.toString(), helmet.meta.toString(), helmet.link.toString(), helmet.script.toString()]
        .filter(Boolean)
        .join('\n    ')
    : ''

  return { html, head }
}

/**
 * Every route the prerender script should emit.
 *
 * The providers above are safe in Node only because each touches
 * sessionStorage and the API inside effects, which never run during SSR -- a
 * provider that reads storage during render would break this build, and one
 * that renders differently from stored state would break hydration.
 *
 * A route rendered here must also render its FINAL state: see useStaticMotion()
 * in components/landing/motion-primitives.tsx for why entrance animations would
 * otherwise ship content at opacity 0.
 */
export function getRoutes(): string[] {
  return ['/', ...PRERENDERED_STATIC_ROUTES, ...getAllSlugs().map((slug) => `/blog/${slug}`)]
}

/** robots.txt, sitemap.xml and llms.txt contents, keyed by the file name to write under dist/. */
export function getCrawlFiles(): Record<string, string> {
  const metas = getAllPosts().map(({ meta }) => meta)
  const posts = metas.map((meta) => ({ slug: meta.slug, publishedAt: meta.publishedAt, updatedAt: meta.updatedAt }))
  const summaries = metas.map((meta) => ({ slug: meta.slug, title: meta.title, description: postDescription(meta) }))
  return {
    'robots.txt': buildRobotsTxt(SITE_URL),
    'sitemap.xml': buildSitemapXml(SITE_URL, sitemapEntries(posts)),
    // The definition is the homepage's own "What is Vyostra AI?" block, so the
    // file cannot describe the product differently from the page it points at.
    'llms.txt': buildLlmsTxt(SITE_URL, { definition: WHAT_IS_VYOSTRA, tiers: PRICING_TIERS, posts: summaries, supportEmail: SUPPORT_EMAIL }),
  }
}
