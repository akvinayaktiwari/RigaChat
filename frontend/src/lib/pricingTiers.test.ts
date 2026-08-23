import { describe, expect, it } from 'vitest'
import { PRICING_TIERS, isUpgradeFrom, nextTierUp } from './pricingTiers'

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

  it('relies on PRICING_TIERS staying in ascending price order', () => {
    const prices = PRICING_TIERS.map((t) => t.pricing.in)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
  })
})
