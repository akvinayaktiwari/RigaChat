/**
 * robots.txt and sitemap.xml, generated at build time by scripts/prerender.mjs.
 *
 * Generated rather than dropped in public/ because both need the absolute site
 * origin (see ./site.ts) and the sitemap needs the blog's slugs, neither of
 * which a static file can know.
 */

/** Marketing routes rendered client-side. Served at the bare path, no trailing slash. */
export const SPA_MARKETING_ROUTES: readonly string[] = [
  '/',
]

/**
 * Routes prerendered into dist/<route>/index.html, besides the blog posts.
 * Written without the trailing slash because that is how React Router and
 * prerender-entry.tsx name them; see servedPath() for the URL S3 answers on.
 */
export const PRERENDERED_STATIC_ROUTES: readonly string[] = [
  '/features',
  '/features/chatbot',
  '/features/whatsapp',
  '/features/crm',
  '/features/forms',
  '/about-us',
  '/help',
  '/contact',
  '/careers',
  '/blog',
  '/privacy-policy',
  '/terms-of-service',
]

/**
 * App areas no crawler has a reason to fetch. Disallowing them only saves crawl
 * budget -- anything that must stay out of the index needs noindex, which a
 * crawler can only read on a page it is allowed to fetch.
 */
const DISALLOWED_PATHS: readonly string[] = [
  '/dashboard',
  '/admin',
  '/auth/',
  '/l/',
  '/api/',
  '/widget-test',
  '/form-test',
  '/voice-test',
]

/**
 * AI crawlers named explicitly. A crawler that matches a named group ignores the
 * `*` group entirely, so each group repeats the disallow list rather than
 * inheriting it.
 */
const AI_CRAWLERS: readonly string[] = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'PerplexityBot',
  'Google-Extended',
]

export interface SitemapEntry {
  /** Path exactly as served, e.g. "/blog/" or "/features". */
  path: string
  /** YYYY-MM-DD. Omitted where there is no honest date to give. */
  lastModified?: string
}

/** A prerendered route is an S3 directory, served at its trailing-slash form. */
export function servedPath(prerenderedRoute: string): string {
  return prerenderedRoute.endsWith('/') ? prerenderedRoute : `${prerenderedRoute}/`
}

function robotsGroup(userAgents: readonly string[]): string {
  const agents = userAgents.map((agent) => `User-agent: ${agent}`)
  const disallows = DISALLOWED_PATHS.map((path) => `Disallow: ${path}`)
  return [...agents, 'Allow: /', ...disallows].join('\n')
}

export function buildRobotsTxt(origin: string): string {
  return [robotsGroup(['*']), robotsGroup(AI_CRAWLERS), `Sitemap: ${origin}/sitemap.xml`].join('\n\n') + '\n'
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function sitemapUrl(origin: string, entry: SitemapEntry): string {
  const loc = `    <loc>${escapeXml(`${origin}${entry.path}`)}</loc>`
  const lastmod = entry.lastModified ? `\n    <lastmod>${entry.lastModified}</lastmod>` : ''
  return `  <url>\n${loc}${lastmod}\n  </url>`
}

export function buildSitemapXml(origin: string, entries: readonly SitemapEntry[]): string {
  const urls = entries.map((entry) => sitemapUrl(origin, entry)).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

export interface PostDate {
  slug: string
  publishedAt: string
}

/** Every public, indexable URL: SPA marketing pages, prerendered pages, blog posts. */
export function sitemapEntries(posts: readonly PostDate[]): SitemapEntry[] {
  const spa = SPA_MARKETING_ROUTES.map((path) => ({ path }))
  const prerendered = PRERENDERED_STATIC_ROUTES.map((route) => ({ path: servedPath(route) }))
  const blog = posts.map((post) => ({ path: servedPath(`/blog/${post.slug}`), lastModified: post.publishedAt }))
  return [...spa, ...prerendered, ...blog]
}
