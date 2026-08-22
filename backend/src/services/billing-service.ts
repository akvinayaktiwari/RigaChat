import { updatePartial } from '../repositories/subscription-repository.js'
import { ensureTrialSubscription } from './client-service.js'
import { getPaymentHistory as getPaymentHistoryFromRepo } from '../repositories/payment-history-repository.js'
import { razorpayProvider } from '../providers/razorpay-provider.js'
import type { PaymentRecord, Subscription } from '../types/index.js'

export type BillableTier = 'starter' | 'growth' | 'agency'

export type BillingErrorCode =
  | 'INTERNAL_ACCOUNT_NO_BILLING'
  | 'ALREADY_SUBSCRIBED'
  | 'NO_SUBSCRIPTION_RECORD'
  | 'CONFIG_ERROR'
  | 'PROVIDER_ERROR'

export class BillingError extends Error {
  code: BillingErrorCode
  details?: Record<string, unknown>

  constructor(code: BillingErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'BillingError'
    this.code = code
    this.details = details
  }
}

// How long a pending_activation hold is respected before it is treated as an
// abandoned checkout. Long enough that someone slowly entering card details or
// waiting on an OTP is never interrupted; short enough that abandoning checkout
// does not lock the account out for the rest of its life. Before this existed
// there was no expiry at all: four accounts sat pending_activation from 21-26
// July until they were cleared by hand on 2026-08-22, and every checkout
// attempt in between returned 409.
const PENDING_ACTIVATION_GRACE_MS = 30 * 60 * 1000

// Razorpay statuses meaning the subscription was genuinely paid for. Anything
// else on an expired hold is safe to abandon.
const PAID_REMOTE_STATUSES: ReadonlySet<string> = new Set(['active', 'completed'])

const TIER_PLAN_ENV_VAR: Record<BillableTier, string> = {
  starter: 'RAZORPAY_PLAN_ID_STARTER',
  growth: 'RAZORPAY_PLAN_ID_GROWTH',
  agency: 'RAZORPAY_PLAN_ID_AGENCY',
}

function resolvePlanId(tier: BillableTier): string {
  const envVar = TIER_PLAN_ENV_VAR[tier]
  const planId = process.env[envVar]

  if (!planId) {
    throw new BillingError(
      'CONFIG_ERROR',
      `Missing required environment variable ${envVar}. Set it in your .env file before starting the server.`
    )
  }

  return planId
}

export interface SubscribeResult {
  subscriptionId: string
  razorpayKeyId: string
}

function isStaleHold(subscription: Subscription): boolean {
  const heldSince = Date.parse(subscription.updatedAt)
  if (Number.isNaN(heldSince)) return false
  return Date.now() - heldSince > PENDING_ACTIVATION_GRACE_MS
}

