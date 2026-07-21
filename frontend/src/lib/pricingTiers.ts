// Display-only pricing copy for UpgradeModal. Deliberately duplicated from
// backend/src/config/entitlements-config.ts's PLANS rather than fetched —
// the real limits enforced server-side live there; this is marketing copy
// only. If PLANS changes, update the feature bullets below to match — there
// is no runtime link between the two, by design (this module doesn't touch
// backend files).
export type BillableTier = 'starter' | 'growth' | 'agency'

// 'in' = India/Razorpay, the only region with a real payment flow behind it.
// 'intl' is display-only for now (see UpgradeModal.tsx and PricingSection.tsx
// — international CTAs route to a mailto link, never useTierCheckout).
export type Region = 'in' | 'intl'

export interface PricingTier {
  tier: BillableTier
  name: string
  pricing: { in: number; intl: number }
  description: string
  features: string[]
}

export const PRICING_TIERS: PricingTier[] = [
  {
    tier: 'starter',
    name: 'Starter',
    pricing: { in: 1999, intl: 49 },
    description: 'For a single site getting started with AI chat.',
    features: ['1 chatbot', '500 conversations/month', '50 CRM leads', 'Website knowledge base training'],
  },
  {
    tier: 'growth',
    name: 'Growth',
    pricing: { in: 5499, intl: 129 },
    description: 'For growing teams running multiple bots.',
    features: ['3 chatbots', '2,000 conversations/month', 'Unlimited CRM leads', 'Website knowledge base training'],
  },
  {
    tier: 'agency',
    name: 'Agency',
    pricing: { in: 14999, intl: 349 },
    description: 'For agencies managing chatbots at scale.',
    features: ['Unlimited chatbots', 'Unlimited conversations', 'Unlimited CRM leads', 'Website knowledge base training'],
  },
]

// Same formatting the old duplicated formatPrice() functions used for India
// (₹ + en-IN grouping) — behavior-identical for region 'in', see the
// verification report's regression check.
export function formatPrice(amount: number, region: Region): string {
  return region === 'in' ? `₹${amount.toLocaleString('en-IN')}` : `$${amount.toLocaleString('en-US')}`
}

// Timezone heuristic, zero network calls / new dependencies. Manual toggle
// always overrides this — it's only the initial guess.
// India has exactly one IANA zone, under two names: 'Asia/Kolkata' (current)
// and 'Asia/Calcutta' (pre-2006 alias, still returned by some systems'
// resolvedOptions().timeZone). No other India aliases exist in the tz
// database — confirmed against the system zoneinfo data, not assumed.
const INDIA_TIMEZONES = ['Asia/Kolkata', 'Asia/Calcutta']

export function detectRegion(): Region {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return INDIA_TIMEZONES.includes(timeZone) ? 'in' : 'intl'
  } catch {
    return 'intl'
  }
}
