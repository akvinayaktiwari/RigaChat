import type { BlogPostMeta } from '../types/blog'
import type { DocMeta } from '../types/docs'

/**
 * Lengths past which results pages truncate. Google measures in pixels, not
 * characters, so these are the conventional safe ceilings rather than exact
 * cut-offs -- a title just under the limit can still be clipped if it is wide.
 */
export const MAX_TITLE_LENGTH = 60
export const MAX_DESCRIPTION_LENGTH = 160

export const BRAND_SUFFIX = ' — Vyostra AI'

/** The <title> a blog post ships with. */
export function postDocumentTitle(meta: BlogPostMeta): string {
  return `${meta.seoTitle ?? meta.title}${BRAND_SUFFIX}`
}

/** Docs suffixes, longest first; a title that no suffix fits ships bare. */
const DOC_SUFFIXES = [' | Vyostra AI Docs', BRAND_SUFFIX, ''] as const

/**
 * The <title> a docs page ships with. The keyword-first metaTitle is what
 * earns the click, so the suffix gives way rather than the title: Google
 * shows the site name beside the result anyway.
 */
export function docDocumentTitle(meta: Pick<DocMeta, 'title' | 'metaTitle'>): string {
  const base = meta.metaTitle ?? meta.title
  const fitting = DOC_SUFFIXES.find((suffix) => base.length + suffix.length <= MAX_TITLE_LENGTH) ?? ''
  return `${base}${fitting}`
}

/** The meta description a blog post ships with. */
export function postDescription(meta: BlogPostMeta): string {
  return meta.seoDescription ?? meta.excerpt
}