// Returns true when the hold was released (nothing was paid), false when
// Razorpay reports the subscription as genuinely paid and the local row is the
// thing that is wrong.
//
// Deliberately fails CLOSED. If Razorpay cannot be reached, or the row has no
// providerSubscriptionId to check, the hold stays -- the caller gets the same
// 409 it got before, which is recoverable, whereas wrongly releasing a hold on
// a paid subscription lets the account be charged twice.
async function releaseStaleHold(clientId: string, subscription: Subscription): Promise<boolean> {
  const subscriptionId = subscription.providerSubscriptionId
  if (!subscriptionId) return false

  let remote: { id: string; status: string; paid_count: number }
  try {
    remote = await razorpayProvider.fetchSubscription(subscriptionId)
  } catch (error) {
    console.error(
      `[billing] could not verify stale hold ${subscriptionId} for ${clientId}, keeping it:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }

  if (PAID_REMOTE_STATUSES.has(remote.status) || remote.paid_count > 0) {
    console.warn(
      `[billing] ${clientId} held pending_activation but Razorpay reports ${subscriptionId} ` +
        `as ${remote.status} (paid_count=${remote.paid_count}) -- the webhook never landed. ` +
        `Marking active; run scripts/reconcile-razorpay-subscription.ts to record the payment.`
    )
    await updatePartial(clientId, { status: 'active' })
    return false
  }

  // Kill the abandoned checkout link before releasing the lock, so the old
  // subscription cannot be paid after a replacement exists. A subscription
  // already cancelled/expired at Razorpay needs no call.
  if (remote.status === 'created' || remote.status === 'authenticated') {
    try {
      await razorpayProvider.cancelSubscription(subscriptionId)
    } catch (error) {
      console.error(
        `[billing] could not cancel abandoned subscription ${subscriptionId} for ${clientId}, keeping the hold:`,
        error instanceof Error ? error.message : String(error)
      )
      return false
    }
  }

  console.warn(`[billing] released stale pending_activation hold for ${clientId} (was ${subscriptionId})`)
  await updatePartial(clientId, {
    status: 'trialing',
    paymentProvider: null,
    providerSubscriptionId: null,
  })
  return true
}

export async function subscribeToTier(clientId: string, tier: BillableTier): Promise<SubscribeResult> {
  // ensureTrialSubscription rather than a plain read: a signup whose trial-row
  // write failed used to 500 here on every checkout attempt, permanently, and
  // only a manual script could clear it. It now repairs itself on this path.
  //
  // The guard below still matters. updatePartial() is a DynamoDB UpdateCommand
  // with no key-existence condition, so a missing row would be silently
  // upserted as a partial Subscription lacking plan/addons/overrides/trial
  // fields — a payment module must not create malformed billing state. Null
  // now means something narrower than before: no client record exists at all,
  // which repair cannot invent and a caller should not paper over.
  const subscription = await ensureTrialSubscription(clientId)

  if (!subscription) {
    throw new BillingError('NO_SUBSCRIPTION_RECORD', `No subscription record found for account ${clientId}.`)
  }

  if (subscription.isInternal) {
    throw new BillingError('INTERNAL_ACCOUNT_NO_BILLING', 'Internal accounts cannot be billed.')
  }

  // A pending_activation hold older than the grace window is an abandoned
  // checkout, not one in progress. Releasing it is what stops that state being
  // a life sentence -- but only after Razorpay confirms nothing was paid,
  // because releasing a hold on a subscription that WAS paid would let the
  // account buy a second one.
  if (subscription.status === 'pending_activation' && isStaleHold(subscription)) {
    const released = await releaseStaleHold(clientId, subscription)
    if (released) {
      subscription.status = 'trialing'
      subscription.providerSubscriptionId = null
      subscription.paymentProvider = null
    } else {
      // Razorpay says this was paid after all, so the local row is simply
      // behind -- the webhook never landed. Correct the status so the account
      // is not left able to buy a duplicate, and fall through to the
      // ALREADY_SUBSCRIBED block below, which is now accurate.
      subscription.status = 'active'
    }
  }

  if (subscription.status === 'active' || subscription.status === 'pending_activation') {
    // pending_activation is resumable — the caller can reopen Razorpay
    // checkout against the existing providerSubscriptionId instead of
    // dead-ending, provided a key is configured. active is a real, already-
    // paid duplicate and stays a hard block (no razorpayKeyId included).
    const isResumable = subscription.status === 'pending_activation' && Boolean(subscription.providerSubscriptionId)

    throw new BillingError(
      'ALREADY_SUBSCRIBED',
      `Account ${clientId} already has a ${subscription.status} subscription.`,
      {
        status: subscription.status,
        providerSubscriptionId: subscription.providerSubscriptionId,
        ...(isResumable ? { razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? null } : {}),
      }
    )
  }

  const planId = resolvePlanId(tier)

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID
  if (!razorpayKeyId) {
    throw new BillingError(
      'CONFIG_ERROR',
      'Missing required environment variable RAZORPAY_KEY_ID. Set it in your .env file before starting the server.'
    )
  }

  let created: { id: string; status: string }
  try {
    created = await razorpayProvider.createSubscription(planId, { clientId, tier })
  } catch (error) {
    throw new BillingError(
      'PROVIDER_ERROR',
      `Razorpay subscription creation failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  await updatePartial(clientId, {
    paymentProvider: 'razorpay',
    providerSubscriptionId: created.id,
    status: 'pending_activation',
  })

  return { subscriptionId: created.id, razorpayKeyId }
}

export async function getPaymentHistory(clientId: string): Promise<PaymentRecord[]> {
  return getPaymentHistoryFromRepo(clientId)
}
