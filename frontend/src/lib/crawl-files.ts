/**
 * robots.txt, sitemap.xml and llms.txt, generated at build time by
 * scripts/prerender.mjs.
 *
 * Generated rather than dropped in public/ because all three need the absolute
 * site origin (see ./site.ts) and the sitemap and llms.txt need the blog's
 * slugs, neither of which a static file can know.
 */
import { INDUSTRIES } from '../content/industries/registry'
import { INTEGRATIONS } from '../content/integrations/registry'
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
  /**
   * YYYY-MM-DD the page's content last changed; the sitemap's lastmod. Bump it
   * by hand when you change what the page says. Never derive it from the build
   * clock: that marks every page modified on every deploy, and a crawler that
   * sees dates move without content moving stops trusting all of them. A date
   * left stale only understates.
   */
  lastModified: string
}

/**
 * Every page prerendered into dist/<route>/index.html, besides the homepage and
 * the blog posts. One list, so the sitemap, llms.txt and the prerender cannot
 * disagree about which pages exist.
 */
export const STATIC_PAGES: readonly StaticPage[] = [
  { route: '/features', label: 'Features', summary: 'Every live feature of Vyostra AI on one page.', section: 'Product', lastModified: '2026-10-03' },
  {
    route: '/features/chatbot',
    label: 'AI Agent',
    summary: 'The website chat agent: trained on your site, embedded with one script tag, captures leads at any hour.',
    section: 'Product',
    lastModified: '2026-10-02',
  },
  {
    route: '/features/whatsapp',
    label: 'WhatsApp',
    summary: 'Instant WhatsApp alerts for each new lead and a weekly report, sent through Gupshup.',
    section: 'Product',
    lastModified: '2026-10-05',
  },
  {
    route: '/features/crm',
    label: 'Lead CRM',
    summary: 'The built-in lead CRM: every captured lead stored and filterable; form and Meta lead ad leads sync to Zoho CRM.',
    section: 'Product',
    lastModified: '2026-10-03',
  },
  {
    route: '/features/forms',
    label: 'Form Builder',
    summary: 'Embeddable lead capture forms whose submissions land in the same CRM.',
    section: 'Product',
    lastModified: '2026-10-02',
  },
  {
    route: '/features/voice-agent',
    label: 'AI Voice Agent',
    summary: 'The on-page voice agent: visitors talk to your site in the browser, with no phone number. An add-on.',
    section: 'Product',
    lastModified: '2026-10-02',
  },
  {
    route: '/features/zoho-crm',
    label: 'Zoho CRM Integration',
    summary: 'New leads from Vyostra AI lead forms and Meta lead ads created in Zoho CRM automatically; chat and voice leads are not synced.',
    section: 'Product',
    lastModified: '2026-10-03',
  },
  {
    route: '/pricing',
    label: 'Pricing',
    summary: 'The three plans, what each includes, billing in USD or INR, and the 14-day free trial.',
    section: 'Pricing',
    lastModified: '2026-10-02',
  },
  {
    route: '/faq',
    label: 'FAQ',
    summary: 'Short answers on what Vyostra AI is, setup, where leads go, WhatsApp follow-up and cost.',
    section: 'Product',
    lastModified: '2026-10-03',
  },
  {
    route: '/integrations',
    label: 'Integrations',
    summary: 'The tools Vyostra AI connects to today, and what each connection does.',
    section: 'Product',
    lastModified: '2026-10-02',
  },
  // One page per shipped integration, from the same content files the pages render.
  ...INTEGRATIONS.map(
    (integration): StaticPage => ({
      route: `/integrations/${integration.slug}`,
      label: `${integration.name} integration`,
      summary: integration.summary,
      section: 'Product',
      lastModified: integration.lastModified,
    }),
  ),
  // One page per industry, from the same content files the pages render.
  ...INDUSTRIES.map(
    (industry): StaticPage => ({
      route: `/industries/${industry.slug}`,
      label: `Vyostra AI for ${industry.name.toLowerCase()}`,
      summary: industry.summary,
      section: 'Product',
      lastModified: industry.lastModified,
    }),
  ),
  {
    route: '/whatsapp-link-generator',
    label: 'WhatsApp Link Generator',
    summary: 'A free tool that builds a wa.me click-to-chat link with a pre-filled message, in the browser.',
    section: 'Product',
    lastModified: '2026-10-02',
  },
  { route: '/about-us', label: 'About Vyostra AI', summary: 'Who builds Vyostra AI and where: the founders, in Bangalore.', section: 'Company', lastModified: '2026-10-01' },
  { route: '/help', label: 'Help Center', summary: 'Setup answers: embedding the widget, the knowledge base, WhatsApp, Zoho CRM, forms, billing.', section: 'Company', lastModified: '2026-10-03' },
  { route: '/contact', label: 'Contact', summary: 'Reach sales or support; the team replies within 24 hours.', section: 'Company', lastModified: '2026-09-20' },
  { route: '/careers', label: 'Careers', summary: 'Working at Vyostra AI, a fully remote team.', section: 'Company', lastModified: '2026-09-16' },
  { route: '/blog', label: 'All articles', summary: 'The blog index, newest first.', section: 'Blog', lastModified: '2026-09-15' },
  { route: '/privacy-policy', label: 'Privacy Policy', summary: 'What data Vyostra AI collects and how it is handled.', section: 'Optional', lastModified: '2026-09-15' },
  { route: '/terms-of-service', label: 'Terms of Service', summary: 'The terms that govern use of Vyostra AI.', section: 'Optional', lastModified: '2026-09-15' },
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
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Meta-ExternalAgent',
  'Amazonbot',
  'DuckAssistBot',
  'MistralAI-User',
  'CCBot',
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

const BLOG_INDEX_ROUTE = '/blog'

function postLastModified(post: PostDate): string {
  return post.updatedAt ?? post.publishedAt
}

/**
 * When the homepage's own copy last changed. Like a STATIC_PAGES date, bump it
 * by hand on a real content change -- never from the build clock, which would
 * tell crawlers every deploy rewrote the page.
 */
const HOME_LAST_MODIFIED = '2026-10-03'

/** Pages that list the newest posts change whenever one is published or revised. */
const LISTS_NEWEST_POSTS: readonly string[] = ['/', BLOG_INDEX_ROUTE]

/** A page's own date, or its newest post's where the page lists posts and that is later. */
function pageLastModified(route: string, ownDate: string, posts: readonly PostDate[]): string {
  if (!LISTS_NEWEST_POSTS.includes(route)) return ownDate
  // ISO dates sort as strings.
  return [ownDate, ...posts.map(postLastModified)].sort().at(-1) ?? ownDate
}

/** Every public, indexable URL: SPA marketing pages, prerendered pages, blog posts. */
export function sitemapEntries(posts: readonly PostDate[]): SitemapEntry[] {
  const spa = SPA_MARKETING_ROUTES.map((path) => ({ path, lastModified: pageLastModified(path, HOME_LAST_MODIFIED, posts) }))
  const prerendered = STATIC_PAGES.map((page) => ({
    path: servedPath(page.route),
    lastModified: pageLastModified(page.route, page.lastModified, posts),
  }))
  const blog = posts.map((post) => ({ path: servedPath(`/blog/${post.slug}`), lastModified: postLastModified(post) }))
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
