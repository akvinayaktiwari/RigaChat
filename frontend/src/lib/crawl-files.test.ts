import { describe, expect, it } from 'vitest'
import appSource from '../../App.tsx?raw'
import viewerRequestSource from '../../../deploy/cloudfront/viewer-request.js?raw'
import {
  PRERENDERED_STATIC_ROUTES,
  SPA_MARKETING_ROUTES,
  STATIC_PAGES,
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
  servedPath,
  sitemapEntries,
} from './crawl-files'

const ORIGIN = 'https://vyostra.com'

/** A robots.txt group is the block of lines between blank lines. */
function groupFor(robots: string, userAgent: string): string {
  const group = robots.split('\n\n').find((block) => block.split('\n').includes(`User-agent: ${userAgent}`))
  if (!group) throw new Error(`no robots.txt group for ${userAgent}`)
  return group
}

describe('buildRobotsTxt', () => {
  const robots = buildRobotsTxt(ORIGIN)

  it('advertises the sitemap at an absolute URL', () => {
    expect(robots).toContain('Sitemap: https://vyostra.com/sitemap.xml')
  })

  it.each([
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
  ])(
    'explicitly allows %s',
    (bot) => {
      expect(groupFor(robots, bot)).toContain('Allow: /')
    },
  )

  // A crawler matching a named group ignores `*`, so the AI group must carry
  // its own disallows or GPTBot would be free to crawl the dashboard.
  it('repeats the disallow list inside the AI crawler group', () => {
    expect(groupFor(robots, 'GPTBot')).toContain('Disallow: /dashboard')
    expect(groupFor(robots, '*')).toContain('Disallow: /dashboard')
  })

  it('never disallows the marketing site itself', () => {
    expect(robots).not.toMatch(/^Disallow: \/$/m)
  })
})

