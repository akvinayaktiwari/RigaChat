import { describe, expect, it } from 'vitest'
import appSource from '../../App.tsx?raw'
import viewerRequestSource from '../../../deploy/cloudfront/viewer-request.js?raw'
import {
  PRERENDERED_STATIC_ROUTES,
  SPA_MARKETING_ROUTES,
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

  it.each(['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'])(
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

  it('dates blog posts from publishedAt and nothing else', () => {
    expect(entries.find((entry) => entry.path === '/blog/a-post/')?.lastModified).toBe('2026-08-01')
    expect(entries.find((entry) => entry.path === '/')?.lastModified).toBeUndefined()
  })

  it('has no duplicate URLs', () => {
    expect(new Set(paths).size).toBe(paths.length)
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
