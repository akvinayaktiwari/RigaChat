import type { ComponentType } from 'react'
import type { PersonId } from '../lib/people'

/**
 * A downloadable asset attached to a post (e.g. the source research PDF).
 * `file` is a path under /public, served from the CloudFront root.
 */
export interface BlogAttachment {
  file: string
  label: string
  /** Human-readable size, e.g. "1.0 MB" — shown on the download button. */
  size: string
  /** Page count for PDFs; omitted for other asset types. */
  pages?: number
}

/**
 * The topic clusters the blog is organised into. A fixed list rather than free
 * text: a post's category is its eyebrow label AND the GA4 `post_category`
 * dimension, and "which cluster earns its keep" is only a report if every post
 * in a cluster spells it the same way. Add a cluster here when a second post
 * needs it, not for one post.
 */
export const BLOG_CATEGORIES = ['WhatsApp', 'Voice AI', 'Real Estate', 'Comparison'] as const
export type BlogCategory = (typeof BLOG_CATEGORIES)[number]

/**
 * Who a post is written for. `global` makes no country-specific assumption;
 * every other value is one country, whose currency, portals and rules the post
 * is free to use because it says so in its title.
 *
 * One English site, not localized copies: a market is a label and a filter,
 * never a separate URL, and never an hreflang alternate.
 */
export const BLOG_MARKETS = ['global', 'us', 'uk', 'ca', 'au', 'ae', 'in'] as const
export type BlogMarket = (typeof BLOG_MARKETS)[number]

/**
 * Post metadata. Lives in its own `meta.ts` next to the post body so the
 * index page can eagerly import every post's metadata without pulling any
 * post body into the initial bundle.
 */
export interface BlogPostMeta {
  /** URL segment. Must match the post's directory name under content/blog/posts. */
  slug: string
  title: string
  /** Short deck shown under the title on the post page and on index cards. */
  excerpt: string
  /** ISO-8601 date (YYYY-MM-DD). Drives sort order and <time dateTime>. */
  publishedAt: string
  /**
   * ISO-8601 date of the last substantial revision. Set it when the content
   * changes, not for a typo: it is shown as "Updated", published as
   * dateModified and becomes the sitemap's lastmod, and a date that moves
   * without the content moving teaches a crawler to ignore all three.
   */
  updatedAt?: string
  /**
   * Who wrote the post, as a key of PEOPLE (lib/people.ts). Shown as the byline
   * and published as the BlogPosting author, from the one record.
   */
  authorId: PersonId
  /** The post's cluster. Shown as the eyebrow label above the title. */
  category: BlogCategory
  /**
   * The market the post is written for. Required, with no default: a post
   * that quotes one country's rules or currency without saying so is how a
   * global site ends up reading as a local one. The registry also refuses a
   * post without it, so the build fails rather than publishing it unlabelled.
   */
  market: BlogMarket
  tags: string[]
  /** Estimated read time in minutes, shown in the post meta bar. */
  readingMinutes: number
  /**
   * Questions answered in the post body, in the post's own words.
   *
   * Rendered as the closing FAQ section AND emitted as FAQPage schema. The two
   * read from this one array on purpose: structured data that answers something
   * the page does not is a Google spam-policy violation, and AI answer engines
   * quote the schema as if it were the page.
   */
  faq?: BlogFaqItem[]
  attachment?: BlogAttachment
  /**
   * Feature pages this post explains, as routed paths without the trailing
   * slash (e.g. "/features/whatsapp"). Those pages link back to the post, which
   * is how a post earns inbound links beyond the /blog index.
   */
  relatedFeatures?: string[]
  /**
   * Search-result title, when `title` is too long to survive truncation. The
   * brand suffix is added for you. The on-page H1 and og:title keep `title`.
   */
  seoTitle?: string
  /**
   * Meta description, when `excerpt` runs past what a results page shows. The
   * excerpt is a deliberate on-page deck, so it is not cut to fit.
   */
  seoDescription?: string
  /** Headline figures rendered as stat tiles in the post hero. */
  highlights?: BlogHighlight[]
}

/** One question and its answer, shown on the page and published as schema. */
export interface BlogFaqItem {
  question: string
  /** Plain text: it is both rendered and serialised into JSON-LD. */
  answer: string
}

/** A single hero stat tile: a big value with a small label beneath it. */
export interface BlogHighlight {
  value: string
  label: string
}

/** A post's metadata paired with a lazy loader for its body component. */
export interface BlogPost {
  meta: BlogPostMeta
  loadContent: () => Promise<{ default: ComponentType }>
}
