import { describe, expect, it } from 'vitest'
import {
  EMPTY_COMMISSION_FORM,
  EXAMPLE_COMMISSION_FORM,
  calculateCommission,
  commissionLines,
  commissionSummary,
  formatMoney,
  type CommissionForm,
  type CommissionResult,
} from './commission-calculator'

function form(overrides: Partial<CommissionForm>): CommissionForm {
  return { ...EMPTY_COMMISSION_FORM, salePrice: '1000000', commission: '2', ...overrides }
}

function result(overrides: Partial<CommissionForm>): CommissionResult {
  const outcome = calculateCommission(form(overrides))
  if (!outcome.ok) throw new Error(outcome.errors.join(' '))
  return outcome.result
}

describe('calculateCommission', () => {
  it('takes a percentage of the price and gives half to the listing side by default', () => {
    const r = result({})
    expect(r.totalCommission).toBe(20000)
    expect(r.sideCommission).toBe(10000)
    expect(r.agentTakeHome).toBe(10000)
  })

  it('gives the buyer side the other part of the split', () => {
    expect(result({ side: 'buyer', listingSharePercent: '60' }).sideCommission).toBe(8000)
  })

  it('gives a dual agent the whole commission', () => {
    expect(result({ side: 'both' }).sideCommission).toBe(20000)
  })

  it('uses a flat fee as the total, ignoring the price', () => {
    const r = result({ basis: 'flat', commission: '7,500', salePrice: '1' })
    expect(r.totalCommission).toBe(7500)
  })

  it('does not need a price for a flat fee, and leaves it out of the summary', () => {
    const f = { ...EMPTY_COMMISSION_FORM, basis: 'flat' as const, commission: '5000' }
    const outcome = calculateCommission(f)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(commissionSummary(outcome.result, f, 'USD').startsWith('Total commission on the sale')).toBe(true)
  })

  it('takes the referral fee off the side commission before the brokerage split', () => {
    const r = result({ side: 'both', referralPercent: '25', agentSplitPercent: '80' })
    expect(r.referralFee).toBe(5000)
    expect(r.agentBeforeTax).toBe(12000)
    expect(r.brokerageShare).toBe(3000)
  })

  it('takes tax from what the agent keeps after the brokerage', () => {
    const r = result({ side: 'both', agentSplitPercent: '50', taxPercent: '20' })
    expect(r.agentBeforeTax).toBe(10000)
    expect(r.tax).toBe(2000)
    expect(r.agentTakeHome).toBe(8000)
  })

  // The three shares must add back to the side commission to the cent, however
  // the rounding falls, or the itemised table would not add up on screen.
  it('keeps the lines adding up when the rounding is awkward', () => {
    const r = result({ salePrice: '333333.33', commission: '2.75', listingSharePercent: '33.3', referralPercent: '7.7', agentSplitPercent: '63.3', taxPercent: '18.5' })
    const sum = Math.round((r.referralFee + r.brokerageShare + r.agentBeforeTax) * 100)
    expect(sum).toBe(Math.round(r.sideCommission * 100))
    expect(Math.round((r.tax + r.agentTakeHome) * 100)).toBe(Math.round(r.agentBeforeTax * 100))
  })

  it('treats a blank referral fee and tax as zero but demands the rest', () => {
    const outcome = calculateCommission({ ...EMPTY_COMMISSION_FORM, referralPercent: '', taxPercent: '' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.errors).toEqual(['Enter the sale price.', 'Enter the commission rate.'])
  })

  it('rejects a percentage over 100, a negative number and text', () => {
    const outcome = calculateCommission(form({ commission: '120', taxPercent: '-5', referralPercent: 'ten' }))
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.errors).toHaveLength(3)
  })

  it('accepts thousands separators and a decimal point', () => {
    expect(result({ salePrice: '1,250,000.50' }).totalCommission).toBe(25000.01)
  })

  it('works on the labelled example', () => {
    const outcome = calculateCommission(EXAMPLE_COMMISSION_FORM)
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.result.totalCommission).toBe(15000)
  })
})

describe('commissionLines and commissionSummary', () => {
  it('marks the deductions and names the side', () => {
    const r = result({ side: 'buyer' })
    const lines = commissionLines(r, form({ side: 'buyer' }))
    expect(lines.filter((line) => line.deduction).map((line) => line.label)).toEqual(['Referral fee', 'Brokerage share', 'Tax on commission'])
    expect(lines[1]?.label).toBe('Buyer side commission')
  })

  it('writes a plain-text summary that repeats the sale price', () => {
    const f = form({ side: 'both' })
    const text = commissionSummary(result({ side: 'both' }), f, 'USD')
    expect(text.split('\n')[0]).toBe('Sale price: $1,000,000.00')
    expect(text).toContain('Total commission on the sale: $20,000.00')
    expect(text).toContain('Tax on commission: -$0.00')
  })
})

describe('formatMoney', () => {
  it('formats each supported currency', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50')
    expect(formatMoney(1234.5, 'GBP')).toBe('£1,234.50')
    expect(formatMoney(1234.5, 'AED')).toContain('1,234.50')
  })
})
