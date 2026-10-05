import { describe, expect, it } from 'vitest'
import { PRERENDERED_STATIC_ROUTES } from '../../lib/crawl-files'
import { isBlogMarket, marketsInUse } from '../../lib/blog-markets'
import type { BlogPostMeta } from '../../types/blog'
import { RELATED_POST_LIMIT, getAllPosts, loadedPostContent, postsForFeature, preloadPostContent, relatedPosts } from './registry'

function meta(slug: string, relatedFeatures?: string[], tags: string[] = []): BlogPostMeta {
  return { slug, title: slug, excerpt: '', publishedAt: '2026-09-01', authorId: 'vinayak-tiwari', category: 'WhatsApp', market: 'global', tags, readingMinutes: 1, relatedFeatures }
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
  const featureRoutes = PRERENDERED_STATIC_ROUTES.filter((route) => route.startsWith('/features/'))

  it('finds the feature routes it checks against', () => {
    expect(featureRoutes).toContain('/features/whatsapp')
  })

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

describe('preloadPostContent', () => {
  const slug = getAllPosts()[0]?.meta.slug ?? ''

  it('makes the post body available without another fetch', async () => {
    expect(loadedPostContent(slug)).toBeUndefined()
    await preloadPostContent(slug)
    expect(loadedPostContent(slug)).toBeTypeOf('function')
  })

  it('does nothing for a slug that is not a post', async () => {
    await preloadPostContent('no-such-post')
    expect(loadedPostContent('no-such-post')).toBeUndefined()
  })
})

describe('market on real posts', () => {
  const metas = getAllPosts().map((post) => post.meta)

  it.each(metas.map((postMeta) => [postMeta.slug, postMeta.market] as const))('%s declares a known market', (_slug, market) => {
    expect(isBlogMarket(market)).toBe(true)
  })

  // A global post makes no country-specific promise, starting with its title.
  it('keeps country names out of the titles of global posts', () => {
    const offenders = metas.filter((postMeta) => postMeta.market === 'global' && /\bin (india|the uae|dubai|the us|the uk|australia|canada)\b/i.test(postMeta.title))
    expect(offenders.map((postMeta) => postMeta.slug)).toEqual([])
  })

  // The slug is permanent, so a post written for India keeps saying so in its tag.
  it('tags every post with india in its slug as an India post', () => {
    const mislabelled = metas.filter((postMeta) => postMeta.slug.includes('india') && postMeta.market !== 'in')
    expect(mislabelled.map((postMeta) => postMeta.slug)).toEqual([])
  })
})

describe('marketsInUse', () => {
  it('lists each market once, global first, whatever order the posts come in', () => {
    expect(marketsInUse(['in', 'ae', 'global', 'in'])).toEqual(['global', 'ae', 'in'])
  })
})
