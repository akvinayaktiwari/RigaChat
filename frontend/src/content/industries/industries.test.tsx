// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { getPostBySlug } from '../blog/registry'
import { PRERENDERED_STATIC_ROUTES } from '../../lib/crawl-files'
import { absoluteUrl } from '../../lib/site'
import { asArray, asRecord, openingParagraph, plainText, publishedFaqText, questionHeadings, renderPublicPage } from '../../test-render'
import { INDUSTRIES, industryPath } from './registry'

/**
 * An industry page earns its place only by saying what the product does for
 * that industry and nobody else's. The checks below are the ones a page made
 * by swapping a name into another page's copy would fail.
 */

describe('the industries registry', () => {
  it('gives every industry its own slug and a prerendered route', () => {
    const slugs = INDUSTRIES.map((industry) => industry.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.filter((slug) => !PRERENDERED_STATIC_ROUTES.includes(`/industries/${slug}`))).toEqual([])
  })

  // The opening answer is the passage a search or answer engine lifts. Two
  // industries sharing one is the signature of a templated page.
  it('gives no two industries the same opening answer', () => {
    const intros = INDUSTRIES.map((industry) => industry.answerFirstIntro)
    expect(new Set(intros).size).toBe(intros.length)
  })

  it.each(INDUSTRIES.map((industry) => [industry.slug, industry] as const))('%s fits a search result', (_slug, industry) => {
    expect(industry.title.length).toBeLessThanOrEqual(60)
    expect(industry.description.length).toBeLessThanOrEqual(160)
  })

  it.each(INDUSTRIES.map((industry) => [industry.slug, industry] as const))('%s says what it asks, what it does and where it stops', (_slug, industry) => {
    expect(industry.qualifying.questions.length).toBeGreaterThanOrEqual(3)
    expect(industry.sampleFlow.steps.length).toBeGreaterThanOrEqual(3)
    expect(industry.limits.points.length).toBeGreaterThanOrEqual(3)
  })

  it.each(INDUSTRIES.map((industry) => [industry.slug, industry] as const))('%s links only posts that are published', (_slug, industry) => {
    expect(industry.relatedPosts.length).toBeGreaterThanOrEqual(1)
    expect(industry.relatedPosts.filter((slug) => !getPostBySlug(slug))).toEqual([])
  })
})

describe.each(INDUSTRIES.map((industry) => [industry.slug, industry] as const))('/industries/%s', (slug, industry) => {
  const route = `/industries/${slug}`

  it('opens with a 40 to 70 word answer that names Vyostra AI', async () => {
    const opening = openingParagraph((await renderPublicPage(route)).html)
    expect(opening).toMatch(/^Vyostra AI /)
    expect(opening.split(' ').length).toBeGreaterThanOrEqual(40)
    expect(opening.split(' ').length).toBeLessThanOrEqual(70)
  })

  it('heads its sections with the questions they answer', async () => {
    expect(questionHeadings((await renderPublicPage(route)).html).length).toBeGreaterThanOrEqual(4)
  })

  it('publishes FAQ schema only for questions and answers the page shows', async () => {
    const { html, jsonLd } = await renderPublicPage(route)
    const published = publishedFaqText(jsonLd)
    expect(published.length).toBe(industry.faqs.length * 2)
    expect(published.filter((text) => !plainText(html).includes(text))).toEqual([])
  })

  it('describes itself at the URL it is served on, one crumb below Home', async () => {
    const { jsonLd } = await renderPublicPage(route)
    const nodes = jsonLd.flatMap((block) => asArray(block['@graph']).map(asRecord))
    const crumbs = asArray(nodes.find((node) => node['@type'] === 'BreadcrumbList')?.itemListElement).map((item) => asRecord(item).item)
    expect(crumbs).toEqual([absoluteUrl('/'), absoluteUrl(industryPath(industry))])
    expect(nodes.find((node) => node['@type'] === 'WebPage')?.url).toBe(absoluteUrl(industryPath(industry)))
  })

  it('links each related post at its served URL', async () => {
    const { html } = await renderPublicPage(route)
    expect(industry.relatedPosts.filter((post) => !html.includes(`href="/blog/${post}/"`))).toEqual([])
  })
})
