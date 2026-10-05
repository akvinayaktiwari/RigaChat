import type { ComponentType } from 'react'
import type { BlogPost, BlogPostMeta } from '../../types/blog'
import { isBlogMarket } from '../../lib/blog-markets'

/**
 * Post discovery.
 *
 * Each post is a directory under ./posts/<slug>/ containing:
 *   meta.ts     — default-exports BlogPostMeta (eagerly bundled, tiny)
 *   content.mdx — the post body in markdown (preferred), or
 *   content.tsx — the body as a component, for posts that are mostly custom JSX
 *
 * Splitting metadata from body is what keeps /blog cheap: the index page
 * renders from `meta.ts` alone, and a post body is only fetched once its
 * own route is visited. Adding a post is adding a directory — no route
 * registration, no registry edit.
 */
const metaModules = import.meta.glob<{ default: BlogPostMeta }>('./posts/*/meta.ts', { eager: true })

const contentModules = import.meta.glob<{ default: ComponentType }>('./posts/*/content.{mdx,tsx}')

/** Pulls "my-post" out of "./posts/my-post/meta.ts". */
function slugFromPath(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 2] ?? ''
}

function buildPosts(): BlogPost[] {
  const posts: BlogPost[] = []

  for (const [path, module] of Object.entries(metaModules)) {
    const slug = slugFromPath(path)
    const meta = module.default

    if (meta.slug !== slug) {
      throw new Error(`Blog post slug mismatch: ${path} declares slug "${meta.slug}" but lives in directory "${slug}". They must match or the post URL will 404.`)
    }

    // The type already requires `market`, but the production build does not
    // typecheck, so this is what actually stops an unlabelled post shipping.
    if (!isBlogMarket(meta.market)) {
      throw new Error(`Blog post "${slug}" has no valid market in its meta.ts. Set market to 'global' or the country it is written for.`)
    }

    const loadContent = contentModules[`./posts/${slug}/content.mdx`] ?? contentModules[`./posts/${slug}/content.tsx`]

    if (!loadContent) {
      throw new Error(`Blog post "${slug}" has a meta.ts but no content.mdx or content.tsx beside it.`)
    }

    posts.push({ meta, loadContent })
  }

  // Newest first. Ties broken by slug so ordering is stable across builds.
  return posts.sort((a, b) => {
    const byDate = b.meta.publishedAt.localeCompare(a.meta.publishedAt)
    return byDate !== 0 ? byDate : a.meta.slug.localeCompare(b.meta.slug)
  })
}

const posts = buildPosts()

/** Post bodies already fetched, by slug. See preloadPostContent(). */
const loadedContent = new Map<string, ComponentType>()

/**
 * Fetches a post's body ahead of its first render.
 *
 * The body is a lazy chunk inside its own Suspense boundary. main.tsx awaits
 * this before hydrating a prerendered post, for the reason lazy-with-preload.tsx
 * gives: a boundary still waiting on its chunk during hydration gets thrown
 * away and rendered again, and the article blanks to its skeleton.
 */
export async function preloadPostContent(slug: string): Promise<void> {
  const post = getPostBySlug(slug)
  if (!post || loadedContent.has(slug)) return
  const module = await post.loadContent()
  loadedContent.set(slug, module.default)
}

/** The post body if it has been preloaded, else undefined. */
export function loadedPostContent(slug: string): ComponentType | undefined {
  return loadedContent.get(slug)
}

export function getAllPosts(): BlogPost[] {
  return posts
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((post) => post.meta.slug === slug)
}

/** Every post slug — used by the prerender script to enumerate blog routes. */
export function getAllSlugs(): string[] {
  return posts.map((post) => post.meta.slug)
}

/** Posts that declare the given feature page in `relatedFeatures`, newest first. */
export function postsForFeature(featurePath: string, metas: readonly BlogPostMeta[] = posts.map((post) => post.meta)): BlogPostMeta[] {
  return metas.filter((meta) => meta.relatedFeatures?.includes(featurePath) ?? false)
}

/** Most posts listed under "Related reading" at the end of a post. */
export const RELATED_POST_LIMIT = 3

function sharedTagCount(a: BlogPostMeta, b: BlogPostMeta): number {
  return a.tags.filter((tag) => b.tags.includes(tag)).length
}

/**
 * Other posts sharing at least one tag with `slug`, most tags in common first.
 * Ties keep the input order, which is newest first.
 */
export function relatedPosts(slug: string, metas: readonly BlogPostMeta[] = posts.map((post) => post.meta)): BlogPostMeta[] {
  const current = metas.find((meta) => meta.slug === slug)
  if (!current) return []

  return metas
    .filter((meta) => meta.slug !== slug && sharedTagCount(meta, current) > 0)
    .map((meta, index) => ({ meta, index, shared: sharedTagCount(meta, current) }))
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .slice(0, RELATED_POST_LIMIT)
    .map(({ meta }) => meta)
}
