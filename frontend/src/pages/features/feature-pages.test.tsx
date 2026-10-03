// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PRERENDERED_STATIC_ROUTES, servedPath } from '../../lib/crawl-files'
import { absoluteUrl } from '../../lib/site'
import type { JsonLd } from '../../lib/structured-data'
import { asArray, asRecord, openingParagraph, plainText, publishedFaqText, questionHeadings, renderPublicPage } from '../../test-render'

/**
 * What makes a feature page quotable by a search or answer engine: it says
 * what the feature is straight away, its headings are the questions a buyer
 * asks, and its FAQ schema repeats only what the page shows. Four of these
 * pages shipped with none of the three, so each is checked on the rendered page.
 */

const FEATURE_PAGES = PRERENDERED_STATIC_ROUTES.filter((route) => route.startsWith('/features/'))

/** The URLs the page's schema gives for itself: its WebPage node and the last crumb of its trail. */
function publishedPageUrls(jsonLd: JsonLd[]): string[] {
  const nodes = jsonLd.flatMap((block) => asArray(block['@graph']).map(asRecord))
  const pages = nodes.filter((node) => node['@type'] === 'WebPage').map((node) => String(node.url))
  const trails = nodes.filter((node) => node['@type'] === 'BreadcrumbList').map((node) => asArray(node.itemListElement).map(asRecord))
  return [...pages, ...trails.map((trail) => String(trail.at(-1)?.item))]
}

it('finds the feature pages it checks', () => {
  expect(FEATURE_PAGES).toContain('/features/crm')
  expect(FEATURE_PAGES.length).toBeGreaterThan(4)
})

describe.each(FEATURE_PAGES)('%s', (route) => {
  it('opens with a 40 to 70 word answer that names Vyostra AI', async () => {
    const opening = openingParagraph((await renderPublicPage(route)).html)
    expect(opening).toMatch(/^The Vyostra AI |^Vyostra AI /)
    expect(opening.split(' ').length).toBeGreaterThanOrEqual(40)
    expect(opening.split(' ').length).toBeLessThanOrEqual(70)
  })

  it('heads its sections with the questions they answer', async () => {
    expect(questionHeadings((await renderPublicPage(route)).html).length).toBeGreaterThanOrEqual(3)
  })

  // FAQ schema for text the page does not show is a spam-policy violation.
  it('publishes FAQ schema, and only for questions and answers the page shows', async () => {
    const { html, jsonLd } = await renderPublicPage(route)
    const published = publishedFaqText(jsonLd)
    const shown = plainText(html)
    expect(published.length).toBeGreaterThanOrEqual(6)
    expect(published.filter((text) => !shown.includes(text))).toEqual([])
  })

  // Each page hand-types its own path. A page copied from another that kept
  // the old PAGE.path, or dropped the trailing slash, would describe itself at
  // the wrong URL or at one that redirects.
  it('describes itself, in its schema, at the URL it is served on', async () => {
    const urls = publishedPageUrls((await renderPublicPage(route)).jsonLd)
    expect(urls).toEqual([absoluteUrl(servedPath(route)), absoluteUrl(servedPath(route))])
  })
})
