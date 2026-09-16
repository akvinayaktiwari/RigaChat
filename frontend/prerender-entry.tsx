import { Writable } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'
import { HelmetProvider, type HelmetServerState } from 'react-helmet-async'
import { Route, Routes } from 'react-router-dom'
import { StaticRouter } from 'react-router-dom/server'
import BlogIndex from './src/pages/BlogIndex'
import LandingPage from './src/pages/LandingPage'
import Features from './src/pages/Features'
import Chatbot from './src/pages/features/Chatbot'
import WhatsAppFeature from './src/pages/features/WhatsApp'
import Crm from './src/pages/features/Crm'
import Forms from './src/pages/features/Forms'
import About from './src/pages/About'
import Help from './src/pages/Help'
import Contact from './src/pages/Contact'
import Careers from './src/pages/Careers'
import { AuthProvider } from './src/hooks/useAuth'
import { SubscriptionProvider } from './src/hooks/useSubscription'
import BlogPost from './src/pages/BlogPost'
import Privacy from './src/pages/Privacy'
import Terms from './src/pages/Terms'
import { getAllPosts, getAllSlugs } from './src/content/blog/registry'
import { PRERENDERED_STATIC_ROUTES, buildRobotsTxt, buildSitemapXml, sitemapEntries } from './src/lib/crawl-files'
import { SITE_URL } from './src/lib/site'

export { SITE_URL }

/**
 * SSR entry used only at build time by scripts/prerender.mjs.
 *
 * The site ships as a client-rendered SPA; this exists so blog routes also
 * land in dist/ as real static HTML, which is what search crawlers and
 * link-preview scrapers (which never run JS) actually read.
 *
 * The homepage, the feature and company pages, blog routes and the two legal
 * pages are mounted. The homepage is
 * the page most likely to rank and the one AI crawlers most often fetch. The legal pages matter for a
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
 * The authenticated dashboard and auth pages stay out -- prerendering them would
 * be pointless and would drag Cognito/browser-only code into a Node render.
 */

// react-helmet-async decides between its client and server dispatcher off this
// flag; without it the head tags never reach the server state object.
HelmetProvider.canUseDOM = false

/** Renders one route to fully-resolved HTML plus its <head> tags. */
export async function renderRoute(url: string): Promise<{ html: string; head: string }> {
  const helmetContext: { helmet?: HelmetServerState | null } = {}

  const app = (
    <HelmetProvider context={helmetContext}>
      <AuthProvider>
        <SubscriptionProvider>
          <StaticRouter location={url}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/features" element={<Features />} />
              <Route path="/features/chatbot" element={<Chatbot />} />
              <Route path="/features/whatsapp" element={<WhatsAppFeature />} />
              <Route path="/features/crm" element={<Crm />} />
              <Route path="/features/forms" element={<Forms />} />
              <Route path="/about-us" element={<About />} />
              <Route path="/help" element={<Help />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/careers" element={<Careers />} />
              <Route path="/blog" element={<BlogIndex />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/privacy-policy" element={<Privacy />} />
              <Route path="/terms-of-service" element={<Terms />} />
            </Routes>
          </StaticRouter>
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

    sink.on('finish', () => resolve(Buffer.concat(chunks).toString('utf8')))
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
 * The tree above is wrapped in AuthProvider and SubscriptionProvider because
 * the landing page reaches useSubscription() through useTierCheckout. That is
 * safe in Node only because both providers touch sessionStorage and the API
 * inside effects, which never run during SSR -- a provider that reads storage
 * during render would break this build. StaffAuthProvider is left out: no
 * prerendered route uses it.
 *
 * A route rendered here must also render its FINAL state: see useStaticMotion()
 * in components/landing/motion-primitives.tsx for why entrance animations would
 * otherwise ship content at opacity 0.
 */
export function getRoutes(): string[] {
  return ['/', ...PRERENDERED_STATIC_ROUTES, ...getAllSlugs().map((slug) => `/blog/${slug}`)]
}

/** robots.txt and sitemap.xml contents, keyed by the file name to write under dist/. */
export function getCrawlFiles(): Record<string, string> {
  const posts = getAllPosts().map(({ meta }) => ({ slug: meta.slug, publishedAt: meta.publishedAt }))
  return {
    'robots.txt': buildRobotsTxt(SITE_URL),
    'sitemap.xml': buildSitemapXml(SITE_URL, sitemapEntries(posts)),
  }
}
