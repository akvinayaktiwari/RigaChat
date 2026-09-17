/**
 * Google Analytics 4 for the MARKETING site only.
 *
 * Three decisions worth knowing before changing anything here:
 *
 *  - The tag is loaded from TypeScript, not from a <script> in index.html.
 *    index.html is the prerender template (scripts/prerender.mjs injects into
 *    it), so a tag there would be baked into every prerendered page AND into
 *    app-shell.html, with no way to skip the signed-in app or to hold the tag
 *    back. Here we decide per page load.
 *
 *  - Signed-in app traffic is NOT tracked. Mixing dashboard usage into a
 *    marketing property makes every acquisition and conversion number
 *    meaningless, because the same person generates dozens of in-app views per
 *    session. Product usage belongs in a separate tool.
 *
 *  - An unset VITE_GA_MEASUREMENT_ID is a clean no-op, not an error. The
 *    variable is deliberately absent from the required-vars loop in
 *    scripts/deploy.sh, so analytics can never abort a production deploy.
 */

/** The shapes gtag.js actually accepts. Keeps the queue typed without `any`. */
type GtagCommand =
  | ['js', Date]
  | ['config', string, Record<string, unknown>]
  | ['event', string, Record<string, unknown>]
  | ['consent', 'default' | 'update', Record<string, string>]

interface GtagWindow extends Window {
  /**
   * Entries are `arguments` objects, NOT arrays -- see the note in
   * initAnalytics. GtagCommand still types every call, through gtag's
   * signature below; it is the queued shape that cannot be a plain array.
   */
  dataLayer?: IArguments[]
  gtag?: (...args: GtagCommand) => void
}

export const MEASUREMENT_ID: string = import.meta.env.VITE_GA_MEASUREMENT_ID ?? ''

/**
 * Route prefixes that never reach Google.
 *
 * `/l/` is a lead deep link that carries a lead reference in the path, and the
 * *-test routes render a client's widget against their own site. Neither is
 * marketing traffic, and both would put customer data in a page_path.
 */
const UNTRACKED_PREFIXES: readonly string[] = [
  '/dashboard',
  '/admin',
  '/l/',
  '/widget-test',
  '/form-test',
  '/voice-test',
]

/** False for the signed-in app, for lead links, and for widget test harnesses. */
export function isTrackedPath(pathname: string): boolean {
  return !UNTRACKED_PREFIXES.some((prefix) =>
    // A bare prefix must match a whole segment: "/admin" excludes "/admin" and
    // "/admin/login", but must not swallow a future "/administration" page.
    prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Whether this build should talk to Google at all.
 *
 * DEV is excluded because a developer with the id in their local .env would
 * otherwise file localhost sessions against the production property, where they
 * are indistinguishable from real visitors.
 */
export function isAnalyticsEnabled(): boolean {
  return MEASUREMENT_ID !== '' && !import.meta.env.DEV && typeof window !== 'undefined'
}

/**
 * Loads gtag.js once and configures it. Safe to call on every mount.
 *
 * `send_page_view: false` is essential: this app is a BrowserRouter SPA, so
 * GA4's own enhanced measurement would either miss client-side navigations or
 * double-count them against the wrong path. trackPageView() is the only thing
 * that reports a view, and it runs after React Router has settled on a route.
 */
export function initAnalytics(): void {
  if (!isAnalyticsEnabled()) return

  const w = window as GtagWindow
  if (w.gtag) return

  w.dataLayer = w.dataLayer ?? []
  // Google's own snippet is `function gtag(){dataLayer.push(arguments)}`, and
  // the `arguments` object is not incidental. gtag.js reads a dataLayer entry
  // as a command only when it is one -- it tests Object.prototype.toString for
  // "[object Arguments]", or an own `callee`. A plain array, which is all a
  // rest parameter ever is, falls into gtag's legacy "method.path" branch
  // instead and is discarded in silence: no config, no page views, no error in
  // the console. Hence a function expression reading `arguments`, and not the
  // arrow function that shipped first and measured nothing.
  const gtag: (...args: GtagCommand) => void = function (): void {
    w.dataLayer?.push(arguments)
  }
  w.gtag = gtag

  // We run no Google Ads and set no advertising cookies, so every ad signal is
  // denied outright rather than left at gtag's permissive default. This is not
  // a substitute for a consent banner -- flipping analytics_storage is what a
  // banner would do -- but it keeps the tag to first-party measurement only.
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  })

  gtag('js', new Date())
  gtag('config', MEASUREMENT_ID, { send_page_view: false })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`
  document.head.appendChild(script)
}

/**
 * GA4 event parameter values. gtag flattens anything it is handed, so nesting
 * an object or array here produces a parameter nobody can report on; the type
 * keeps that from compiling.
 */
export type EventParams = Record<string, string | number | boolean>

/**
 * Content grouping for a path.
 *
 * GA4's `content_group` is what turns a flat list of page paths into the row
 * "Blog: 3,104 views" without anyone maintaining a regex in the GA UI, where
 * it would silently stop matching the first time a route is renamed. Derived
 * from the path alone on purpose -- no page has to remember to declare it, and
 * a page that forgets still lands in a real group rather than "(not set)".
 */
export function contentGroupFor(pathname: string): string {
  const sections: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['Blog', ['/blog']],
    ['Features', ['/features']],
    ['Company', ['/about-us', '/contact', '/careers', '/help', '/system-status']],
    ['Legal', ['/privacy-policy', '/terms-of-service', '/data-deletion-status']],
    ['Account', ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/auth']],
  ]

  if (pathname === '/') return 'Home'

  for (const [group, prefixes] of sections) {
    if (prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
      return group
    }
  }

  return 'Other'
}

/**
 * Reports one page view for a marketing route.
 *
 * page_location is built from the origin and path rather than href on purpose:
 * it drops the query string, which on this site carries OAuth codes, Meta
 * redirect state and lead references that have no business leaving the browser.
 */
export function trackPageView(pathname: string, title: string): void {
  if (!isAnalyticsEnabled() || !isTrackedPath(pathname)) return

  const w = window as GtagWindow
  w.gtag?.('event', 'page_view', {
    page_path: pathname,
    page_location: `${window.location.origin}${pathname}`,
    page_title: title,
    content_group: contentGroupFor(pathname),
  })
}

/**
 * Reports a custom event for the page currently on screen.
 *
 * The path is re-checked here rather than trusted from the caller: an event
 * fired from a component that also renders inside the dashboard would
 * otherwise carry dashboard usage into the marketing property, which is the
 * one thing isTrackedPath exists to prevent.
 */
export function trackEvent(name: string, params: EventParams = {}): void {
  if (!isAnalyticsEnabled() || !isTrackedPath(window.location.pathname)) return

  const w = window as GtagWindow
  w.gtag?.('event', name, params)
}
