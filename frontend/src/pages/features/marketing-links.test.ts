import { describe, expect, it } from 'vitest'
import appSource from '../../../App.tsx?raw'

/**
 * Every internal link on the marketing pages must point at a route App.tsx
 * actually mounts.
 *
 * The SPA cannot 404: CloudFront rewrites any unknown extensionless path to
 * index.html, so a link to a route that does not exist renders a blank page with
 * a 200. That is how /features/agent shipped from four pages while the route was
 * /features/chatbot -- nothing failed, and crawlers indexed an empty page.
 */

const marketingSources: Record<string, string> = {
  ...import.meta.glob<string>('../Features.tsx', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>(['./*.tsx', '!./*.test.tsx'], { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob<string>(['../../components/landing/**/*.tsx', '!../../components/landing/**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }),
}

/** Top-level absolute route paths declared in App.tsx, e.g. "/features/crm". */
function mountedRoutes(): Set<string> {
  const paths = [...appSource.matchAll(/<Route\s+path="(\/[^"]*)"/g)].map((match) => match[1] ?? '')
  return new Set(paths)
}

/** Literal internal hrefs ("/x", not "/#section" or template strings). */
function internalHrefs(source: string): string[] {
  const matches = source.matchAll(/(?:href|to)(?:=|:\s*)["'](\/[^"'#?]+)["']/g)
  return [...matches].map((match) => match[1] ?? '')
}

describe('marketing page links', () => {
  const routes = mountedRoutes()
  const files = Object.entries(marketingSources)

  it('finds the routes and the files it is meant to check', () => {
    expect(routes.has('/features/chatbot')).toBe(true)
    expect(files.length).toBeGreaterThan(5)
  })

  it.each(files)('%s links only to mounted routes', (_file, source) => {
    const broken = internalHrefs(source).filter((href) => !routes.has(href))
    expect(broken).toEqual([])
  })

  // A bare "#" is a crawl dead end and reads as unfinished. The footer shipped
  // Changelog and Security that way while /help, a real page, had no link at all.
  it.each(files)('%s has no placeholder "#" links', (_file, source) => {
    expect(source).not.toMatch(/href(?:=|:\s*)["']#["']/)
  })
})
