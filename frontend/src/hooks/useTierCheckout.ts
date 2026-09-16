import { useEffect, useRef, useState } from 'react'
import { subscribeToTier, getMySubscription } from '../services/api'
import type { BillingErrorCode } from '../services/api'
import { loadRazorpayScript } from '../lib/razorpay-checkout'
import type { RazorpayPaymentFailure } from '../lib/razorpay-checkout'
import { PRICING_TIERS } from '../lib/pricingTiers'
import type { BillableTier } from '../lib/pricingTiers'

/** Which Razorpay plan the subscription is created against; see api.ts. */
export type BillingCurrency = 'INR' | 'USD'
import { useSubscription } from './useSubscription'

const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 10

export type TierCheckoutStage = 'idle' | 'polling' | 'success' | 'timeout'

export interface PendingTierCheckout {
  // null when recovered from a fresh ALREADY_SUBSCRIBED 409 with no local
  // record of which tier was being purchased — subscription.plan isn't
  // updated until Razorpay activation, so the server can't tell us the
  // pending tier either. Resuming is still safe in that case: Razorpay's
  // checkout is keyed by subscription_id, so the amount/plan shown to the
  // user is authoritative regardless of what we display locally.
  tier: BillableTier | null
  // The currency the pending subscription was created in, or null when it was
  // recovered from a 409 and we cannot know. Resuming is only safe when it
  // matches what is being asked for now: Razorpay charges what the subscription
  // says, so resuming an INR hold under a page showing $49 bills ₹4,299.
  currency: BillingCurrency | null
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
      if (!pending || pending.tier === null) {
        return "You already have a subscription in progress. Refresh this page, or contact us if this doesn't look right."
      }
      const tierName = PRICING_TIERS.find((t) => t.tier === pending.tier)?.name ?? pending.tier
      return `You have a pending payment for the ${tierName} plan — finish that checkout below, or wait for it to expire before choosing a different plan.`
    }

    // Distinct copy per code, because these fail for genuinely different
    // reasons and the customer's next move differs. One shared sentence sent
    // everyone to "try again", including the cases where trying again cannot
    // possibly work.
    case 'CONFIG_ERROR':
      return 'Checkout is not set up for this currency yet. Switch the currency, or contact us and we will take the payment directly.'

    case 'PROVIDER_ERROR':
      return 'Our payment provider rejected the request. Nothing has been charged. Please try again in a moment.'

    case 'NO_SUBSCRIPTION_RECORD':
      return 'We could not find your account record. Please sign out, sign back in, and try again — contact us if it persists.'

    default:
      return message ?? 'Something went wrong. Please try again.'
  }
}

export interface UseTierCheckoutResult {
  stage: TierCheckoutStage
  submittingTier: BillableTier | null
  errorMessage: string | null
  pendingCheckout: PendingTierCheckout | null
  selectTier: (tier: BillableTier, currency?: BillingCurrency) => Promise<void>
  reset: () => void
}

