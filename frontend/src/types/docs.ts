import type { ComponentType } from 'react'
import type { PersonId } from '../lib/people'
import type { FaqItem } from '../lib/structured-data'

/**
 * The groups the developer docs are organised into, in sidebar order. A fixed
 * list so the sidebar, the index and llms.txt group pages the same way.
 */
export const DOC_SECTIONS = ['Get started', 'API reference', 'Guides'] as const
export type DocSection = (typeof DOC_SECTIONS)[number]

/**
 * A docs page's metadata. Lives in `meta.ts` beside the body so the index and
 * the sidebar render from metadata alone, without loading any page body.
 */
export interface DocMeta {
  /** URL segment. Must match the page's directory name under content/docs/pages. */
  slug: string
  /** The page's H1 and its link text in the sidebar. */
  title: string
  /** <title> without the brand, 60 characters or fewer. Defaults to `title`. */
  metaTitle?: string
  /** Meta description, and the line under the link on the docs index. */
  description: string
  /**
   * The direct answer the page opens with, 40 to 70 words. It is the passage an
   * answer engine lifts, so it has to stand alone and name Vyostra AI.
   */
  lead: string
  section: DocSection
  /** Position within the section, ascending. */
  order: number
  /** YYYY-MM-DD the page was first published. */
  publishedAt: string
  /**
   * YYYY-MM-DD of the last change to what the page SAYS. Shown as "Updated",
   * published as dateModified and the sitemap's lastmod. Not for a typo fix.
   */
  updatedAt?: string
  authorId: PersonId
  /** Rendered as the closing questions AND emitted as FAQPage schema, from this one array. */
  faq?: readonly FaqItem[]
}

export interface DocPage {
  meta: DocMeta
  /** Dynamic import of the page body; resolved lazily by the page route. */
  loadContent: () => Promise<{ default: ComponentType }>
}
