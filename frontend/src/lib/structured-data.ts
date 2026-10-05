/**
 * schema.org JSON-LD builders for the public site.
 *
 * Every value here must already be true on the page it is emitted from --
 * structured data that disagrees with visible content is a Google spam-policy
 * violation, and AI answer engines quote it as fact. So there is deliberately no
 * AggregateRating: there are no third-party reviews to aggregate yet.
 */
import { FOUNDERS, type Person } from './people'
import type { PricingTier } from './pricingTiers'
import { absoluteUrl } from './site'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonLd = { [key: string]: JsonValue }

export const ORGANIZATION_NAME = 'Vyostra AI'
/** Must match Privacy.tsx's LEGAL_ENTITY, which Meta Business Verification checks. */
export const LEGAL_ENTITY = 'Aashirwad Trading Enterprises'
export const SUPPORT_EMAIL = 'support@vyostra.com'

/**
 * Profiles that are provably the same entity, which is how a search engine tells
 * "Vyostra AI" apart from Vyomastra Technologies and Vystra. Add a URL here only
 * once the profile is claimed and confirmed to be ours -- a wrong sameAs points
 * the entity graph at someone else's company.
 */
const SAME_AS: readonly string[] = ['https://www.linkedin.com/company/vyostra-ai']

const ORGANIZATION_ID = '#organization'
const WEBSITE_ID = '#website'
/** The product node. Feature pages point `about` at it, so they read as pages about one product. */
const SOFTWARE_ID = '#software'

/**
 * A person, identified by @id so the same human is one node whether they appear
 * as a founder or as a post's author. The LinkedIn profile is what tells an
 * engine which "Vinayak Tiwari" this is.
 */
export function personSchema(person: Person): JsonLd {
  return {
    '@type': 'Person',
    '@id': absoluteUrl(`/#${person.id}`),
    name: person.name,
    jobTitle: person.role,
    worksFor: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
    url: absoluteUrl('/about-us/'),
    sameAs: [person.linkedinUrl],
  }
}

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
    founder: FOUNDERS.map(personSchema),
  }
}

export function websiteSchema(): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': absoluteUrl(`/${WEBSITE_ID}`),
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
    url: absoluteUrl('/pricing/'),
  }
}

export function softwareApplicationSchema(tiers: readonly PricingTier[]): JsonLd {
  return {
    '@type': 'SoftwareApplication',
    '@id': absoluteUrl(`/${SOFTWARE_ID}`),
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
  /** When the post was last substantially revised. Absent on a post never revised. */
  updatedAt?: string
  path: string
  tags: readonly string[]
  /** The person the page's byline names. */
  author: Person
}

export function blogPostingSchema(article: ArticleFields): JsonLd {
  return {
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.excerpt,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    mainEntityOfPage: absoluteUrl(article.path),
    image: absoluteUrl('/og-image.png'),
    keywords: article.tags.join(', '),
    author: personSchema(article.author),
    publisher: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
  }
}

export interface TechArticleFields {
  title: string
  description: string
  publishedAt: string
  updatedAt?: string
  path: string
  author: Person
}

/** A developer docs page. TechArticle rather than BlogPosting: it is reference material, not a dated post. */
export function techArticleSchema(article: TechArticleFields): JsonLd {
  return {
    '@type': 'TechArticle',
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt ?? article.publishedAt,
    mainEntityOfPage: absoluteUrl(article.path),
    image: absoluteUrl('/og-image.png'),
    author: personSchema(article.author),
    publisher: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
  }
}

export interface Crumb {
  name: string
  /** Path exactly as served (trailing slash on prerendered routes): a crumb must never point at a 301. */
  path: string
}

export function breadcrumbSchema(crumbs: readonly Crumb[]): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  }
}

export interface FeaturePageFields {
  /** Short name, as the site labels the page ("Lead CRM", "Pricing"). Also the last breadcrumb. */
  name: string
  /** Path exactly as served, e.g. "/features/crm/". */
  path: string
}

const FEATURES_CRUMBS: readonly Crumb[] = [
  { name: 'Home', path: '/' },
  { name: 'Features', path: '/features/' },
]

/** A page of the site that is about the product. */
function webPageSchema(page: FeaturePageFields): JsonLd {
  return {
    '@type': 'WebPage',
    '@id': absoluteUrl(page.path),
    url: absoluteUrl(page.path),
    name: page.name,
    isPartOf: { '@id': absoluteUrl(`/${WEBSITE_ID}`) },
    about: { '@id': absoluteUrl(`/${SOFTWARE_ID}`) },
  }
}

