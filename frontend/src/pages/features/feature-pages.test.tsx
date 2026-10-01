// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PRERENDERED_STATIC_ROUTES } from '../../lib/crawl-files'
import type { JsonLd, JsonValue } from '../../lib/structured-data'
import { renderPublicPage } from '../../test-render'

/**
 * What makes a feature page quotable by a search or answer engine: it says
 * what the feature is straight away, its headings are the questions a buyer
 * asks, and its FAQ schema repeats only what the page shows. Four of these
 * pages shipped with none of the three, so each is checked on the rendered page.
 */

const FEATURE_PAGES = PRERENDERED_STATIC_ROUTES.filter((route) => route.startsWith('/features/'))

function plainText(html: string): string {
  const text = html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ')
  return text.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

/** The paragraph directly under the page's h1. */
function openingParagraph(html: string): string {
  return plainText(/<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '')
}

function questionHeadings(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((match) => plainText(match[1] ?? '')).filter((heading) => heading.endsWith('?'))
}

function asRecord(value: JsonValue | undefined): JsonLd {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected an object')
  return value
}

function asArray(value: JsonValue | undefined): JsonValue[] {
  if (!Array.isArray(value)) throw new Error('expected an array')
  return value
}

/** Every question and answer the page publishes as FAQPage schema. */
function publishedFaqText(jsonLd: JsonLd[]): string[] {
  const nodes = jsonLd.flatMap((block) => asArray(block['@graph']).map(asRecord))
  const questions = nodes.filter((node) => node['@type'] === 'FAQPage').flatMap((node) => asArray(node.mainEntity).map(asRecord))
  return questions.flatMap((question) => [String(question.name), String(asRecord(question.acceptedAnswer).text)])
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
})
