import { describe, expect, it } from 'vitest'
import { serializeJsonLd } from '../components/seo/StructuredData'
import { PRICING_TIERS } from './pricingTiers'
import { absoluteUrl } from './site'
import {
  blogPostingSchema,
  breadcrumbSchema,
  featurePageGraph,
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

describe('breadcrumbSchema', () => {
  it('numbers the crumbs from 1 and makes every item an absolute URL', () => {
    const list = breadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Blog', path: '/blog/' },
    ])
    expect(list.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: absoluteUrl('/blog/') },
    ])
  })
})

describe('featurePageGraph', () => {
  function node(path: string, type: string, name = 'Lead CRM'): JsonLd {
    const found = asArray(featurePageGraph({ name, path })['@graph']).map(asRecord).find((entry) => entry['@type'] === type)
    if (!found) throw new Error(`no ${type} node`)
    return found
  }

  function crumbNames(path: string, name?: string): JsonValue[] {
    return asArray(node(path, 'BreadcrumbList', name).itemListElement).map((item) => asRecord(item).name ?? null)
  }

  it('marks the page as being about the product node the homepage defines', () => {
    const softwareId = softwareApplicationSchema(PRICING_TIERS)['@id']
    expect(softwareId).toBeTruthy()
    expect(node('/features/crm/', 'WebPage').about).toEqual({ '@id': softwareId })
  })

  it('trails Home > Features > the page', () => {
    expect(crumbNames('/features/crm/')).toEqual(['Home', 'Features', 'Lead CRM'])
  })

  it('does not repeat Features on the features index', () => {
    expect(crumbNames('/features/', 'Features')).toEqual(['Home', 'Features'])
  })
})
