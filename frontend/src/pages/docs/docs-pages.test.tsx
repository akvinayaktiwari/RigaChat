// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getAllDocMetas } from '../../content/docs/registry'
import { renderPublicPage } from '../../test-render'
import type { JsonLd } from '../../lib/structured-data'

/**
 * What a crawler is handed for a docs page. These pages exist to be read
 * without JavaScript, so the checks are on the server-rendered HTML.
 */

function graphTypes(jsonLd: readonly JsonLd[]): string[] {
  return jsonLd.flatMap((block) => (Array.isArray(block['@graph']) ? block['@graph'] : [])).map((node) => String((node as JsonLd)['@type']))
}

describe('/docs', () => {
  it('links every docs page from the server-rendered HTML', async () => {
    const { html } = await renderPublicPage('/docs')
    const missing = getAllDocMetas().filter((meta) => !html.includes(`href="/docs/${meta.slug}/"`))
    expect(missing).toEqual([])
    expect(html).toContain('<h1')
  })
})

describe.each(getAllDocMetas().map((meta) => [meta.slug, meta] as const))('/docs/%s', (slug, meta) => {
  it('renders its answer, body and code without JavaScript', async () => {
    const { html } = await renderPublicPage(`/docs/${slug}`)
    // React escapes apostrophes and ampersands; compare on a stretch with neither.
    expect(html).toContain(meta.lead.split(/['&]/)[0])
    expect(html).toContain('<pre')
    expect(html).not.toContain('aria-label="Loading page"')
    expect(html).not.toMatch(/opacity:\s*0[;"]/)
  })

  // A link to a docs page that does not exist is a 200 with a "not found"
  // body, which is what a crawler following it would index.
  it('links only to docs pages that exist, at the URL they are served on', async () => {
    const { html } = await renderPublicPage(`/docs/${slug}`)
    const slugs = new Set(getAllDocMetas().map((doc) => doc.slug))
    const links = [...html.matchAll(/href="(\/docs\/[^"]*)"/g)].map((match) => match[1] ?? '')
    expect(links.length).toBeGreaterThan(0)
    const broken = links.filter((link) => link !== '/docs/' && (!/^\/docs\/[a-z0-9-]+\/$/.test(link) || !slugs.has(link.split('/')[2] ?? '')))
    expect(broken).toEqual([])
  })

  // Question headings are what a query is matched against.
  it('uses question headings for its sections', async () => {
    const { html } = await renderPublicPage(`/docs/${slug}`)
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((match) => match[1] ?? '').filter((heading) => heading !== 'Common questions')
    expect(headings.length).toBeGreaterThanOrEqual(3)
    expect(headings.filter((heading) => !heading.endsWith('?'))).toEqual([])
  })

  it('never prints a real key or the API host in an example', async () => {
    const { html } = await renderPublicPage(`/docs/${slug}`)
    expect(html).not.toMatch(/vy_live_[0-9a-f]{48}/)
    expect(html).not.toMatch(/lambda-url|amazonaws\.com/)
  })

  it('has exactly one h1', async () => {
    const { html } = await renderPublicPage(`/docs/${slug}`)
    expect(html.match(/<h1/g)?.length).toBe(1)
  })

  it('publishes TechArticle, breadcrumb and FAQ schema for what the page shows', async () => {
    const { html, jsonLd } = await renderPublicPage(`/docs/${slug}`)
    const types = graphTypes(jsonLd)
    expect(types).toEqual(expect.arrayContaining(['Organization', 'TechArticle', 'BreadcrumbList']))
    expect(types.includes('FAQPage')).toBe(Boolean(meta.faq?.length))
    // Schema may only say what the page shows.
    for (const item of meta.faq ?? []) {
      expect(html).toContain(item.question.split(/['&]/)[0])
    }
  })
})
