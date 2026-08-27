import { createClient, getClientById, updateClient } from '../repositories/client-repository.js'
import { create as createSubscription, getByAccountId } from '../repositories/subscription-repository.js'
import { TRIAL } from '../config/entitlements-config.js'
import { countBotsForClient } from '../repositories/bot-repository.js'
import { resolveNotificationPreferences } from '../types/index.js'
import type { AppBootstrap, Capability, ClientRecord, NotificationPreferences, Subscription } from '../types/index.js'

// What a set-up client's mobile app may do today. Phase 1 only: 'lead.timeline'
// is deliberately absent until GET /api/leads/events ships in the app, because
// advertising a capability the app cannot render is worse than withholding one
// it could.
//
// Adding an entry here is how a new mobile feature reaches installed builds --
// see vyostra-mobile docs/designs/web-mobile-contract.md. Builds that predate
// the entry ignore it and render no control, which is the whole point.
const READY_CAPABILITIES: Capability[] = ['lead.read', 'lead.state', 'lead.note']

interface UpsertClientInput {
  clientId: string
  email: string
  name: string
  authProvider: ClientRecord['authProvider']
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
      authProvider: input.authProvider,
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

// The one place a trial row's shape is defined. ensureTrialSubscription()
// below repairs signups that lost theirs, and it must reconstruct exactly what
// signup would have written -- two copies of this object would drift.
function buildTrialSubscription(
  clientId: string,
  startedAt: Date
): Omit<Subscription, 'createdAt' | 'updatedAt'> {
  const trialEndsAt = new Date(startedAt.getTime() + TRIAL.durationDays * 24 * 60 * 60 * 1000)

  return {
    accountId: clientId,
    status: 'trialing',
    plan: 'free',
    addons: {},
    overrides: {},
    isInternal: false,
    trialStartedAt: startedAt.toISOString(),
    trialEndsAt: trialEndsAt.toISOString(),
    currentPeriodStart: startedAt.toISOString(),
    currentPeriodEnd: null,
    paymentProvider: null,
    providerSubscriptionId: null,
    providerCustomerId: null,
  }
}

const TRIAL_WRITE_ATTEMPTS = 3
const TRIAL_WRITE_BACKOFF_MS = 100

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Still swallows, for the original reason: a failed subscription write must not
// fail a signup whose client row already succeeded. What changed is that it no
// longer fails QUIETLY.
//
// On 2026-08-22 four accounts were found with a clients row and no
// subscriptions row, from signups on 8-9 July. The consequences ran for six
// weeks unnoticed and in opposite directions: /api/billing/subscribe threw
// NO_SUBSCRIPTION_RECORD and 500'd for those users on every checkout attempt
// forever, while entitlement-service.ts's computeEntitlements() treats a null
// subscription as buildFullTrialEntitlements() -- a trial with no trialEndsAt
// to expire, so they also had unlimited access. Nothing surfaced either.
//
// So: retry first (a transient DynamoDB throttle or timeout is the likely
// cause, and a second attempt costs ~100ms), and if it still fails, log under a
// marker worth alerting on rather than a line that reads like routine noise.
async function createTrialSubscription(clientId: string): Promise<void> {
  const row = buildTrialSubscription(clientId, new Date())

  for (let attempt = 1; attempt <= TRIAL_WRITE_ATTEMPTS; attempt++) {
    try {
      await createSubscription(row)
      if (attempt > 1) {
        console.warn(`[signup-integrity] trial subscription for ${clientId} succeeded on attempt ${attempt}`)
      }
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (attempt === TRIAL_WRITE_ATTEMPTS) {
        console.error(
          `[signup-integrity] ALERT: client ${clientId} was created with NO subscriptions row ` +
            `after ${TRIAL_WRITE_ATTEMPTS} attempts. They will 500 on checkout and hold ` +
            `unexpiring trial entitlements until repaired. Run ` +
            `backend/scripts/repair-missing-trial-subscriptions.ts. Last error: ${message}`
        )
        return
      }

      console.warn(
        `[signup-integrity] trial subscription write for ${clientId} failed on attempt ${attempt}, retrying: ${message}`
      )
      await delay(TRIAL_WRITE_BACKOFF_MS * attempt)
    }
  }
}

// Returns the account's subscription, creating the trial row signup should have
// written if it is missing. Self-healing on the read path is what stops a lost
// write from being permanent: retries above reduce how often it happens, this
// makes it recoverable when it does.
//
// The trial window is backdated to the client's own createdAt, so repairing a
// six-week-old account grants exactly the 14 days it was originally due --
// already expired -- rather than a fresh trial as a reward for the bug.
//
// Returns null only when there is no client record at all, which is a genuinely
// different situation (an unknown account) and stays the caller's decision.
export async function ensureTrialSubscription(clientId: string): Promise<Subscription | null> {
  const existing = await getByAccountId(clientId)
  if (existing) return existing

  const client = await getClientById(clientId)
  if (!client) return null

  console.warn(
    `[signup-integrity] repairing missing subscriptions row for client ${clientId} on read`
  )

  return await createSubscription(buildTrialSubscription(clientId, new Date(client.createdAt)))
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

// Everything the mobile app needs on launch, in one call.
//
// Readiness is bot count > 0 (decision D1). Not derived from an empty lead
// list: "you have not set up a bot yet" and "you are set up and no leads have
// arrived" look identical from the inbox, and they need opposite screens.
//
// Capabilities are empty when not ready. An app behind the setup gate can do
// nothing, and returning a list it cannot act on invites a UI that renders
// buttons the user cannot reach.
export async function getAppBootstrap(clientId: string): Promise<AppBootstrap> {
  const botCount = await countBotsForClient(clientId)

  if (botCount === 0) {
    return { ready: false, reason: 'no_bot', capabilities: [] }
  }

  return { ready: true, capabilities: READY_CAPABILITIES }
}

// Partial by design: the Settings UI toggles one channel at a time, and sending
// the whole object back would let a stale page silently revert a change made on
// another device.
export async function updateNotificationPreferences(
  clientId: string,
  patch: Partial<NotificationPreferences>
): Promise<ClientRecord> {
  const client = await getClient(clientId)
  const current = resolveNotificationPreferences(client.notificationPreferences)
  return updateClient(clientId, { notificationPreferences: { ...current, ...patch } })
}
