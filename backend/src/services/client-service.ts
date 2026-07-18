import { createClient, getClientById, updateClient } from '../repositories/client-repository.js'
import { create as createSubscription } from '../repositories/subscription-repository.js'
import { TRIAL } from '../config/entitlements-config.js'
import type { ClientRecord } from '../types/index.js'

interface UpsertClientInput {
  clientId: string
  email: string
  name: string
}

export async function upsertClient(input: UpsertClientInput): Promise<ClientRecord> {
  try {
    const existing = await getClientById(input.clientId)

    if (existing) {
      return await updateClient(input.clientId, { name: input.name, email: input.email })
    }

    const client = await createClient({
      clientId: input.clientId,
      email: input.email,
      name: input.name,
      authProvider: 'google',
      plan: 'starter',
    })

    await createTrialSubscription(input.clientId)

    return client
  } catch (error) {
    throw new Error(
      `Failed to upsert client ${input.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// A missing subscriptions row is recoverable later via the backfill script;
// a failed signup is not — so this swallows its own errors rather than
// letting them fail the client creation that already succeeded above.
async function createTrialSubscription(clientId: string): Promise<void> {
  try {
    const now = new Date()
    const trialEndsAt = new Date(now.getTime() + TRIAL.durationDays * 24 * 60 * 60 * 1000)

    await createSubscription({
      accountId: clientId,
      status: 'trialing',
      plan: 'free',
      addons: {},
      overrides: {},
      isInternal: false,
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEndsAt.toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: null,
      paymentProvider: null,
      providerSubscriptionId: null,
      providerCustomerId: null,
    })
  } catch (error) {
    console.error(`Failed to create trial subscription for client ${clientId}:`, error)
  }
}

export async function getClient(clientId: string): Promise<ClientRecord> {
  const client = await getClientById(clientId)
  if (!client) {
    throw new Error('Client not found')
  }
  return client
}

export async function updateClientProfile(clientId: string, name: string): Promise<ClientRecord> {
  try {
    return await updateClient(clientId, { name })
  } catch (error) {
    throw new Error(
      `Failed to update profile for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Writes to the legacy client.plan field, which is NOT read by
// entitlement-service.ts and has no bearing on real feature access. Do not
// wire this to subscription.plan without a payment-verification step —
// doing so naively would let any user self-upgrade to unlimited access for
// free. This function/endpoint is expected to be replaced during Razorpay
// integration.
export async function upgradeClientPlan(
  clientId: string,
  plan: ClientRecord['plan']
): Promise<ClientRecord> {
  try {
    return await updateClient(clientId, { plan })
  } catch (error) {
    throw new Error(
      `Failed to upgrade plan for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
