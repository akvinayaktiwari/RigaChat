import { Check } from 'lucide-react'
import { PRICING_TIERS, formatPrice } from '../../lib/pricingTiers'
import type { BillableTier, Region } from '../../lib/pricingTiers'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const MOST_POPULAR_TIER: BillableTier = 'growth'

// International tiers are display-only — no international payment provider
// exists yet, so their CTA routes to this mailto instead of useTierCheckout.
const INTL_CONTACT_EMAIL = 'support@vyostra.com'

interface PricingSectionProps {
  // Not wired up yet — checkout/signup wiring is a later module. Defaults to
  // a console.log so this component is usable standalone until then.
  onSelectTier?: (tier: BillableTier) => void
  region: Region
  onRegionChange: (region: Region) => void
}

export default function PricingSection({
  onSelectTier = (tier) => console.log('[PricingSection] onSelectTier not wired yet:', tier),
  region,
  onRegionChange,
}: PricingSectionProps) {
  return (
    <section id="plans" className="py-24 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-violet-600 uppercase tracking-widest mb-3">Pricing</p>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4"
            style={JAKARTA_FONT}
          >
            Simple, transparent pricing
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto mb-8">
            Pick a plan and get started today. Cancel anytime.
          </p>

          <div className="inline-flex bg-gray-50 border border-gray-200 rounded-full p-1">
            <button
              type="button"
              onClick={() => onRegionChange('in')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                region === 'in' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🇮🇳 India (₹)
            </button>
            <button
              type="button"
              onClick={() => onRegionChange('intl')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                region === 'intl' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🌍 International ($)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PRICING_TIERS.map((plan) => {
            const isMostPopular = plan.tier === MOST_POPULAR_TIER
            const ctaClasses = `w-full flex items-center justify-center gap-2 font-semibold px-4 py-2.5 rounded-xl text-sm transition-opacity ${
              isMostPopular
                ? 'bg-linear-to-r from-violet-600 to-purple-500 text-white shadow-md shadow-violet-200/50 hover:opacity-90'
                : 'bg-gray-50 text-gray-900 border border-gray-200 hover:bg-gray-100'
            }`

            return (
              <div
                key={plan.tier}
                className={`relative bg-white rounded-2xl border p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-black/6 ${
                  isMostPopular ? 'border-violet-400 ring-2 ring-violet-100' : 'border-black/5'
                }`}
              >
                {isMostPopular && (
                  <span className="absolute -top-3 left-6 bg-linear-to-r from-violet-600 to-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}

                <h3 className="font-bold text-lg text-gray-900 mb-1" style={JAKARTA_FONT}>
                  {plan.name}
                </h3>
                <p className="text-xs text-gray-500 mb-4">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-3xl font-extrabold text-gray-900" style={JAKARTA_FONT}>
                    {formatPrice(plan.pricing[region], region)}
                  </span>
                  <span className="text-sm text-gray-400">/mo</span>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-gray-600">
                      <Check size={15} className="text-violet-500 shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {region === 'in' ? (
                  <button type="button" onClick={() => onSelectTier(plan.tier)} className={ctaClasses}>
                    Get Started
                  </button>
                ) : (
                  <a
                    href={`mailto:${INTL_CONTACT_EMAIL}?subject=International ${plan.name} plan enquiry`}
                    className={ctaClasses}
                  >
                    Contact us
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