/** A feature page: a WebPage about the product, plus its Home > Features trail. */
export function featurePageGraph(page: FeaturePageFields): JsonLd {
  return jsonLdGraph(featurePageNodes(page))
}

/** featurePageGraph's nodes, for a feature page that adds its own (an FAQPage) to the graph. */
export function featurePageNodes(page: FeaturePageFields): JsonLd[] {
  const isIndex = page.path === '/features/'
  const crumbs = isIndex ? FEATURES_CRUMBS : [...FEATURES_CRUMBS, { name: page.name, path: page.path }]
  return [webPageSchema(page), breadcrumbSchema(crumbs)]
}

/** A top-level page (/pricing/, /faq/): a WebPage about the product, one crumb below Home. */
export function pageGraphNodes(page: FeaturePageFields): JsonLd[] {
  return [webPageSchema(page), breadcrumbSchema([{ name: 'Home', path: '/' }, { name: page.name, path: page.path }])]
}

const INTEGRATIONS_CRUMBS: readonly Crumb[] = [
  { name: 'Home', path: '/' },
  { name: 'Integrations', path: '/integrations/' },
]

/** The integrations index: a WebPage about the product, one crumb below Home. */
export function integrationsIndexNodes(): JsonLd[] {
  return [webPageSchema({ name: 'Integrations', path: '/integrations/' }), breadcrumbSchema(INTEGRATIONS_CRUMBS)]
}

/** One integration's page: a WebPage about the product, trailing Home > Integrations > the page. */
export function integrationPageNodes(page: FeaturePageFields): JsonLd[] {
  return [webPageSchema(page), breadcrumbSchema([...INTEGRATIONS_CRUMBS, { name: page.name, path: page.path }])]
}

/**
 * The about page: an AboutPage whose subject is the organization, one crumb
 * below Home. Emit it alongside organizationSchema(), which carries the
 * founders the page introduces.
 */
export function aboutPageNodes(page: FeaturePageFields): JsonLd[] {
  const aboutPage: JsonLd = {
    '@type': 'AboutPage',
    '@id': absoluteUrl(page.path),
    url: absoluteUrl(page.path),
    name: page.name,
    isPartOf: { '@id': absoluteUrl(`/${WEBSITE_ID}`) },
    mainEntity: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
  }
  return [aboutPage, breadcrumbSchema([{ name: 'Home', path: '/' }, { name: page.name, path: page.path }])]
}

/**
 * A page about the company rather than the product: contact, careers, the
 * legal pages. Its subject is the organization, one crumb below Home. Emit it
 * alongside organizationSchema(), which is the node `about` points at.
 */
export function companyPageNodes(page: FeaturePageFields, type: 'WebPage' | 'ContactPage' = 'WebPage'): JsonLd[] {
  const companyPage: JsonLd = {
    '@type': type,
    '@id': absoluteUrl(page.path),
    url: absoluteUrl(page.path),
    name: page.name,
    isPartOf: { '@id': absoluteUrl(`/${WEBSITE_ID}`) },
    about: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
  }
  return [companyPage, breadcrumbSchema([{ name: 'Home', path: '/' }, { name: page.name, path: page.path }])]
}

export interface BlogListing {
  title: string
  /** Path exactly as served, e.g. "/blog/a-post/". */
  path: string
}

const BLOG_INDEX_PATH = '/blog/'

/** The blog index: a Blog published by the organization, listing its posts in the order the page shows them. */
export function blogIndexNodes(posts: readonly BlogListing[]): JsonLd[] {
  const blog: JsonLd = {
    '@type': 'Blog',
    '@id': absoluteUrl(BLOG_INDEX_PATH),
    url: absoluteUrl(BLOG_INDEX_PATH),
    name: `${ORGANIZATION_NAME} Blog`,
    isPartOf: { '@id': absoluteUrl(`/${WEBSITE_ID}`) },
    publisher: { '@id': absoluteUrl(`/${ORGANIZATION_ID}`) },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: post.title,
        url: absoluteUrl(post.path),
      })),
    },
  }
  return [blog, breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Blog', path: BLOG_INDEX_PATH }])]
}

/** Wraps nodes in one @graph so @id references resolve across them. */
export function jsonLdGraph(nodes: readonly JsonLd[]): JsonLd {
  return { '@context': 'https://schema.org', '@graph': [...nodes] }
}
