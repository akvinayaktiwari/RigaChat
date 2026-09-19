import { describe, expect, it } from 'vitest'
import { getAllPosts } from '../content/blog/registry'
import type { BlogPostMeta } from '../types/blog'
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH, postDescription, postDocumentTitle } from './search-snippet'

/**
 * A length limit nobody tests drifts: the homepage title reached 69 characters
 * and one post's description 299 before anyone counted.
 */

const pageSources = import.meta.glob<string>(['../pages/**/*.tsx', '!../pages/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

interface PageMetaLiteral {
  file: string
  title: string
  description: string
}

/** title/description string literals passed to <PageMeta>. */
function pageMetaLiterals(): PageMetaLiteral[] {
  return Object.entries(pageSources).flatMap(([file, source]) =>
    [...source.matchAll(/<PageMeta\s+title="([^"]*)"\s+description="([^"]*)"/g)].map((match) => ({
      file,
      title: match[1] ?? '',
      description: match[2] ?? '',
    })),
  )
}

function meta(overrides: Partial<BlogPostMeta>): BlogPostMeta {
  return { slug: 's', title: 'Long on-page title', excerpt: 'On-page deck', publishedAt: '2026-09-01', category: '', tags: [], readingMinutes: 1, ...overrides }
}

describe('post snippet fallbacks', () => {
  it('uses the title and excerpt when no override is set', () => {
    expect(postDocumentTitle(meta({}))).toBe('Long on-page title — Vyostra AI')
    expect(postDescription(meta({}))).toBe('On-page deck')
  })

  it('prefers seoTitle and seoDescription when set', () => {
    const overridden = meta({ seoTitle: 'Short', seoDescription: 'Brief' })
    expect(postDocumentTitle(overridden)).toBe('Short — Vyostra AI')
    expect(postDescription(overridden)).toBe('Brief')
  })
})

describe('marketing page snippets fit in a results page', () => {
  const literals = pageMetaLiterals()

  it('finds the pages it is meant to check', () => {
    expect(literals.length).toBeGreaterThan(8)
  })

  it.each(literals.map((literal) => [literal.file, literal] as const))('%s', (_file, literal) => {
    expect(literal.title.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH)
    expect(literal.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH)
  })
})

describe('blog post snippets fit in a results page', () => {
  it.each(getAllPosts().map(({ meta: postMeta }) => [postMeta.slug, postMeta] as const))('%s', (_slug, postMeta) => {
    expect(postDocumentTitle(postMeta).length).toBeLessThanOrEqual(MAX_TITLE_LENGTH)
    expect(postDescription(postMeta).length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH)
  })
})
