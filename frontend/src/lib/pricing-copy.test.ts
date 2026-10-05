import { describe, expect, it } from 'vitest'
import pricingPageSource from '../pages/Pricing.tsx?raw'
import { PRICING_TIERS, formatPrice } from './pricingTiers'
import { planPriceList, pricingFaq, pricingSummary } from './pricing-copy'

describe('planPriceList', () => {
  it('reads as one sentence fragment, cheapest plan first', () => {
    expect(planPriceList(PRICING_TIERS)).toBe('$49 a month on Starter, $129 on Growth and $349 on Agency')
  })

  it('needs no "and" for a single plan', () => {
    expect(planPriceList(PRICING_TIERS.slice(0, 1))).toBe('$49 a month on Starter')
  })
})

describe('pricing copy', () => {
  // The prose is quoted by answer engines; it must say what the plan cards say.
  it.each(PRICING_TIERS)('states the $name plan at the price its card shows', (tier) => {
    expect(pricingSummary(PRICING_TIERS)).toContain(`${formatPrice(tier.priceUsd)} `)
  })

  // The site quotes one currency. A rupee figure anywhere in the pricing prose
  // would be a price nobody can pay, since checkout offers no INR plan.
  it('quotes no currency but US dollars', () => {
    const prose = pricingFaq(PRICING_TIERS).map((item) => `${item.question} ${item.answer}`).join(' ')
    expect(prose).not.toMatch(/₹|\bINR\b|rupee|UPI/i)
    expect(pricingPageSource).not.toMatch(/₹|\bINR\b|rupee/i)
  })

  // The meta description is a string literal (the snippet-length guard reads
  // it from source), so it is the one place a price is typed by hand.
  it.each(PRICING_TIERS)('names the $name price in the pricing page description', (tier) => {
    const description = pricingPageSource.match(/description="([^"]*)"/)?.[1] ?? ''
    expect(description).toMatch(new RegExp(`\\$${tier.priceUsd}\\b`))
  })

  it('answers every question with a full sentence', () => {
    const unfinished = pricingFaq(PRICING_TIERS).filter((item) => !item.question.endsWith('?') || !item.answer.endsWith('.'))
    expect(unfinished).toEqual([])
  })
})
