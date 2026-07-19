import { getByAccountId } from '../repositories/subscription-repository.js'
import {
  deleteCachedEntitlements,
  getCachedEntitlements,
  setCachedEntitlements,
} from '../repositories/redis-repository.js'
import { getUsage, incrementIfUnderLimit, incrementUsage } from '../repositories/usage-repository.js'
import { countBotsForClient } from '../repositories/bot-repository.js'
import { getPeriodKey } from '../lib/usage-period.js'
import { FEATURES, PLANS, TRIAL } from '../config/entitlements-config.js'
import type { Entitlements, PlanTier, Subscription } from '../types/index.js'

const ENTITLEMENTS_CACHE_TTL_SECONDS = 60

export class EntitlementError extends Error {
  code: 'FEATURE_DISABLED' | 'LIMIT_EXCEEDED'
  feature: string
  limit?: number
  current?: number

  constructor(
    code: 'FEATURE_DISABLED' | 'LIMIT_EXCEEDED',
    feature: string,
    details?: { limit?: number; current?: number }
  ) {
    super(`Entitlement denied: ${code} for ${feature}`)
    this.name = 'EntitlementError'
    this.code = code
    this.feature = feature
    this.limit = details?.limit
    this.current = details?.current
  }
}

// Shared by app.onError() and any route catch block that needs to turn an
// EntitlementError into the same 402/403 shape, so the status/body mapping
// lives in exactly one place.
export function toEntitlementErrorResponse(error: EntitlementError): {
  status: 402 | 403
  body: { error: string; feature: string; limit?: number; current?: number }
} {
  return {
    status: error.code === 'FEATURE_DISABLED' ? 403 : 402,
    body: { error: error.code, feature: error.feature, limit: error.limit, current: error.current },
  }
}

// Explicit `null` in an override means "unlimited" and must win over the plan
// default; `undefined` (key absent) means "no override" and falls through.
// A plain `??` would treat both the same way and silently drop explicit nulls.
function pickOverride(overrideVal: number | null | undefined, fallback: number | null): number | null {
  return overrideVal === undefined ? fallback : overrideVal
}

function buildInternalEntitlements(accountId: string): Entitlements {
  return {
    accountId,
    status: 'active',
    features: {
      chat: { enabled: true, mode: 'full', limits: { conversations: null } },
      crm: { enabled: true, limits: { leads: null } },
      agents: { enabled: true, limits: { max: null } },
      voice: { enabled: true, limits: { minutes: null } },
    },
  }
}

function buildFullTrialEntitlements(accountId: string): Entitlements {
  return {
    accountId,
    status: 'trialing',
    features: {
      chat: { enabled: true, mode: 'full', limits: { conversations: TRIAL.chat.conversations } },
      crm: { enabled: true, limits: { leads: TRIAL.leads } },
      agents: { enabled: true, limits: { max: TRIAL.agents } },
      voice: { enabled: false, limits: { minutes: 0 } },
    },
  }
}

// Shared by trial_expired, past_due, and suspended — spec treats all three
// identically (degraded chat, capped CRM/agents, no voice), differing only
// in the status label echoed back.
function buildDegradedEntitlements(
  accountId: string,
  status: 'trial_expired' | 'past_due' | 'suspended'
): Entitlements {
  return {
    accountId,
    status,
    features: {
      chat: { enabled: true, mode: 'degraded', limits: { conversations: null } },
      crm: { enabled: true, limits: { leads: TRIAL.leads } },
      agents: { enabled: true, limits: { max: TRIAL.agents } },
      voice: { enabled: false, limits: { minutes: 0 } },
    },
  }
}

function buildActiveEntitlements(accountId: string, subscription: Subscription): Entitlements {
  const planDefaults = PLANS[subscription.plan]
  const overrides = subscription.overrides
  const voiceSubscribed = subscription.addons.voice?.subscribed === true

  const agentsMax = pickOverride(overrides.agents?.max, planDefaults.agents)
  const leadsMax = pickOverride(overrides.leads?.max, planDefaults.leads)
  const chatConversations = pickOverride(overrides.chat?.conversations, planDefaults.chat.conversations)
  const voiceMinutes = pickOverride(
    overrides.voice?.minutes,
    voiceSubscribed ? FEATURES.voice.defaultLimits.minutes : 0
  )

  return {
    accountId,
    status: 'active',
    features: {
      chat: { enabled: true, mode: 'full', limits: { conversations: chatConversations } },
      crm: { enabled: true, limits: { leads: leadsMax } },
      agents: { enabled: true, limits: { max: agentsMax } },
      voice: { enabled: voiceSubscribed, limits: { minutes: voiceMinutes } },
    },
  }
}

function buildCancelledEntitlements(accountId: string, subscription: Subscription): Entitlements {
  const planDefaults = PLANS[subscription.plan]

  return {
    accountId,
    status: 'cancelled',
    features: {
      chat: { enabled: false, mode: null, limits: { conversations: null } },
      crm: { enabled: true, limits: { leads: planDefaults.leads } },
      agents: { enabled: true, limits: { max: planDefaults.agents } },
      voice: { enabled: false, limits: { minutes: 0 } },
    },
  }
}

