import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Loader2, X } from 'lucide-react'
import { PRICING_TIERS, detectRegion, formatPrice, isUpgradeFrom, nextTierUp } from '../../lib/pricingTiers'
import type { Region } from '../../lib/pricingTiers'
import type { PlanTier } from '../../types/index'
import { useTierCheckout } from '../../hooks/useTierCheckout'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

// Same address PricingSection.tsx uses for its international CTA.
const INTL_CONTACT_EMAIL = 'support@vyostra.com'

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  // The account's current plan. Drives which tiers are purchasable and which
  // one is highlighted — previously the modal had no idea what the user was
  // on and offered every tier as if it were an upgrade.
  currentPlan: PlanTier
}

export default function UpgradeModal({ isOpen, onClose, currentPlan }: UpgradeModalProps) {
  const { stage, submittingTier, errorMessage, pendingCheckout, selectTier, reset } = useTierCheckout(() => {
    setTimeout(() => onClose(), 1500)
  })
  // Region decides both the price shown and whether there is a checkout at all:
  // Razorpay is India-only, so international visitors get the same mailto CTA
  // the landing page gives them. Before this the modal hardcoded 'in' and
  // pushed every user into a payment flow that cannot serve them.
  const [region, setRegion] = useState<Region>(detectRegion)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Payment is mid-confirmation and the copy says not to close the window, so
  // the dismissal paths are all disabled rather than racing the poll.
  const canDismiss = stage !== 'polling'

  useEffect(() => {
    if (!isOpen) reset()
    // reset() is stable across renders (defined fresh each render but only
    // its behavior matters here); isOpen is the only real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    focusable?.[0]?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (canDismiss) onClose()
        return
      }

      if (e.key !== 'Tab' || !focusable || focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, canDismiss, onClose, stage])

  if (!isOpen) return null

  // The tier we actively push is the one immediately above the current plan,
  // not a static "Growth is most popular" for everyone. Undefined on agency,
  // where SubscriptionSection already hides the entry point.
  const highlightedTier = nextTierUp(currentPlan)

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={() => canDismiss && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Change your plan"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 sm:p-8 max-w-4xl w-full relative max-h-[90vh] overflow-y-auto"
      >
        {canDismiss && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
            title="Close"
          >
            <X size={20} />
          </button>
        )}

        {stage === 'idle' && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6 pr-8">
              <div>
                <h2 className="font-bold text-2xl text-gray-900 mb-1" style={JAKARTA_FONT}>
                  Choose your plan
                </h2>
                <p className="text-sm text-gray-500">All plans include a 14-day free trial. Cancel anytime.</p>
              </div>

              <div className="inline-flex bg-gray-100 rounded-xl p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setRegion('in')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    region === 'in' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  India
                </button>
                <button
                  type="button"
                  onClick={() => setRegion('intl')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    region === 'intl' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  International
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                {errorMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
              {PRICING_TIERS.map((plan) => {
                const isCurrent = plan.tier === currentPlan
                const isPurchasable = isUpgradeFrom(currentPlan, plan.tier)
                const isHighlighted = plan.tier === highlightedTier
                const isResuming = pendingCheckout?.tier === plan.tier
                const isSubmitting = submittingTier === plan.tier

                const ctaClasses = `w-full flex items-center justify-center gap-2 font-semibold px-4 py-2.5 rounded-xl text-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${
                  isHighlighted
                    ? 'bg-linear-to-r from-violet-600 to-purple-500 text-white shadow-md shadow-violet-200/50 hover:opacity-90'
                    : 'bg-gray-50 text-gray-900 border border-gray-200 hover:bg-gray-100'
                }`

                return (
                  <div
                    key={plan.tier}
                    className={`relative bg-white rounded-2xl border p-6 shadow-sm transition-all duration-300 ${
                      isHighlighted
                        ? 'border-violet-400 ring-2 ring-violet-100'
                        : isCurrent
                          ? 'border-gray-300'
                          : 'border-black/5'
                    } ${!isPurchasable && !isCurrent ? 'opacity-60' : ''}`}
                  >
                    {isHighlighted && (
                      <span className="absolute -top-3 left-6 bg-linear-to-r from-violet-600 to-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Recommended
                      </span>
                    )}
                    {isCurrent && (
                      <span className="absolute -top-3 left-6 bg-gray-900 text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Current plan
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

                    {!isPurchasable ? (
                      <button type="button" disabled className={ctaClasses}>
                        {isCurrent ? 'Your current plan' : 'Included in your plan'}
                      </button>
                    ) : region === 'intl' ? (
                      <a
                        href={`mailto:${INTL_CONTACT_EMAIL}?subject=International ${plan.name} plan enquiry`}
                        className={ctaClasses}
                      >
                        Contact us
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => selectTier(plan.tier)}
                        disabled={submittingTier !== null}
                        className={ctaClasses}
                      >
                        {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                        {isSubmitting ? 'Starting checkout...' : isResuming ? 'Resume checkout' : `Choose ${plan.name}`}
                      </button>
                    )}
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