// Extracted from UpgradeModal.tsx so the subscribe -> Razorpay -> poll
// sequence is implemented once and shared with the landing-page pricing
// cards' post-signup checkout (PricingSection -> QuickSignupModal). Owns
// only the checkout state machine; callers own their own open/close UI.
export function useTierCheckout(onConfirmed?: () => void): UseTierCheckoutResult {
  // The moment a payment confirms, the shared subscription cache is holding
  // the plan the user just upgraded away from. Every gated page reads that
  // cache, so without this refresh they would keep seeing the old limits and
  // the upsell until the tab was closed.
  const { refresh: refreshSubscription } = useSubscription()
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
        // Deliberately the raw API call, not the cached provider: this is
        // polling FOR a change, so a cached read would return the pre-payment
        // value on every attempt and the checkout would hang until timeout.
        const res = await getMySubscription()
        if (res.success && res.data?.status === 'active') {
          setStage('success')
          // Push the new plan into the shared cache before handing control
          // back. onConfirmed typically closes the modal or routes to the
          // dashboard, and those pages read the cache on their next render.
          await refreshSubscription()
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

  async function openRazorpayCheckout(
    tier: BillableTier | null,
    // Carried so a dismissed checkout is stored with the currency it was
    // actually created in, not the currency selected the next time.
    currency: BillingCurrency | null,
    subscriptionId: string,
    razorpayKeyId: string
  ) {
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
      name: 'Vyostra AI',
      description: tier ? `${PRICING_TIERS.find((t) => t.tier === tier)?.name ?? tier} plan` : 'your plan',
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
          setPendingCheckout({ tier, currency, subscriptionId, razorpayKeyId })
          setStage('idle')
        },
      },
    })

    // Razorpay reports a declined card or a rejected mandate here and then
    // closes the modal. Unhandled, the customer sees the page as it was and no
    // reason at all. The hold is kept so the same subscription can be retried.
    checkout.on?.('payment.failed', (failure: RazorpayPaymentFailure) => {
      const reason = failure?.error?.description?.trim()
      const step = failure?.error?.step
      console.error('[billing] Razorpay payment failed', {
        code: failure?.error?.code,
        step,
        reason,
        paymentId: failure?.error?.metadata?.payment_id,
      })
      setPendingCheckout({ tier, currency, subscriptionId, razorpayKeyId })
      setStage('idle')
      setErrorMessage(
        reason
          ? `Payment failed: ${reason} Nothing was charged — you can try again, or use a different method.`
          : 'The payment did not go through, and nothing was charged. Try again, or use a different method.'
      )
    })

    checkout.open()
  }

  async function selectTier(tier: BillableTier, currency: BillingCurrency = 'USD') {
    setErrorMessage(null)

    // No client-side resume shortcut. The browser's idea of a pending checkout
    // can be arbitrarily stale — the subscription may have been cancelled,
    // replaced after a currency switch, or already paid in another tab — and
    // reopening a dead subscription_id makes Razorpay throw its own
    // "Payment Failed" alert, which reads as our bug and cannot be recovered
    // from by clicking again. The server knows the real state, so ask it every
    // time: it answers with a resumable hold when there genuinely is one, and
    // creates a fresh subscription when there is not.
    setSubmittingTier(tier)
    try {
      const res = await subscribeToTier(tier, currency)
      if (!res.success || !res.data) {
        // Fresh ALREADY_SUBSCRIBED with no local pendingCheckout (e.g. after
        // a page refresh) but the server handed back enough to resume
        // (pending_activation + a configured Razorpay key) — recover and
        // reopen checkout instead of dead-ending. tier stays null: we don't
        // know if the existing pending subscription matches what was just
        // clicked (subscription.plan isn't updated until activation), so we
        // don't claim a match — see PendingTierCheckout's tier comment.
        if (res.code === 'ALREADY_SUBSCRIBED' && res.details?.providerSubscriptionId && res.details?.razorpayKeyId) {
          const recovered: PendingTierCheckout = {
            tier: null,
            currency: null,
            subscriptionId: res.details.providerSubscriptionId,
            razorpayKeyId: res.details.razorpayKeyId,
          }
          setPendingCheckout(recovered)
          await openRazorpayCheckout(recovered.tier, recovered.currency, recovered.subscriptionId, recovered.razorpayKeyId)
          return
        }
        setErrorMessage(resolveBillingErrorMessage(res.code, res.error, pendingCheckout))
        return
      }
      await openRazorpayCheckout(tier, currency, res.data.subscriptionId, res.data.razorpayKeyId)
    } catch (error) {
      // Reaching here means the request never completed — offline, a blocked
      // request, or the API being unreachable. Distinguish it from a payment
      // failure: nothing was attempted, so "nothing was charged" is certain.
      console.error('[billing] could not start checkout', error)
      setErrorMessage(
        'We could not reach the payment service, so nothing was charged. Check your connection and try again.'
      )
    } finally {
      setSubmittingTier(null)
    }
  }

  return { stage, submittingTier, errorMessage, pendingCheckout, selectTier, reset }
}
