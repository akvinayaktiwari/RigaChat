// Display-only pricing copy for UpgradeModal. Deliberately duplicated from
// backend/src/config/entitlements-config.ts's PLANS rather than fetched —
// the real limits enforced server-side live there; this is marketing copy
// only. If PLANS changes, update the feature bullets below to match — there
// is no runtime link between the two, by design (this module doesn't touch
// backend files).
import type { PlanTier } from '../types/index'

export type BillableTier = 'starter' | 'growth' | 'agency'

export interface PricingTier {
  tier: BillableTier
  name: string
  /** The price, in USD. The only price there is — see PRICING_TIERS below. */
  priceUsd: number
  description: string
  features: string[]
}

/**
 * One global price list, in USD, charged in USD.
 *
 * There used to be a rupee list beside it (and, before that, a cheaper India
 * tier). Both are gone: the product sells globally and quotes one currency, so
 * the number on the page is the number on the card for every visitor.
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

/** The price as shown everywhere a plan is quoted. */
export function formatPrice(priceUsd: number): string {
  return `$${priceUsd.toLocaleString('en-US')}`
}
