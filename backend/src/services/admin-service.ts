import { getAllSubscriptions } from '../repositories/subscription-repository.js'
import { getClientById } from '../repositories/client-repository.js'
import { resolveEntitlements } from './entitlement-service.js'
import type { Entitlements, PlanTier } from '../types/index.js'

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