function computeEntitlements(accountId: string, subscription: Subscription | null): Entitlements {
  if (subscription?.isInternal === true) {
    return buildInternalEntitlements(accountId)
  }

  if (!subscription) {
    return buildFullTrialEntitlements(accountId)
  }

  if (subscription.status === 'trialing') {
    const now = Date.now()
    const trialEndsAt = subscription.trialEndsAt ? new Date(subscription.trialEndsAt).getTime() : now
    const graceEndsAt = trialEndsAt + TRIAL.graceDays * 24 * 60 * 60 * 1000
    if (now < graceEndsAt) {
      return buildFullTrialEntitlements(accountId)
    }
    return buildDegradedEntitlements(accountId, 'trial_expired')
  }

  if (subscription.status === 'trial_expired') {
    return buildDegradedEntitlements(accountId, 'trial_expired')
  }

  if (subscription.status === 'active') {
    return buildActiveEntitlements(accountId, subscription)
  }

  if (subscription.status === 'past_due' || subscription.status === 'suspended') {
    return buildDegradedEntitlements(accountId, subscription.status)
  }

  // status === 'cancelled'
  return buildCancelledEntitlements(accountId, subscription)
}

export async function resolveEntitlements(accountId: string): Promise<Entitlements> {
  const cached = await getCachedEntitlements(accountId)
  if (cached) return cached

  const subscription = await getByAccountId(accountId)
  const entitlements = computeEntitlements(accountId, subscription)

  await setCachedEntitlements(accountId, entitlements, ENTITLEMENTS_CACHE_TTL_SECONDS)
  return entitlements
}

export async function invalidateEntitlementsCache(accountId: string): Promise<void> {
  await deleteCachedEntitlements(accountId)
}

export interface SubscriptionSummary {
  plan: PlanTier
  status: Entitlements['status']
  trialEndsAt: string | null
  features: Entitlements['features']
  usage: { chatConversations: number }
}

// Client-facing view of a caller's own subscription — composes
// resolveEntitlements() (status/features, unchanged) with fields
// resolveEntitlements() doesn't expose (plan, trialEndsAt) and current-period
// usage. A null subscription mirrors computeEntitlements()'s own "no row"
// handling: treated as a fresh trial with no plan/trial-end set yet.
export async function getSubscriptionSummary(accountId: string): Promise<SubscriptionSummary> {
  const [subscription, entitlements] = await Promise.all([getByAccountId(accountId), resolveEntitlements(accountId)])

  const periodKey = subscription ? getPeriodKey(subscription) : 'trial'
  const chatConversations = await getUsage(accountId, periodKey, 'chatConversations')

  return {
    plan: subscription?.plan ?? 'free',
    status: entitlements.status,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    features: entitlements.features,
    usage: { chatConversations },
  }
}

// resolveEntitlements() fetches the Subscription internally but only returns
// the computed Entitlements shape — the raw subscription isn't exposed, so
// this is a second getByAccountId() fetch per checkEntitlement('chat') call.
// A null subscription mirrors computeEntitlements()'s own "no row → fresh
// trial" handling: treated as the 'trial' bucket directly.
async function resolveChatPeriodKey(accountId: string): Promise<string> {
  const subscription = await getByAccountId(accountId)
  return subscription ? getPeriodKey(subscription) : 'trial'
}

export async function checkEntitlement(
  accountId: string,
  featureKey: 'chat' | 'agents' | 'voice',
  quantity = 1
): Promise<void> {
  const entitlements = await resolveEntitlements(accountId)
  const feature = entitlements.features[featureKey]

  if (!feature.enabled) {
    throw new EntitlementError('FEATURE_DISABLED', featureKey)
  }

  if (featureKey === 'chat') {
    const limit = entitlements.features.chat.limits.conversations
    const periodKey = await resolveChatPeriodKey(accountId)

    if (limit === null) {
      // Unlimited — still record usage for visibility, never blocks.
      await incrementUsage(accountId, periodKey, 'chatConversations', quantity)
      return
    }

    const result = await incrementIfUnderLimit(accountId, periodKey, 'chatConversations', limit, quantity)
    if (!result.allowed) {
      // `current: limit` is an approximation, not the real pre-increment
      // value — incrementIfUnderLimit()'s ConditionalCheckFailedException
      // path doesn't return the item's current attributes. DynamoDB
      // supports ReturnValuesOnConditionCheckFailure: 'ALL_OLD' to fix this
      // precisely, but that would widen incrementIfUnderLimit()'s return
      // contract beyond what was specified here — flagged, not applied.
      throw new EntitlementError('LIMIT_EXCEEDED', 'chat', { limit, current: limit })
    }
    return
  }

  if (featureKey === 'agents') {
    const limit = entitlements.features.agents.limits.max
    if (limit === null) return

    const count = await countBotsForClient(accountId)
    if (count + quantity > limit) {
      throw new EntitlementError('LIMIT_EXCEEDED', 'agents', { limit, current: count })
    }
    return
  }

  // featureKey === 'voice' — the enabled check above is the whole gate at
  // token issuance. Minute-level usage is metered via VoiceCallLog after a
  // call completes, not the flow-based usage-repository pattern chat uses;
  // enforcing a minutes cap is out of scope for this module.
}
