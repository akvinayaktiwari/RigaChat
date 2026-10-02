// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PRERENDERED_STATIC_ROUTES } from '../../lib/crawl-files'
import { absoluteUrl } from '../../lib/site'
import { asArray, asRecord, openingParagraph, plainText, publishedFaqText, questionHeadings, renderPublicPage } from '../../test-render'
import { INTEGRATIONS, getIntegrationBySlug, integrationPath } from './registry'

/**
 * An integration page is what a buyer reads to decide whether their stack
 * fits, and what an answer engine quotes when asked "does X work with Y". So
 * each one is held to the same shape as a feature page, plus its limits: a
 * page that only lists what works is how a buyer finds out the rest after
 * signing up.
 */

describe('the integrations registry', () => {
  it('gives every integration its own slug and a prerendered route', () => {
    const slugs = INTEGRATIONS.map((integration) => integration.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    expect(slugs.filter((slug) => !PRERENDERED_STATIC_ROUTES.includes(`/integrations/${slug}`))).toEqual([])
  })

  it('finds an integration by slug and nothing for an unknown one', () => {
    expect(getIntegrationBySlug('zoho-crm')?.name).toBe('Zoho CRM')
    expect(getIntegrationBySlug('salesforce')).toBeUndefined()
    expect(getIntegrationBySlug(undefined)).toBeUndefined()
  })

  it.each(INTEGRATIONS.map((integration) => [integration.slug, integration] as const))('%s fits a search result', (_slug, integration) => {
    expect(integration.title.length).toBeLessThanOrEqual(60)
    expect(integration.description.length).toBeLessThanOrEqual(160)
  })

  it.each(INTEGRATIONS.map((integration) => [integration.slug, integration] as const))('%s states its limits', (_slug, integration) => {
    expect(integration.limits.points.length).toBeGreaterThanOrEqual(3)
  })
})

describe.each(INTEGRATIONS.map((integration) => [integration.slug, integration] as const))('/integrations/%s', (slug, integration) => {
  const route = `/integrations/${slug}`

  it('opens with a 40 to 70 word answer that names Vyostra AI', async () => {
    const opening = openingParagraph((await renderPublicPage(route)).html)
    expect(opening).toMatch(/^The Vyostra AI /)
    expect(opening.split(' ').length).toBeGreaterThanOrEqual(40)
    expect(opening.split(' ').length).toBeLessThanOrEqual(70)
  })

  it('heads its sections with the questions they answer', async () => {
    expect(questionHeadings((await renderPublicPage(route)).html).length).toBeGreaterThanOrEqual(4)
  })

  it('publishes FAQ schema only for questions and answers the page shows', async () => {
    const { html, jsonLd } = await renderPublicPage(route)
    const published = publishedFaqText(jsonLd)
    expect(published.length).toBe(integration.faq.length * 2)
    expect(published.filter((text) => !plainText(html).includes(text))).toEqual([])
  })

  it('trails Home > Integrations > the page', async () => {
    const { jsonLd } = await renderPublicPage(route)
    const nodes = jsonLd.flatMap((block) => asArray(block['@graph']).map(asRecord))
    const crumbs = asArray(nodes.find((node) => node['@type'] === 'BreadcrumbList')?.itemListElement).map((item) => asRecord(item).item)
    expect(crumbs).toEqual([absoluteUrl('/'), absoluteUrl('/integrations/'), absoluteUrl(integrationPath(integration))])
  })
})

describe('/integrations', () => {
  it('links every integration page', async () => {
    const { html } = await renderPublicPage('/integrations')
    expect(INTEGRATIONS.filter((integration) => !html.includes(`href="/integrations/${integration.slug}"`)).map((integration) => integration.slug)).toEqual([])
  })

  it('names every integration in its opening answer', async () => {
    const opening = openingParagraph((await renderPublicPage('/integrations')).html)
    expect(INTEGRATIONS.filter((integration) => !opening.includes(integration.name)).map((integration) => integration.name)).toEqual([])
  })
})

// The Zoho sync covers two lead sources today, and the page must not promise a third.
describe('the Zoho CRM page', () => {
  it('says chat-agent leads are not sent to Zoho', async () => {
    const text = plainText((await renderPublicPage('/integrations/zoho-crm')).html)
    expect(text).toContain('Leads captured by the chat agent stay in the Vyostra AI lead CRM and are not sent to Zoho.')
    expect(text).not.toMatch(/every lead (is|syncs|goes)/i)
  })
})
