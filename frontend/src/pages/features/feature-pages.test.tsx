// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PRERENDERED_STATIC_ROUTES } from '../../lib/crawl-files'
import { openingParagraph, plainText, publishedFaqText, questionHeadings, renderPublicPage } from '../../test-render'

/**
 * What makes a feature page quotable by a search or answer engine: it says
 * what the feature is straight away, its headings are the questions a buyer
 * asks, and its FAQ schema repeats only what the page shows. Four of these
 * pages shipped with none of the three, so each is checked on the rendered page.
 */

const FEATURE_PAGES = PRERENDERED_STATIC_ROUTES.filter((route) => route.startsWith('/features/'))

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
})
