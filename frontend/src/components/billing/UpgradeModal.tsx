import { useEffect } from 'react'
import { AlertTriangle, Check, CheckCircle2, Loader2, X } from 'lucide-react'
import { PRICING_TIERS } from '../../lib/pricingTiers'
import type { BillableTier } from '../../lib/pricingTiers'
import { useTierCheckout } from '../../hooks/useTierCheckout'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

// Static marketing label — matches PricingSection.tsx's own MOST_POPULAR_TIER
// constant. Independent of suggestedTier: Growth is "Most Popular" for every
// visitor, regardless of which tier is being recommended to them.
const MOST_POPULAR_TIER: BillableTier = 'growth'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  suggestedTier?: BillableTier
}

function formatPrice(rupees: number): string {
  return `₹${rupees.toLocaleString('en-IN')}`
}

export default function UpgradeModal({ isOpen, onClose, suggestedTier }: UpgradeModalProps) {
  const { stage, submittingTier, errorMessage, pendingCheckout, selectTier, reset } = useTierCheckout(() => {
    setTimeout(() => onClose(), 1500)
  })

  useEffect(() => {
    if (!isOpen) reset()
    // reset() is stable across renders (defined fresh each render but only
    // its behavior matters here); isOpen is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 sm:p-8 max-w-4xl w-full relative max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          title="Close"
        >
          <X size={20} />
        </button>

        {stage === 'idle' && (
          <>
            <h2 className="font-bold text-2xl text-gray-900 mb-1" style={JAKARTA_FONT}>
              Choose your plan
            </h2>
            <p className="text-sm text-gray-500 mb-6">All plans include a 14-day free trial. Cancel anytime.</p>

            {errorMessage && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                {errorMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {PRICING_TIERS.map((plan) => {
                // Two independent concepts: isMostPopular is fixed marketing
                // copy (always Growth), isSuggested is a per-account dynamic
                // recommendation. Both drive the same highlight treatment
                // (border/ring, filled button) — isHighlighted — but the
                // badge text picks "Most Popular" first so a card never shows
                // two overlapping pills when suggestedTier happens to be Growth.
                const isMostPopular = plan.tier === MOST_POPULAR_TIER
                const isSuggested = suggestedTier === plan.tier
                const isHighlighted = isMostPopular || isSuggested
                const isResuming = pendingCheckout?.tier === plan.tier
                const isSubmitting = submittingTier === plan.tier

                return (
                  <div
                    key={plan.tier}
                    className={`relative bg-white rounded-2xl border p-6 shadow-sm transition-all duration-300 ${
                      isHighlighted ? 'border-violet-400 ring-2 ring-violet-100' : 'border-black/5'
                    }`}
                  >
                    {isHighlighted && (
                      <span className="absolute -top-3 left-6 bg-linear-to-r from-violet-600 to-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                        {isMostPopular ? 'Most Popular' : 'Recommended for you'}
                      </span>
                    )}

                    <h3 className="font-bold text-lg text-gray-900 mb-1" style={JAKARTA_FONT}>
                      {plan.name}
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">{plan.description}</p>

                    <div className="flex items-baseline gap-1 mb-5">
                      <span className="text-3xl font-extrabold text-gray-900" style={JAKARTA_FONT}>
                        {formatPrice(plan.priceInRupees)}
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

                    <button
                      type="button"
                      onClick={() => selectTier(plan.tier)}
                      disabled={submittingTier !== null}
                      className={`w-full flex items-center justify-center gap-2 font-semibold px-4 py-2.5 rounded-xl text-sm transition-opacity disabled:opacity-50 ${
                        isHighlighted
                          ? 'bg-linear-to-r from-violet-600 to-purple-500 text-white shadow-md shadow-violet-200/50 hover:opacity-90'
                          : 'bg-gray-50 text-gray-900 border border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                      {isSubmitting ? 'Starting checkout...' : isResuming ? 'Resume checkout' : `Choose ${plan.name}`}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {stage === 'polling' && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <Loader2 size={40} className="text-violet-500 animate-spin mb-4" />
            <h2 className="font-bold text-xl text-gray-900 mb-2" style={JAKARTA_FONT}>
              Confirming your payment...
            </h2>
            <p className="text-sm text-gray-500 max-w-xs">
              This usually takes a few seconds. Don&apos;t close this window.
            </p>
          </div>
        )}

        {stage === 'success' && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <CheckCircle2 size={40} className="text-emerald-500 mb-4" />
            <h2 className="font-bold text-xl text-gray-900 mb-2" style={JAKARTA_FONT}>
              You&apos;re all set!
            </h2>
            <p className="text-sm text-gray-500 max-w-xs">Your subscription is now active.</p>
          </div>
        )}

        {stage === 'timeout' && (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <AlertTriangle size={40} className="text-amber-500 mb-4" />
            <h2 className="font-bold text-xl text-gray-900 mb-2" style={JAKARTA_FONT}>
              Payment received
            </h2>
            <p className="text-sm text-gray-500 max-w-xs mb-6">
              This can take a minute to reflect — refresh shortly and it should be active.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
