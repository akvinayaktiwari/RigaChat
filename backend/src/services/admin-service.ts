import { v4 as uuidv4 } from 'uuid'
import { getAllSubscriptions, getByAccountId, updatePartial } from '../repositories/subscription-repository.js'
import { getClientById } from '../repositories/client-repository.js'
import { writeAuditEntry } from '../repositories/audit-log-repository.js'
import { resolveEntitlements, invalidateEntitlementsCache } from './entitlement-service.js'
import { PLANS } from '../config/entitlements-config.js'
import type { AuditAction, Entitlements, PlanTier, Subscription, SubscriptionOverrides } from '../types/index.js'

export class AdminValidationError extends Error {}

export interface AdminAccountSummary {
  accountId: string
  email: string | null
  name: string | null
  plan: PlanTier
  status: Entitlements['status']
  isInternal: boolean
  trialEndsAt: string | null
  entitlements: Entitlements['features']
  createdAt: string
}

export async function listAccountsWithEntitlements(): Promise<AdminAccountSummary[]> {
  const subscriptions = await getAllSubscriptions()

  return await Promise.all(
    subscriptions.map(async (subscription) => {
      const [client, entitlements] = await Promise.all([
        getClientById(subscription.accountId),
        resolveEntitlements(subscription.accountId),
      ])

      return {
        accountId: subscription.accountId,
        email: client?.email ?? null,
        name: client?.name ?? null,
        plan: subscription.plan,
        status: entitlements.status,
        isInternal: subscription.isInternal,
        trialEndsAt: subscription.trialEndsAt,
        entitlements: entitlements.features,
        createdAt: subscription.createdAt,
      }
    })
  )
}

// Shared by every mutation below — enforces the reason gate before any write,
// loads the current row once, lets mutateFn both validate against current
// state and compute the patch, then writes + invalidates + audits in the
// same order every time so no mutation can skip a step.
async function applyMutationWithAudit(
  accountId: string,
  action: AuditAction,
  reason: string,
  actorEmail: string,
  mutateFn: (current: Subscription) => Partial<Subscription>
): Promise<Subscription> {
  if (!reason?.trim()) {
    throw new AdminValidationError('A reason is required for this action.')
  }

  const current = await getByAccountId(accountId)
  if (!current) {
    throw new Error('Subscription not found')
  }

  // mutateFn can throw (e.g. invalid status/date) — since this runs before
  // updatePartial, a validation failure here means zero DB writes happen.
  const patch = mutateFn(current)

  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as (keyof Subscription)[]) {
    before[key] = current[key]
    after[key] = patch[key]
  }

  const updated = await updatePartial(accountId, patch)
  await invalidateEntitlementsCache(accountId)

  await writeAuditEntry({
    accountId,
    timestamp: new Date().toISOString(),
    auditId: uuidv4(),
    actorEmail,
    action,
    reason: reason.trim(),
    before,
    after,
  })

  return updated
}

export async function toggleInternal(
  accountId: string,
  isInternal: boolean,
  reason: string,
  actorEmail: string
): Promise<Subscription> {
  return applyMutationWithAudit(accountId, 'toggle_internal', reason, actorEmail, () => ({ isInternal }))
}

export async function extendTrial(
  accountId: string,
  newTrialEndsAt: string,
  reason: string,
  actorEmail: string
): Promise<Subscription> {
  return applyMutationWithAudit(accountId, 'extend_trial', reason, actorEmail, (current) => {
    if (current.status !== 'trialing' && current.status !== 'trial_expired') {
      throw new AdminValidationError(
        `Cannot extend trial for an account with status "${current.status}". Only trialing or trial_expired accounts are eligible.`
      )
    }

    const parsedDate = new Date(newTrialEndsAt)
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
      throw new AdminValidationError('newTrialEndsAt must be a valid ISO date in the future.')
    }

    // Extending a trial that already lapsed brings the account back into
    // the trialing state — a trial_expired row left with a future
    // trialEndsAt but the old status would be inconsistent.
    return { trialEndsAt: newTrialEndsAt, status: 'trialing' }
  })
}

export async function changePlan(
  accountId: string,
  newPlan: PlanTier,
  reason: string,
  actorEmail: string
): Promise<Subscription> {
  return applyMutationWithAudit(accountId, 'change_plan', reason, actorEmail, () => {
    if (!(newPlan in PLANS)) {
      throw new AdminValidationError(`Invalid plan "${newPlan}". Must be one of: ${Object.keys(PLANS).join(', ')}.`)
    }
    return { plan: newPlan }
  })
}

export async function setOverrides(
  accountId: string,
  overrides: SubscriptionOverrides,
  reason: string,
  actorEmail: string
): Promise<Subscription> {
  return applyMutationWithAudit(accountId, 'set_overrides', reason, actorEmail, () => ({ overrides }))
}
