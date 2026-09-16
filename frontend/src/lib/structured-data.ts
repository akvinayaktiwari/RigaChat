/**
 * schema.org JSON-LD builders for the public site.
 *
 * Every value here must already be true on the page it is emitted from --
 * structured data that disagrees with visible content is a Google spam-policy
 * violation, and AI answer engines quote it as fact. So there is deliberately no
 * AggregateRating: there are no third-party reviews to aggregate yet.
 */
import type { PricingTier } from './pricingTiers'
import { absoluteUrl } from './site'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonLd = { [key: string]: JsonValue }

export const ORGANIZATION_NAME = 'Vyostra AI'
/** Must match Privacy.tsx's LEGAL_ENTITY, which Meta Business Verification checks. */
export const LEGAL_ENTITY = 'Aashirwad Trading Enterprises'
const SUPPORT_EMAIL = 'support@vyostra.com'

/**
 * Profiles that are provably the same entity, which is how a search engine tells
 * "Vyostra AI" apart from Vyomastra Technologies and Vystra. Add a URL here only
 * once the profile is claimed and confirmed to be ours -- a wrong sameAs points
 * the entity graph at someone else's company.
 */
const SAME_AS: readonly string[] = ['https://www.linkedin.com/company/vyostra-ai']

const ORGANIZATION_ID = '#organization'

export function organizationSchema(): JsonLd {
  return {
    '@type': 'Organization',
    '@id': absoluteUrl(`/${ORGANIZATION_ID}`),
    name: ORGANIZATION_NAME,
    legalName: LEGAL_ENTITY,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/logo-mark.png'),
    email: SUPPORT_EMAIL,
    sameAs: [...SAME_AS],
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Bangalore',
      addressRegion: 'Karnataka',
      addressCountry: 'IN',
    },
    founder: [
      { '@type': 'Person', name: 'Vinayak Tiwari' },
      { '@type': 'Person', name: 'Adarsh Jee Pandey' },
    ],
  }
}

export function websiteSchema(): JsonLd {
  return {
    '@type': 'WebSite',
    name: ORGANIZATION_NAME,
    url: absoluteUrl('/'),
    inLanguage: 'en-IN',
    publisher: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
  }
}

/** USD: one global price list, and the currency every card is charged in. */
function planOffer(tier: PricingTier): JsonLd {
  return {
    '@type': 'Offer',
    name: tier.name,
    description: tier.description,
    price: String(tier.priceUsd),
    priceCurrency: 'USD',
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: String(tier.priceUsd),
      priceCurrency: 'USD',
      unitCode: 'MON',
      referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
    },
    url: absoluteUrl('/#pricing'),
  }
}

export function softwareApplicationSchema(tiers: readonly PricingTier[]): JsonLd {
  return {
    '@type': 'SoftwareApplication',
    name: ORGANIZATION_NAME,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'AI chatbot and lead management',
    operatingSystem: 'Web',
    url: absoluteUrl('/'),
    description:
      'An AI agent trained on your website that captures leads on chat, voice and WhatsApp, stores them in a built-in lead CRM, and follows up automatically.',
    offers: tiers.map(planOffer),
    publisher: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
  }
}

export interface FaqItem {
  question: string
  answer: string
}

export function faqPageSchema(items: readonly FaqItem[]): JsonLd {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export interface ArticleFields {
  title: string
  excerpt: string
  publishedAt: string
  path: string
  tags: readonly string[]
}

export function blogPostingSchema(article: ArticleFields): JsonLd {
  return {
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.publishedAt,
    mainEntityOfPage: absoluteUrl(article.path),
    image: absoluteUrl('/og-image.png'),
    keywords: article.tags.join(', '),
    author: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
    publisher: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
  }
}

/** Wraps nodes in one @graph so @id references resolve across them. */
export function jsonLdGraph(nodes: readonly JsonLd[]): JsonLd {
  return { '@context': 'https://schema.org', '@graph': [...nodes] }
}
