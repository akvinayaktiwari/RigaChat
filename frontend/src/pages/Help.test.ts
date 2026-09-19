import { describe, expect, it } from 'vitest'
import { HELP_ARTICLES, HELP_CATEGORIES } from './Help'

describe('help center content', () => {
  // Answers render grouped by category, but FAQPage schema lists every article.
  // An article whose category does not exist would drop off the page and stay
  // in the schema -- structured data answering what the page does not, which
  // is a Google spam-policy violation.
  it('files every article under a category that renders', () => {
    const categoryIds = new Set(HELP_CATEGORIES.map((category) => category.id))
    expect(HELP_ARTICLES.filter((article) => !categoryIds.has(article.categoryId)).map((article) => article.id)).toEqual([])
  })

  it('phrases every section heading as a question', () => {
    expect(HELP_CATEGORIES.filter((category) => !category.heading.endsWith('?')).map((category) => category.id)).toEqual([])
  })
})
