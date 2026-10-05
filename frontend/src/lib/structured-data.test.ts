import { describe, expect, it } from 'vitest'
import { serializeJsonLd } from '../components/seo/StructuredData'
import { FOUNDERS, PEOPLE } from './people'
import { PRICING_TIERS } from './pricingTiers'
import { absoluteUrl } from './site'
import {
  blogPostingSchema,
  breadcrumbSchema,
  featurePageGraph,
  faqPageSchema,
  jsonLdGraph,
  organizationSchema,
  pageGraphNodes,
  personSchema,
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

  it('points each offer at the pricing page, where the plan is described', () => {
    expect(offers.map((offer) => offer.url)).toEqual(PRICING_TIERS.map(() => absoluteUrl('/pricing/')))
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
  it('links the company\'s own profiles, the signal that separates this entity from similarly named ones', () => {
    expect(organizationSchema().sameAs).toEqual(['https://www.linkedin.com/company/vyostra-ai', 'https://x.com/vyostra_ai'])
  })
})

describe('personSchema', () => {
  const author = PEOPLE['vinayak-tiwari']

  it('ties the person to their LinkedIn profile and to the organization', () => {
    const person = personSchema(author)
    expect(person.sameAs).toEqual([author.linkedinUrl])
    expect(person.jobTitle).toBe(author.role)
    expect(person.worksFor).toEqual({ '@id': organizationSchema()['@id'] })
  })

  it('lists each founder on the organization as that same node', () => {
    expect(organizationSchema().founder).toEqual(FOUNDERS.map(personSchema))
  })
})

describe('blogPostingSchema', () => {
  const fields = { title: 't', excerpt: 'e', publishedAt: '2026-08-01', path: '/blog/t/', tags: ['a'], author: PEOPLE['vinayak-tiwari'], market: 'global' as const }

  it('names a person as the author, not the organization', () => {
    expect(blogPostingSchema(fields).author).toEqual(personSchema(PEOPLE['vinayak-tiwari']))
  })

  it('dates a post never revised by its publication', () => {
    expect(blogPostingSchema(fields).dateModified).toBe('2026-08-01')
  })

  // One English site: the market is a claim about coverage, not a locale.
  it('names the country a market post covers, and no place for a global one', () => {
    expect(blogPostingSchema({ ...fields, market: 'ae' }).spatialCoverage).toEqual({ '@type': 'Country', name: 'United Arab Emirates' })
    expect(blogPostingSchema(fields)).not.toHaveProperty('spatialCoverage')
    expect(blogPostingSchema(fields).inLanguage).toBe('en')
  })

  it('dates a revised post by the revision', () => {
    const revised = blogPostingSchema({ ...fields, updatedAt: '2026-09-20' })
    expect([revised.datePublished, revised.dateModified]).toEqual(['2026-08-01', '2026-09-20'])
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
  it('resolves the blog post publisher to the organization node in the same graph', () => {
    const graph = jsonLdGraph([
      organizationSchema(),
      blogPostingSchema({ title: 't', excerpt: 'e', publishedAt: '2026-08-01', path: '/blog/t/', tags: ['a'], author: PEOPLE['vinayak-tiwari'], market: 'global' as const }),
    ])
    const [organization, post] = asArray(graph['@graph']).map(asRecord)
    expect(graph['@context']).toBe('https://schema.org')
    expect(asRecord(post?.publisher)['@id']).toBe(organization?.['@id'])
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

describe('pageGraphNodes', () => {
  const [page, crumbs] = pageGraphNodes({ name: 'Pricing', path: '/pricing/' })

  it('describes a page about the product, one crumb below Home', () => {
    expect(page?.about).toEqual({ '@id': softwareApplicationSchema(PRICING_TIERS)['@id'] })
    expect(asArray(crumbs?.itemListElement).map((item) => asRecord(item).item)).toEqual([absoluteUrl('/'), absoluteUrl('/pricing/')])
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
