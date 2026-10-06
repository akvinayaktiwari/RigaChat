import { describe, expect, it } from 'vitest'

/**
 * Vyostra AI sells globally and leads with US dollars. These guards read the
 * source of everything a visitor or a customer can see, because the copy that
 * drifts back is never the copy someone is looking at: it is a footer line, a
 * demo conversation, a meta description.
 *
 * Rupees survive in one place on purpose: a customer in India can switch the
 * price list to INR and pay by UPI or netbanking. That is a payment option, so
 * it lives in the pricing and checkout files named below and nowhere else.
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

  // The India payment option, end to end: the price list, its copy, the toggle,
  // checkout, the payment history, and the terms that describe billing. The
  // commission calculator is here too, for a different reason: INR is one of
  // the six currencies its visitor can pick, with USD selected by default.
  const RUPEE_OPTION_FILES = [
    '../components/billing/UpgradeModal.tsx',
    '../components/landing/PricingSection.tsx',
    '../hooks/useTierCheckout.ts',
    '../pages/BillingPage.tsx',
    '../pages/Pricing.tsx',
    '../pages/Terms.tsx',
    '../services/api.ts',
    './commission-calculator.ts',
    './crawl-files.ts',
    './pricing-copy.ts',
    './pricingTiers.ts',
  ]

  it('mentions rupees only where a customer in India chooses to pay in them', () => {
    const stray = filesMatching(/₹|\bINR\b|rupee/i).filter((path) => !RUPEE_OPTION_FILES.includes(path))
    expect(stray).toEqual([])
  })
})
