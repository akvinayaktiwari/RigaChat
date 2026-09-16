// Display-only pricing copy for UpgradeModal. Deliberately duplicated from
// backend/src/config/entitlements-config.ts's PLANS rather than fetched —
// the real limits enforced server-side live there; this is marketing copy
// only. If PLANS changes, update the feature bullets below to match — there
// is no runtime link between the two, by design (this module doesn't touch
// backend files).
import type { PlanTier } from '../types/index'

export type BillableTier = 'starter' | 'growth' | 'agency'

// 'in' = India/Razorpay, the only region with a real payment flow behind it.
// 'intl' is display-only for now (see UpgradeModal.tsx and PricingSection.tsx
// — international CTAs route to a mailto link, never useTierCheckout).
export type Region = 'in' | 'intl'

export interface PricingTier {
  tier: BillableTier
  name: string
  /** The price, in USD. The only price there is — see PRICING_TIERS below. */
  priceUsd: number
  description: string
  features: string[]
}

/**
 * The rate that DERIVED the rupee price list — not a live conversion applied at
 * checkout. Indian customers are charged in rupees, against Razorpay INR plans
 * created at exactly inrDisplayPrice() for each tier, so the number on the page
 * is the number on the card.
 *
 * Changing this constant therefore changes what the page claims and nothing
 * else: the plans are immutable, so a new rate means creating new Razorpay
 * plans and swapping RAZORPAY_PLAN_ID_*_INR. Leave it alone unless doing both.
 * Set 2026-09-16.
 */
export const USD_TO_INR_DISPLAY = 88

/** Converted, then rounded to a price-shaped number rather than an exact one. */
export function inrDisplayPrice(usd: number): number {
  return Math.round((usd * USD_TO_INR_DISPLAY) / 100) * 100 - 1
}

/**
 * One global price list, in USD.
 *
 * India used to be priced separately and lower (₹1,999/₹5,499/₹14,999). That
 * split is gone: the product sells globally, and a cheaper local tier priced
 * the work below what it is worth. Everyone sees the same number, and Indian
 * visitors can view it converted (see formatPrice) while still being billed in
 * USD.
 */
export const PRICING_TIERS: PricingTier[] = [
  {
    tier: 'starter',
    name: 'Starter',
    priceUsd: 49,
    description: 'For a single site getting started with AI chat.',
    features: ['1 agent', '500 conversations/month', '50 CRM leads', 'Website knowledge base training'],
  },
  {
    tier: 'growth',
    name: 'Growth',
    priceUsd: 129,
    description: 'For growing teams running multiple bots.',
    features: ['3 agents', '2,000 conversations/month', 'Unlimited CRM leads', 'Website knowledge base training'],
  },
  {
    tier: 'agency',
    name: 'Agency',
    priceUsd: 349,
    description: 'For agencies managing agents at scale.',
    features: ['Unlimited agents', 'Unlimited conversations', 'Unlimited CRM leads', 'Website knowledge base training'],
  },
]

// Ladder position, used to compare an account's current plan against a
// purchasable tier. 'free' is absent from PRICING_TIERS — nobody buys it — but
// every account starts there, so it still has to be orderable against the
// billable tiers.
const TIER_RANK: Record<PlanTier, number> = { free: 0, starter: 1, growth: 2, agency: 3 }

// True when `tier` sits strictly above the account's current plan. Same-tier is
// deliberately false: re-buying the plan you already have is not an upgrade,
// and billing-routes.ts 409s ALREADY_SUBSCRIBED on it anyway.
export function isUpgradeFrom(current: PlanTier, tier: BillableTier): boolean {
  return TIER_RANK[tier] > TIER_RANK[current]
}

// The next tier above the current plan, or undefined at the top of the ladder
// (agency), where there is nothing left to sell. Relies on PRICING_TIERS being
// in ascending price order, which it is.
export function nextTierUp(current: PlanTier): BillableTier | undefined {
  return PRICING_TIERS.find((t) => isUpgradeFrom(current, t.tier))?.tier
}

/**
 * The price as shown for a region — and, since the INR plans charge exactly
 * this, the amount an Indian customer is billed. No "≈": the rupee plan holds
 * this number, so showing an approximation would understate what we know.
 *
 * The Razorpay INR plans MUST be created at exactly inrDisplayPrice(usd) for
 * each tier, or the page and the charge disagree.
 */
export function formatPrice(priceUsd: number, region: Region): string {
  if (region === 'in') return `₹${inrDisplayPrice(priceUsd).toLocaleString('en-IN')}`
  return `$${priceUsd.toLocaleString('en-US')}`
}

/** Which Razorpay plan a region's checkout is created against. */
export function currencyForRegion(region: Region): 'INR' | 'USD' {
  return region === 'in' ? 'INR' : 'USD'
}

/** Why the rupee list exists at all — the methods a USD plan cannot accept. */
export const INR_METHODS_NOTE = 'Pay by UPI, netbanking, RuPay or card'

// Timezone heuristic, zero network calls / new dependencies. Manual toggle
// always overrides this — it's only the initial guess.
// India has exactly one IANA zone, under two names: 'Asia/Kolkata' (current)
// and 'Asia/Calcutta' (pre-2006 alias, still returned by some systems'
// resolvedOptions().timeZone). No other India aliases exist in the tz
// database — confirmed against the system zoneinfo data, not assumed.
const INDIA_TIMEZONES = ['Asia/Kolkata', 'Asia/Calcutta']

export function detectRegion(): Region {
  // The build-time prerender has no visitor to detect, only the build machine's
  // timezone. It renders the USD list: that is the real, global price, it is the
  // currency cards are charged in, and it is what the SoftwareApplication schema
  // on the same page publishes -- a static page showing a converted rupee figure
  // while its own schema says USD is a contradiction crawlers get to see.
  // An Indian visitor still lands on 'in' once the bundle boots and the
  // timezone check below runs.
  if (typeof window === 'undefined') return 'intl'

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return INDIA_TIMEZONES.includes(timeZone) ? 'in' : 'intl'
  } catch {
    return 'intl'
  }
}
