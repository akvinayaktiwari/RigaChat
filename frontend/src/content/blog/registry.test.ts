import { describe, expect, it } from 'vitest'
import type { BlogPostMeta } from '../../types/blog'
import { RELATED_POST_LIMIT, getAllPosts, postsForFeature, relatedPosts } from './registry'

function meta(slug: string, relatedFeatures?: string[], tags: string[] = []): BlogPostMeta {
  return { slug, title: slug, excerpt: '', publishedAt: '2026-09-01', category: '', tags, readingMinutes: 1, relatedFeatures }
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

describe('relatedPosts', () => {
  const tagged = (slug: string, tags: string[]): BlogPostMeta => meta(slug, undefined, tags)

  it('never lists the post itself', () => {
    const metas = [tagged('self', ['x']), tagged('other', ['x'])]
    expect(relatedPosts('self', metas).map((post) => post.slug)).toEqual(['other'])
  })

  it('leaves out posts that share no tag', () => {
    expect(relatedPosts('self', [tagged('self', ['x']), tagged('other', ['y'])])).toEqual([])
  })

  it('ranks by tags in common, then keeps input order', () => {
    const metas = [tagged('self', ['x', 'y']), tagged('one', ['x']), tagged('two', ['x', 'y']), tagged('also-one', ['y'])]
    expect(relatedPosts('self', metas).map((post) => post.slug)).toEqual(['two', 'one', 'also-one'])
  })

  it(`caps the list at ${RELATED_POST_LIMIT}`, () => {
    const metas = [tagged('self', ['x']), ...['a', 'b', 'c', 'd', 'e'].map((slug) => tagged(slug, ['x']))]
    expect(relatedPosts('self', metas)).toHaveLength(RELATED_POST_LIMIT)
  })

  it('returns nothing for an unknown slug', () => {
    expect(relatedPosts('missing', [tagged('a', ['x'])])).toEqual([])
  })
})
