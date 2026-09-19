import type { ComponentType } from 'react'

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
  /** Eyebrow label above the title, e.g. "Hospitality Investment Research". */
  category: string
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