describe('sitemapEntries', () => {
  const entries = sitemapEntries([{ slug: 'a-post', publishedAt: '2026-08-01' }])
  const paths = entries.map((entry) => entry.path)

  it('lists prerendered pages at the trailing-slash URL S3 serves, not the one that 302s', () => {
    expect(paths).toContain('/blog/')
    expect(paths).toContain('/privacy-policy/')
    expect(paths).not.toContain('/blog')
  })

  it('dates blog posts from publishedAt', () => {
    expect(entries.find((entry) => entry.path === '/blog/a-post/')?.lastModified).toBe('2026-08-01')
  })

  // A URL with no lastmod gives a crawler no cue to refetch it.
  it('dates every URL', () => {
    expect(entries.filter((entry) => !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastModified ?? ''))).toEqual([])
  })

  // The homepage lists the latest posts, so a new post changes it too.
  it('dates the homepage from its newest post once that is later than its own copy', () => {
    const home = (posts: Parameters<typeof sitemapEntries>[0]) => sitemapEntries(posts).find((entry) => entry.path === '/')?.lastModified
    expect(home([{ slug: 'a-post', publishedAt: '2099-01-01' }])).toBe('2099-01-01')
    expect(home([{ slug: 'a-post', publishedAt: '2000-01-01' }])).not.toBe('2000-01-01')
  })

  // lastmod is the crawler's cue to refetch; a revised post left at its
  // publication date is a revision nobody is told about.
  it('dates a revised post from its revision', () => {
    const revised = sitemapEntries([{ slug: 'a-post', publishedAt: '2026-08-01', updatedAt: '2026-09-20' }])
    expect(revised.find((entry) => entry.path === '/blog/a-post/')?.lastModified).toBe('2026-09-20')
  })

  it('dates every static page from its own record', () => {
    const features = STATIC_PAGES.find((page) => page.route === '/features/crm')
    expect(entries.find((entry) => entry.path === '/features/crm/')?.lastModified).toBe(features?.lastModified)
  })

  // A new post changes the index page; the index must say so without anyone
  // remembering to bump its date.
  it('dates the blog index from its newest post', () => {
    const withNewPost = sitemapEntries([{ slug: 'a-post', publishedAt: '2099-01-01' }])
    expect(withNewPost.find((entry) => entry.path === '/blog/')?.lastModified).toBe('2099-01-01')
  })

  it('has no duplicate URLs', () => {
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('static page dates', () => {
  // One day of slack: a date written in India is already "tomorrow" in UTC
  // for the first five and a half hours of the day.
  const latestAllowed = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

  // A lastmod in the future, or one that is not a date, is one a crawler
  // learns to disregard along with every other date in the file.
  it.each(STATIC_PAGES.map((page) => [page.route, page.lastModified] as const))('%s has a real date that is not in the future', (_route, date) => {
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(date)
    expect(date <= latestAllowed).toBe(true)
  })
})

describe('route lists', () => {
  const mounted = new Set([...appSource.matchAll(/<Route\s+path="(\/[^"]*)"/g)].map((match) => match[1]))

  // A sitemap URL with no route is a blank 200 (the SPA cannot 404), which is
  // exactly what a sitemap must never hand a crawler.
  it.each([...SPA_MARKETING_ROUTES, ...PRERENDERED_STATIC_ROUTES])('%s is mounted in App.tsx', (route) => {
    expect(mounted.has(route)).toBe(true)
  })

  // A prerendered route the CloudFront function does not know about is rewritten
  // to the empty app shell, so its static HTML is written and never served.
  it.each(PRERENDERED_STATIC_ROUTES)('%s is a prerendered prefix in the CloudFront function', (route) => {
    const declaration = viewerRequestSource.match(/var PRERENDERED_PREFIXES = \[([^\]]*)\]/)
    const prefixes = [...(declaration?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
    expect(prefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))).toBe(true)
  })

  it('servedPath adds exactly one trailing slash', () => {
    expect(servedPath('/blog')).toBe('/blog/')
    expect(servedPath('/blog/')).toBe('/blog/')
  })
})

describe('buildSitemapXml', () => {
  it('writes absolute, escaped locations', () => {
    const xml = buildSitemapXml(ORIGIN, [{ path: '/a&b' }, { path: '/blog/', lastModified: '2026-08-01' }])
    expect(xml).toContain('<loc>https://vyostra.com/a&amp;b</loc>')
    expect(xml).toContain('<lastmod>2026-08-01</lastmod>')
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
  })
})

describe('buildLlmsTxt', () => {
  const posts = [{ slug: 'a-post', title: 'A post', description: 'What the post answers.' }]
  const tiers = [{ tier: 'starter' as const, name: 'Starter', priceUsd: 49, description: 'For one site.', features: ['1 agent', '50 CRM leads'] }]
  const llms = buildLlmsTxt(ORIGIN, {
    definition: ['Vyostra AI is a lead-capture platform.', 'It writes leads into a CRM.'],
    tiers,
    posts,
    supportEmail: 'support@vyostra.com',
  })

  it('opens with the name and the definition as the summary blockquote', () => {
    expect(llms.startsWith('# Vyostra AI\n\n> Vyostra AI is a lead-capture platform.\n\nIt writes leads into a CRM.\n')).toBe(true)
  })

  // A page in the sitemap and missing here is a page the two files disagree
  // about, which is the drift generating both from one list exists to prevent.
  it('links every URL the sitemap lists', () => {
    const sitemapPaths = sitemapEntries([{ slug: 'a-post', publishedAt: '2026-08-01' }]).map((entry) => entry.path)
    expect(sitemapPaths.filter((path) => !llms.includes(`](${ORIGIN}${path})`))).toEqual([])
  })

  it('states each plan at its price', () => {
    expect(llms).toContain('- Starter: $49 per month. For one site. Includes 1 agent, 50 CRM leads.')
  })

  it('describes a post in its own words', () => {
    expect(llms).toContain('- [A post](https://vyostra.com/blog/a-post/): What the post answers.')
  })
})
