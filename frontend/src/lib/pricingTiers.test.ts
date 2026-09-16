import { describe, expect, it } from 'vitest'
import { PRICING_TIERS, currencyForRegion, formatPrice, inrDisplayPrice, isUpgradeFrom, nextTierUp } from './pricingTiers'

describe('isUpgradeFrom', () => {
  it('treats a higher tier as an upgrade', () => {
    expect(isUpgradeFrom('free', 'starter')).toBe(true)
    expect(isUpgradeFrom('starter', 'agency')).toBe(true)
  })

  it('does not treat the current tier as an upgrade', () => {
    expect(isUpgradeFrom('growth', 'growth')).toBe(false)
  })

  it('does not treat a lower tier as an upgrade', () => {
    expect(isUpgradeFrom('agency', 'starter')).toBe(false)
    expect(isUpgradeFrom('growth', 'starter')).toBe(false)
  })
})

describe('nextTierUp', () => {
  it('suggests the tier immediately above the current plan', () => {
    expect(nextTierUp('free')).toBe('starter')
    expect(nextTierUp('starter')).toBe('growth')
    expect(nextTierUp('growth')).toBe('agency')
  })

  it('suggests nothing at the top of the ladder', () => {
    expect(nextTierUp('agency')).toBeUndefined()
  })

  it('prices in USD only — the separate, cheaper India tier is gone', () => {
    expect(PRICING_TIERS.map((t) => t.priceUsd)).toEqual([49, 129, 349])
    expect(formatPrice(49, 'intl')).toBe('$49')
  })

  // Exact, not approximate: the Razorpay INR plan holds this number, so the
  // page and the charge are the same figure. Create the plans at these amounts.
  it('shows the rupee price the INR plans charge', () => {
    expect(formatPrice(49, 'in')).toBe('₹4,299')
    expect(PRICING_TIERS.map((t) => inrDisplayPrice(t.priceUsd))).toEqual([4299, 11399, 30699])
  })

  it('maps a region to the plan currency its checkout uses', () => {
    expect(currencyForRegion('in')).toBe('INR')
    expect(currencyForRegion('intl')).toBe('USD')
  })

  it('relies on PRICING_TIERS staying in ascending price order', () => {
    const prices = PRICING_TIERS.map((t) => t.priceUsd)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
  })
})
