// Display-only pricing copy for UpgradeModal. Deliberately duplicated from
// backend/src/config/entitlements-config.ts's PLANS rather than fetched —
// the real limits enforced server-side live there; this is marketing copy
// only. If PLANS changes, update the feature bullets below to match — there
// is no runtime link between the two, by design (this module doesn't touch
// backend files).
export type BillableTier = 'starter' | 'growth' | 'agency'

export interface PricingTier {
  tier: BillableTier
  name: string
  priceInRupees: number
  description: string
  features: string[]
}

export const PRICING_TIERS: PricingTier[] = [
  {
    tier: 'starter',
    name: 'Starter',
    priceInRupees: 1999,
    description: 'For a single site getting started with AI chat.',
    features: ['1 chatbot', '500 conversations/month', '50 CRM leads', 'Website knowledge base training'],
  },
  {
    tier: 'growth',
    name: 'Growth',
    priceInRupees: 5499,
    description: 'For growing teams running multiple bots.',
    features: ['3 chatbots', '2,000 conversations/month', 'Unlimited CRM leads', 'Website knowledge base training'],
  },
  {
    tier: 'agency',
    name: 'Agency',
    priceInRupees: 14999,
    description: 'For agencies managing chatbots at scale.',
    features: ['Unlimited chatbots', 'Unlimited conversations', 'Unlimited CRM leads', 'Website knowledge base training'],
  },
]
