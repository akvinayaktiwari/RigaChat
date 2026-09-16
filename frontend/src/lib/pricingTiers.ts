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
 * Rupee figures shown next to the USD price are a conversion of it, nothing
 * more. Billing is in USD everywhere, so this rate only has to be close enough
 * to set expectations; it is a display constant, deliberately not a live rate
 * (a price that moves with the currency market is a support ticket, not a
 * feature). Set 2026-09-16 — update it when it drifts far enough to mislead.
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
 * The price as shown for a region.
 *
 * 'in' renders the converted rupee figure with a "≈" because that is what it
 * is: the card is charged in USD, and the bank's rate on the day decides the
 * exact rupee amount. Dropping the "≈" would be a promise we do not control.
 */
export function formatPrice(priceUsd: number, region: Region): string {
  if (region === 'in') return `≈ ₹${inrDisplayPrice(priceUsd).toLocaleString('en-IN')}`
  return `$${priceUsd.toLocaleString('en-US')}`
}

/** Shown wherever a converted price is: the currency actually charged. */
export const BILLING_CURRENCY_NOTE = 'Billed in USD'

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
