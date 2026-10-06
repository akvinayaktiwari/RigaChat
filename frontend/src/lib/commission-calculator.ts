/**
 * The arithmetic behind the free real estate commission calculator.
 *
 * Everything here is an input the visitor types. The module holds no commission
 * rate, split or tax rate of its own: rates are agreed between the parties and
 * differ by market, so a default would read as a standard. The page's worked
 * example uses round numbers and says they are hypothetical.
 *
 * Order of deductions, stated on the page because brokerages differ:
 *   1. the commission on the sale (a percentage of the price, or a flat fee)
 *   2. the share that belongs to the side the visitor acts for
 *   3. a referral fee, as a percentage of that share
 *   4. the brokerage split: the agent keeps a percentage of what is left
 *   5. tax on the agent's take, as a percentage the visitor enters
 *
 * Money is rounded to cents after each step, and the brokerage's share is the
 * remainder rather than a second rounding, so the lines always add up.
 */

export type CommissionBasis = 'percent' | 'flat'
export type SideActedFor = 'listing' | 'buyer' | 'both'

export const COMMISSION_CURRENCIES = ['USD', 'AED', 'GBP', 'AUD', 'CAD', 'INR'] as const
export type CommissionCurrency = (typeof COMMISSION_CURRENCIES)[number]

/** The form as typed: every number is still a string, because the field may be half-filled. */
export interface CommissionForm {
  salePrice: string
  basis: CommissionBasis
  /** A percentage when basis is "percent", an amount of money when it is "flat". */
  commission: string
  side: SideActedFor
  /** Percentage of the total commission that belongs to the listing side. Used when the visitor acts for one side. */
  listingSharePercent: string
  referralPercent: string
  /** Percentage of the remainder the agent keeps after the brokerage. */
  agentSplitPercent: string
  taxPercent: string
}

export interface CommissionResult {
  totalCommission: number
  /** The part of the total that belongs to the side the visitor acts for. */
  sideCommission: number
  referralFee: number
  brokerageShare: number
  agentBeforeTax: number
  tax: number
  agentTakeHome: number
}

export type CommissionOutcome = { ok: true; result: CommissionResult } | { ok: false; errors: string[] }

export const EMPTY_COMMISSION_FORM: CommissionForm = {
  salePrice: '',
  basis: 'percent',
  commission: '',
  side: 'listing',
  listingSharePercent: '50',
  referralPercent: '0',
  agentSplitPercent: '100',
  taxPercent: '0',
}

/** Round numbers that are plainly an illustration. They are not typical rates. */
export const EXAMPLE_COMMISSION_FORM: CommissionForm = {
  salePrice: '500000',
  basis: 'percent',
  commission: '3',
  side: 'listing',
  listingSharePercent: '50',
  referralPercent: '10',
  agentSplitPercent: '70',
  taxPercent: '20',
}

const MAX_PERCENT = 100

function toCents(value: number): number {
  return Math.round(value * 100)
}

function fromCents(cents: number): number {
  return cents / 100
}

/** A blank field is "not given" (undefined); anything that is not a plain non-negative number is NaN. */
function parseAmount(raw: string): number | undefined {
  const trimmed = raw.trim().replace(/,/g, '')
  if (trimmed === '') return undefined
  if (!/^\d*\.?\d+$|^\d+\.$/.test(trimmed)) return Number.NaN
  return Number(trimmed)
}

function checkPercent(label: string, raw: string, errors: string[], blankIs: number | null): number {
  const value = parseAmount(raw)
  if (value === undefined) {
    if (blankIs === null) errors.push(`Enter ${label}.`)
    return blankIs ?? 0
  }
  if (Number.isNaN(value) || value > MAX_PERCENT) {
    errors.push(`${label.charAt(0).toUpperCase()}${label.slice(1)} must be a number from 0 to ${MAX_PERCENT}.`)
    return 0
  }
  return value
}

function checkMoney(label: string, raw: string, errors: string[]): number {
  const value = parseAmount(raw)
  if (value === undefined) {
    errors.push(`Enter ${label}.`)
    return 0
  }
  if (Number.isNaN(value)) {
    errors.push(`${label.charAt(0).toUpperCase()}${label.slice(1)} must be a number that is not negative.`)
    return 0
  }
  return value
}

