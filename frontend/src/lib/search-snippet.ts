import type { BlogPostMeta } from '../types/blog'

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

/** The meta description a blog post ships with. */
export function postDescription(meta: BlogPostMeta): string {
  return meta.seoDescription ?? meta.excerpt
}
