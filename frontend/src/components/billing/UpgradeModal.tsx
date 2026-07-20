import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Loader2, X } from 'lucide-react'
import { subscribeToTier, getMySubscription } from '../../services/api'
import type { BillingErrorCode } from '../../services/api'
import { loadRazorpayScript } from '../../lib/razorpay-checkout'
import { PRICING_TIERS } from '../../lib/pricingTiers'
import type { BillableTier } from '../../lib/pricingTiers'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 10

interface UpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  suggestedTier?: BillableTier
}

type Stage = 'tiers' | 'polling' | 'success' | 'timeout'

interface PendingCheckout {
  tier: BillableTier
  subscriptionId: string
  razorpayKeyId: string
}

function formatPrice(rupees: number): string {
  return `₹${rupees.toLocaleString('en-IN')}`
}

// Switches on billing-routes.ts's stable `code` field rather than matching
// substrings of `error` (the human-readable message) — message text can
// change without warning; `code` is the contract.
function resolveBillingErrorMessage(
  code: BillingErrorCode | undefined,
  message: string | undefined,
  pending: PendingCheckout | null
): string {
  switch (code) {
    case 'INTERNAL_ACCOUNT_NO_BILLING':
      return 'This is an internal account and cannot be billed.'

    case 'ALREADY_SUBSCRIBED': {
      if (!pending) {
        return "You already have a subscription in progress. Refresh this page, or contact us if this doesn't look right."
      }
      const tierName = PRICING_TIERS.find((t) => t.tier === pending.tier)?.name ?? pending.tier
      return `You have a pending payment for the ${tierName} plan — finish that checkout below, or wait for it to expire before choosing a different plan.`
    }

    case 'NO_SUBSCRIPTION_RECORD':
    case 'CONFIG_ERROR':
    case 'PROVIDER_ERROR':
      // These carry internal detail (env var names, provider error text) not
      // meant for end users — a safe generic message instead of `message`.
      return 'Something went wrong on our end. Please try again shortly, or contact us if it persists.'

    default:
      // No BillingError code — e.g. the 400 bad-tier validation error, which
      // is already a safe, human-readable message worth showing as-is.
      return message ?? 'Something went wrong. Please try again.'
  }
}

export default function UpgradeModal({ isOpen, onClose, suggestedTier }: UpgradeModalProps) {
  const [stage, setStage] = useState<Stage>('tiers')
  const [submittingTier, setSubmittingTier] = useState<BillableTier | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setStage('tiers')
      setSubmittingTier(null)
      setErrorMessage(null)
      setPendingCheckout(null)
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  function startPolling() {
    let attempts = 0

    const poll = async () => {
      attempts += 1
      try {
        const res = await getMySubscription()
        if (res.success && res.data?.status === 'active') {
          setStage('success')
          setTimeout(() => onClose(), 1500)
          return
        }
      } catch {
        // Transient network blip — keep polling rather than aborting confirmation.
      }

      if (attempts >= POLL_MAX_ATTEMPTS) {
        setStage('timeout')
        return
      }

      pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()
  }

  async function openRazorpayCheckout(tier: BillableTier, subscriptionId: string, razorpayKeyId: string) {
    try {
      await loadRazorpayScript()
    } catch {
      setErrorMessage('Could not load the checkout script. Check your connection and try again.')
      return
    }

    if (!window.Razorpay) {
      setErrorMessage('Checkout is unavailable right now. Try again in a moment.')
      return
    }

    const checkout = new window.Razorpay({
      key: razorpayKeyId,
      subscription_id: subscriptionId,
      name: 'VyostraAI',
      description: `${PRICING_TIERS.find((t) => t.tier === tier)?.name ?? tier} plan`,
      theme: { color: '#7c3aed' },
      handler: () => {
        setPendingCheckout(null)
        setErrorMessage(null)
        setStage('polling')
        startPolling()
      },
      modal: {
        // User closed Razorpay's popup without paying. subscribeToTier()
        // 409s (ALREADY_SUBSCRIBED) on any second call while the local row
        // is still pending_activation, so calling /subscribe again here
        // would just fail — the only way forward is to resume this exact
        // Razorpay subscription, not create a new one.
        ondismiss: () => {
          setPendingCheckout({ tier, subscriptionId, razorpayKeyId })
          setStage('tiers')
        },
      },
    })
    checkout.open()
  }

  async function handleSelectTier(tier: BillableTier) {
    setErrorMessage(null)

    if (pendingCheckout && pendingCheckout.tier === tier) {
      await openRazorpayCheckout(tier, pendingCheckout.subscriptionId, pendingCheckout.razorpayKeyId)
      return
    }

    setSubmittingTier(tier)
    try {
      const res = await subscribeToTier(tier)
      if (!res.success || !res.data) {
        setErrorMessage(resolveBillingErrorMessage(res.code, res.error, pendingCheckout))
        return
      }
      await openRazorpayCheckout(tier, res.data.subscriptionId, res.data.razorpayKeyId)
    } catch {
      setErrorMessage('Something went wrong starting checkout. Please try again.')
    } finally {
      setSubmittingTier(null)
    }
  }

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

        {stage === 'tiers' && (
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
                const isSuggested = suggestedTier === plan.tier
                const isResuming = pendingCheckout?.tier === plan.tier
                const isSubmitting = submittingTier === plan.tier

                return (
                  <div
                    key={plan.tier}
                    className={`relative bg-white rounded-2xl border p-6 shadow-sm transition-all duration-300 ${
                      isSuggested ? 'border-violet-400 ring-2 ring-violet-100' : 'border-black/5'
                    }`}
                  >
                    {isSuggested && (
                      <span className="absolute -top-3 left-6 bg-linear-to-r from-violet-600 to-purple-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                        Recommended
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
                      onClick={() => handleSelectTier(plan.tier)}
                      disabled={submittingTier !== null}
                      className={`w-full flex items-center justify-center gap-2 font-semibold px-4 py-2.5 rounded-xl text-sm transition-opacity disabled:opacity-50 ${
                        isSuggested
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
