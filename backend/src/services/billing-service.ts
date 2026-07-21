import { getByAccountId, updatePartial } from '../repositories/subscription-repository.js'
import { razorpayProvider } from '../providers/razorpay-provider.js'

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

export async function subscribeToTier(clientId: string, tier: BillableTier): Promise<SubscribeResult> {
  const subscription = await getByAccountId(clientId)

  // No subscription row means the trial-creation step at signup either hasn't
  // run yet or failed silently (see client-service.ts's createTrialSubscription).
  // updatePartial() below is a DynamoDB UpdateCommand with no key-existence
  // condition, so without this guard a missing row would be silently upserted
  // as a partial Subscription record missing plan/addons/overrides/trial
  // fields — a payment module must not create malformed billing state.
  if (!subscription) {
    throw new BillingError('NO_SUBSCRIPTION_RECORD', `No subscription record found for account ${clientId}.`)
  }

  if (subscription.isInternal) {
    throw new BillingError('INTERNAL_ACCOUNT_NO_BILLING', 'Internal accounts cannot be billed.')
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
