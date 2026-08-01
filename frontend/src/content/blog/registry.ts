import type { ComponentType } from 'react'
import type { BlogPost, BlogPostMeta } from '../../types/blog'

/**
 * Post discovery.
 *
 * Each post is a directory under ./posts/<slug>/ containing:
 *   meta.ts     — default-exports BlogPostMeta (eagerly bundled, tiny)
 *   content.tsx — default-exports the body component (lazily bundled)
 *
 * Splitting metadata from body is what keeps /blog cheap: the index page
 * renders from `meta.ts` alone, and a post body is only fetched once its
 * own route is visited. Adding a post is adding a directory — no route
 * registration, no registry edit.
 */
const metaModules = import.meta.glob<{ default: BlogPostMeta }>('./posts/*/meta.ts', { eager: true })

const contentModules = import.meta.glob<{ default: ComponentType }>('./posts/*/content.tsx')

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

    const contentPath = `./posts/${slug}/content.tsx`
    const loadContent = contentModules[contentPath]

    if (!loadContent) {
      throw new Error(`Blog post "${slug}" has a meta.ts but no content.tsx at ${contentPath}.`)
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
