import { describe, expect, it } from 'vitest'

/**
 * Vyostra AI sells globally and quotes one currency. These guards read the
 * source of everything a visitor or a customer can see, because the copy that
 * drifts back is never the copy someone is looking at: it is a footer line, a
 * demo conversation, a meta description.
 *
 * Blog posts are exempt. A post written for one market names that market and
 * uses its currency on purpose, and says so in its `market` tag.
 */
const sources = import.meta.glob<string>(
  ['../**/*.{ts,tsx,mdx}', '!../**/*.test.{ts,tsx}', '!../content/blog/**'],
  { query: '?raw', import: 'default', eager: true }
)

function filesMatching(pattern: RegExp): string[] {
  return Object.entries(sources)
    .filter(([, source]) => pattern.test(source))
    .map(([path]) => path)
}

describe('the site outside the blog', () => {
  it('reads at least the pages it is meant to guard', () => {
    expect(Object.keys(sources)).toEqual(
      expect.arrayContaining(['../components/landing/Footer.tsx', '../pages/Pricing.tsx', '../pages/About.tsx', './crawl-files.ts'])
    )
  })

  it('does not describe the product as being for Indian businesses', () => {
    expect(filesMatching(/indian (businesses|smbs?)/i)).toEqual([])
  })

  // Checkout offers USD plans only, so a rupee figure is a price nobody can pay.
  it('quotes no rupee prices', () => {
    expect(filesMatching(/₹|\bINR\b|rupee/i)).toEqual([])
  })
})
