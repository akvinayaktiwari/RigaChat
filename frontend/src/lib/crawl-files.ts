/**
 * robots.txt, sitemap.xml and llms.txt, generated at build time by
 * scripts/prerender.mjs.
 *
 * Generated rather than dropped in public/ because all three need the absolute
 * site origin (see ./site.ts) and the sitemap and llms.txt need the blog's
 * slugs, neither of which a static file can know.
 */
import type { PricingTier } from './pricingTiers'

/** Marketing routes rendered client-side. Served at the bare path, no trailing slash. */
export const SPA_MARKETING_ROUTES: readonly string[] = [
  '/',
]

/** The llms.txt heading a page is listed under. "Optional" is the spec's name for skippable links. */
export type LlmsSection = 'Product' | 'Pricing' | 'Blog' | 'Company' | 'Optional'

export interface StaticPage {
  /**
   * Written without the trailing slash because that is how React Router and
   * prerender-entry.tsx name it; see servedPath() for the URL S3 answers on.
   */
  route: string
  /** Link text in llms.txt. */
  label: string
  /** One line on what the page answers, for llms.txt. Must be true of the page. */
  summary: string
  section: LlmsSection
}

/**
 * Every page prerendered into dist/<route>/index.html, besides the homepage and
 * the blog posts. One list, so the sitemap, llms.txt and the prerender cannot
 * disagree about which pages exist.
 */
export const STATIC_PAGES: readonly StaticPage[] = [
  { route: '/features', label: 'Features', summary: 'Every live feature of Vyostra AI on one page.', section: 'Product' },
  {
    route: '/features/chatbot',
    label: 'AI Agent',
    summary: 'The website chat agent: trained on your site, embedded with one script tag, captures leads at any hour.',
    section: 'Product',
  },
  {
    route: '/features/whatsapp',
    label: 'WhatsApp',
    summary: 'Instant WhatsApp alerts for each new lead and a weekly report, sent through Gupshup.',
    section: 'Product',
  },
  {
    route: '/features/crm',
    label: 'Lead CRM',
    summary: 'The built-in lead CRM: every captured lead stored, filterable, and synced to Zoho CRM.',
    section: 'Product',
  },
  {
    route: '/features/forms',
    label: 'Form Builder',
    summary: 'Embeddable lead capture forms whose submissions land in the same CRM.',
    section: 'Product',
  },
  {
    route: '/pricing',
    label: 'Pricing',
    summary: 'The three plans, what each includes, billing in USD or INR, and the 14-day free trial.',
    section: 'Pricing',
  },
  { route: '/about-us', label: 'About Vyostra AI', summary: 'Who builds Vyostra AI and where: the founders, in Bangalore.', section: 'Company' },
  { route: '/help', label: 'Help Center', summary: 'Setup answers: embedding the widget, the knowledge base, WhatsApp, Zoho CRM, forms, billing.', section: 'Company' },
  { route: '/contact', label: 'Contact', summary: 'Reach sales or support; the team replies within 24 hours.', section: 'Company' },
  { route: '/careers', label: 'Careers', summary: 'Working at Vyostra AI, a fully remote team.', section: 'Company' },
  { route: '/blog', label: 'All articles', summary: 'The blog index, newest first.', section: 'Blog' },
  { route: '/privacy-policy', label: 'Privacy Policy', summary: 'What data Vyostra AI collects and how it is handled.', section: 'Optional' },
  { route: '/terms-of-service', label: 'Terms of Service', summary: 'The terms that govern use of Vyostra AI.', section: 'Optional' },
]

/** The routes of STATIC_PAGES, for callers that only need to know which pages exist. */
export const PRERENDERED_STATIC_ROUTES: readonly string[] = STATIC_PAGES.map((page) => page.route)

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
  /** Last substantial revision, when there has been one. */
  updatedAt?: string
}

/** Every public, indexable URL: SPA marketing pages, prerendered pages, blog posts. */
export function sitemapEntries(posts: readonly PostDate[]): SitemapEntry[] {
  const spa = SPA_MARKETING_ROUTES.map((path) => ({ path }))
  const prerendered = PRERENDERED_STATIC_ROUTES.map((route) => ({ path: servedPath(route) }))
  const blog = posts.map((post) => ({ path: servedPath(`/blog/${post.slug}`), lastModified: post.updatedAt ?? post.publishedAt }))
  return [...spa, ...prerendered, ...blog]
}

export interface PostSummary {
  slug: string
  title: string
  /** The post's meta description: one or two sentences that stand alone. */
  description: string
}

export interface LlmsTxtInput {
  /** The product definition, one paragraph per entry. The first becomes the summary blockquote. */
  definition: readonly string[]
  tiers: readonly PricingTier[]
  posts: readonly PostSummary[]
  supportEmail: string
}

function llmsLink(origin: string, path: string, label: string, summary: string): string {
  return `- [${label}](${origin}${path}): ${summary}`
}

function llmsSection(heading: string, lines: readonly string[]): string {
  return [`## ${heading}`, '', ...lines].join('\n')
}

function llmsPageLinks(origin: string, section: LlmsSection): string[] {
  return STATIC_PAGES.filter((page) => page.section === section).map((page) =>
    llmsLink(origin, servedPath(page.route), page.label, page.summary),
  )
}

/** USD only: it is the one price list, and the currency the page's own schema publishes. */
function llmsPlanLine(tier: PricingTier): string {
  return `- ${tier.name}: $${tier.priceUsd} per month. ${tier.description} Includes ${tier.features.join(', ')}.`
}

/**
 * llms.txt (llmstxt.org): a markdown map of the site for language models.
 *
 * Built from STATIC_PAGES and the blog registry, so it lists exactly the URLs
 * the sitemap does. Google has said it does not use this file; it is here for
 * the answer engines that fetch it, and costs nothing to keep true.
 */
export function buildLlmsTxt(origin: string, input: LlmsTxtInput): string {
  const [summary = '', ...detail] = input.definition
  const product = [llmsLink(origin, '/', 'Vyostra AI', 'What the product is, how it works, and the plans.'), ...llmsPageLinks(origin, 'Product')]
  const posts = input.posts.map((post) => llmsLink(origin, servedPath(`/blog/${post.slug}`), post.title, post.description))

  const blocks = [
    '# Vyostra AI',
    `> ${summary}`,
    ...detail,
    llmsSection('Product', product),
    llmsSection('Pricing', [...llmsPageLinks(origin, 'Pricing'), ...input.tiers.map(llmsPlanLine)]),
    llmsSection('Blog', [...llmsPageLinks(origin, 'Blog'), ...posts]),
    llmsSection('Company', [...llmsPageLinks(origin, 'Company'), `- Support: ${input.supportEmail}`]),
    llmsSection('Optional', llmsPageLinks(origin, 'Optional')),
  ]
  return `${blocks.join('\n\n')}\n`
}
