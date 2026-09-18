import { describe, expect, it } from 'vitest'
import type { BlogPostMeta } from '../../types/blog'
import { getAllPosts, postsForFeature } from './registry'

function meta(slug: string, relatedFeatures?: string[]): BlogPostMeta {
  return { slug, title: slug, excerpt: '', publishedAt: '2026-09-01', category: '', tags: [], readingMinutes: 1, relatedFeatures }
}

describe('postsForFeature', () => {
  const metas = [meta('a', ['/features/crm']), meta('b'), meta('c', ['/features/crm', '/features/whatsapp'])]

  it('returns only the posts that declare the feature, in the given order', () => {
    expect(postsForFeature('/features/crm', metas).map((post) => post.slug)).toEqual(['a', 'c'])
  })

  it('returns nothing for a feature no post declares', () => {
    expect(postsForFeature('/features/forms', metas)).toEqual([])
  })

  it('does not match the trailing-slash form of a path', () => {
    expect(postsForFeature('/features/crm/', metas)).toEqual([])
  })
})

describe('relatedFeatures on real posts', () => {
  // A typo here ("/features/whatsap") links nothing and fails nowhere else.
  const featureRoutes = ['/features/chatbot', '/features/whatsapp', '/features/crm', '/features/forms']

  it.each(getAllPosts().map(({ meta: postMeta }) => [postMeta.slug, postMeta.relatedFeatures ?? []] as const))(
    '%s names only real feature routes',
    (_slug, features) => {
      expect(features.filter((feature) => !featureRoutes.includes(feature))).toEqual([])
    },
  )
})