interface ParsedForm {
  salePrice: number
  commission: number
  listingShare: number
  referral: number
  agentSplit: number
  tax: number
}

function parseForm(form: CommissionForm, errors: string[]): ParsedForm {
  // A flat fee does not depend on the price, so the price may stay blank.
  const salePrice = form.basis === 'flat' && form.salePrice.trim() === '' ? 0 : checkMoney('the sale price', form.salePrice, errors)
  const commission =
    form.basis === 'percent'
      ? checkPercent('the commission rate', form.commission, errors, null)
      : checkMoney('the flat commission', form.commission, errors)
  return {
    salePrice,
    commission,
    listingShare: checkPercent("the listing side's share", form.listingSharePercent, errors, null),
    referral: checkPercent('the referral fee', form.referralPercent, errors, 0),
    agentSplit: checkPercent("the agent's share of the split", form.agentSplitPercent, errors, null),
    tax: checkPercent('the tax rate', form.taxPercent, errors, 0),
  }
}

function sideFraction(side: SideActedFor, listingSharePercent: number): number {
  if (side === 'both') return 1
  return (side === 'listing' ? listingSharePercent : MAX_PERCENT - listingSharePercent) / MAX_PERCENT
}

function totalCommissionCents(form: CommissionForm, parsed: ParsedForm): number {
  return form.basis === 'percent' ? toCents((parsed.salePrice * parsed.commission) / MAX_PERCENT) : toCents(parsed.commission)
}

export function calculateCommission(form: CommissionForm): CommissionOutcome {
  const errors: string[] = []
  const parsed = parseForm(form, errors)
  if (errors.length > 0) return { ok: false, errors }

  const total = totalCommissionCents(form, parsed)
  const side = Math.round(total * sideFraction(form.side, parsed.listingShare))
  const referral = Math.round((side * parsed.referral) / MAX_PERCENT)
  const afterReferral = side - referral
  const agentBeforeTax = Math.round((afterReferral * parsed.agentSplit) / MAX_PERCENT)
  const tax = Math.round((agentBeforeTax * parsed.tax) / MAX_PERCENT)

  return {
    ok: true,
    result: {
      totalCommission: fromCents(total),
      sideCommission: fromCents(side),
      referralFee: fromCents(referral),
      brokerageShare: fromCents(afterReferral - agentBeforeTax),
      agentBeforeTax: fromCents(agentBeforeTax),
      tax: fromCents(tax),
      agentTakeHome: fromCents(agentBeforeTax - tax),
    },
  }
}

export function formatMoney(amount: number, currency: CommissionCurrency): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

export interface CommissionLine {
  label: string
  amount: number
  /** A deduction is shown with a minus sign. */
  deduction: boolean
}

export function commissionLines(result: CommissionResult, form: CommissionForm): CommissionLine[] {
  const sideLabel = form.side === 'both' ? 'Commission for both sides' : form.side === 'listing' ? 'Listing side commission' : 'Buyer side commission'
  return [
    { label: 'Total commission on the sale', amount: result.totalCommission, deduction: false },
    { label: sideLabel, amount: result.sideCommission, deduction: false },
    { label: 'Referral fee', amount: result.referralFee, deduction: true },
    { label: 'Brokerage share', amount: result.brokerageShare, deduction: true },
    { label: 'Agent commission before tax', amount: result.agentBeforeTax, deduction: false },
    { label: 'Tax on commission', amount: result.tax, deduction: true },
    { label: 'Agent take-home', amount: result.agentTakeHome, deduction: false },
  ]
}

/** The result as plain text, for the copy button. The inputs the visitor typed are included so the summary explains itself. */
export function commissionSummary(result: CommissionResult, form: CommissionForm, currency: CommissionCurrency): string {
  const price = Number(form.salePrice.replace(/,/g, ''))
  const header = price > 0 ? [`Sale price: ${formatMoney(price, currency)}`] : []
  const lines = commissionLines(result, form).map(
    (line) => `${line.label}: ${line.deduction ? '-' : ''}${formatMoney(line.amount, currency)}`,
  )
  return [...header, ...lines].join('\n')
}
