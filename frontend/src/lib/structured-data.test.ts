import { describe, expect, it } from 'vitest'
import { serializeJsonLd } from '../components/seo/StructuredData'
import { PRICING_TIERS } from './pricingTiers'
import {
  blogPostingSchema,
  faqPageSchema,
  jsonLdGraph,
  organizationSchema,
  softwareApplicationSchema,
  type JsonLd,
  type JsonValue,
} from './structured-data'

function asRecord(value: JsonValue | undefined): JsonLd {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected an object')
  return value
}

function asArray(value: JsonValue | undefined): JsonValue[] {
  if (!Array.isArray(value)) throw new Error('expected an array')
  return value
}

describe('softwareApplicationSchema', () => {
  const offers = asArray(softwareApplicationSchema(PRICING_TIERS).offers).map(asRecord)

  it('offers every plan at its global USD price, straight from PRICING_TIERS', () => {
    expect(offers.map((offer) => [offer.name, offer.price, offer.priceCurrency])).toEqual(
      PRICING_TIERS.map((tier) => [tier.name, String(tier.priceUsd), 'USD']),
    )
  })

  it('prices per month, which is what the page says', () => {
    expect(asRecord(offers[0]?.priceSpecification).unitCode).toBe('MON')
  })

  // No third-party reviews exist; a self-authored rating is a spam-policy violation.
  it('carries no rating', () => {
    expect(JSON.stringify(softwareApplicationSchema(PRICING_TIERS))).not.toMatch(/Rating/)
  })
})

describe('organizationSchema', () => {
  it('links the LinkedIn company page, the signal that separates this entity from similarly named ones', () => {
    expect(organizationSchema().sameAs).toEqual(['https://www.linkedin.com/company/vyostra-ai'])
  })
})

describe('faqPageSchema', () => {
  it('maps each question to a Question with an accepted Answer', () => {
    const schema = faqPageSchema([{ question: 'Is there a free trial?', answer: 'Yes.' }])
    expect(schema.mainEntity).toEqual([
      { '@type': 'Question', name: 'Is there a free trial?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } },
    ])
  })
})

describe('jsonLdGraph', () => {
  it('resolves the blog post author to the organization node in the same graph', () => {
    const graph = jsonLdGraph([
      organizationSchema(),
      blogPostingSchema({ title: 't', excerpt: 'e', publishedAt: '2026-08-01', path: '/blog/t/', tags: ['a'] }),
    ])
    const [organization, post] = asArray(graph['@graph']).map(asRecord)
    expect(graph['@context']).toBe('https://schema.org')
    expect(asRecord(post?.author)['@id']).toBe(organization?.['@id'])
  })
})

describe('serializeJsonLd', () => {
  it('cannot be broken out of its script tag', () => {
    const serialized = serializeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(serialized).not.toContain('</script>')
    expect(JSON.parse(serialized)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})
