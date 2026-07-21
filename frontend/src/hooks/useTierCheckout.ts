import { useEffect, useRef, useState } from 'react'
import { subscribeToTier, getMySubscription } from '../services/api'
import type { BillingErrorCode } from '../services/api'
import { loadRazorpayScript } from '../lib/razorpay-checkout'
import { PRICING_TIERS } from '../lib/pricingTiers'
import type { BillableTier } from '../lib/pricingTiers'

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 10

export type TierCheckoutStage = 'idle' | 'polling' | 'success' | 'timeout'

export interface PendingTierCheckout {
  tier: BillableTier
  subscriptionId: string
  razorpayKeyId: string
}

// Switches on billing-routes.ts's stable `code` field rather than matching
// substrings of `error` (the human-readable message) — message text can
// change without warning; `code` is the contract.
function resolveBillingErrorMessage(
  code: BillingErrorCode | undefined,
  message: string | undefined,
  pending: PendingTierCheckout | null
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
      return 'Something went wrong on our end. Please try again shortly, or contact us if it persists.'

    default:
      return message ?? 'Something went wrong. Please try again.'
  }
}

export interface UseTierCheckoutResult {
  stage: TierCheckoutStage
  submittingTier: BillableTier | null
  errorMessage: string | null
  pendingCheckout: PendingTierCheckout | null
  selectTier: (tier: BillableTier) => Promise<void>
  reset: () => void
}

// Extracted from UpgradeModal.tsx so the subscribe -> Razorpay -> poll
// sequence is implemented once and shared with the landing-page pricing
// cards' post-signup checkout (PricingSection -> QuickSignupModal). Owns
// only the checkout state machine; callers own their own open/close UI.
export function useTierCheckout(onConfirmed?: () => void): UseTierCheckoutResult {
  const [stage, setStage] = useState<TierCheckoutStage>('idle')
  const [submittingTier, setSubmittingTier] = useState<BillableTier | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingCheckout, setPendingCheckout] = useState<PendingTierCheckout | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  }, [])

  function reset() {
    setStage('idle')
    setSubmittingTier(null)
    setErrorMessage(null)
    setPendingCheckout(null)
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
  }

  function startPolling() {
    let attempts = 0

    const poll = async () => {
      attempts += 1
      try {
        const res = await getMySubscription()
        if (res.success && res.data?.status === 'active') {
          setStage('success')
          onConfirmed?.()
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
        // User closed Razorpay's popup without paying. subscribeToTier() 409s
        // (ALREADY_SUBSCRIBED) on any second call while the local row is
        // still pending_activation, so calling /subscribe again would just
        // fail — the only way forward is to resume this exact Razorpay
        // subscription, not create a new one.
        ondismiss: () => {
          setPendingCheckout({ tier, subscriptionId, razorpayKeyId })
          setStage('idle')
        },
      },
    })
    checkout.open()
  }

  async function selectTier(tier: BillableTier) {
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

  return { stage, submittingTier, errorMessage, pendingCheckout, selectTier, reset }
}
