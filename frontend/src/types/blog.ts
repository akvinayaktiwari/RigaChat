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
  attachment?: BlogAttachment
  /** Headline figures rendered as stat tiles in the post hero. */
  highlights?: BlogHighlight[]
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
