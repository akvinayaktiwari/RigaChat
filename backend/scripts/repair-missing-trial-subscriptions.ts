// Repairs clients that have no subscriptions row.
//
// WHY THIS EXISTS, AND WHY IT IS NOT backfill-subscriptions.ts:
//   createTrialSubscription() in client-service.ts deliberately swallows its
//   own errors -- a failed subscription write must not fail a signup that
//   already succeeded. The cost is that a client can exist with no
//   subscriptions row at all, and subscribeToTier() then throws
//   NO_SUBSCRIPTION_RECORD, so /api/billing/subscribe 500s for that account
//   forever. Four accounts were found in this state on 2026-08-22, all from
//   signups on 8-9 July.
//
//   backfill-subscriptions.ts CANNOT be used for this. It writes
//   `status: 'active'` with `plan: client.plan` because it was built to
//   grandfather pre-existing clients during a migration. Running it here
//   would hand these accounts a paid plan for free AND still block checkout,
//   because 'active' trips subscribeToTier's ALREADY_SUBSCRIBED guard. The
//   500 would simply become a 409.
//
//   This script instead writes the row createTrialSubscription() should have
//   written: trialing / free / no provider fields. The trial window is
//   backdated to the client's own signup date, so an account gets exactly the
//   14 days it was originally due and nothing more -- for these clients that
//   window has long passed, which entitlement-service.ts evaluates at read
//   time as trial_expired (degraded). The point is to unblock checkout, not
//   to grant access.
//
// Safe to re-run: a client that already has a row is skipped, so a second run
// creates zero additional rows.
//
// Run manually from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm scripts/repair-missing-trial-subscriptions.ts
//
// Pass --apply to write. Without it the script reports what it would do and
// changes nothing, because this table is real billing state.

import { getAllClients } from '../src/repositories/client-repository.js'
import { create as createSubscription, getByAccountId } from '../src/repositories/subscription-repository.js'
import { TRIAL } from '../src/config/entitlements-config.js'

interface Repair {
  clientId: string
  email: string
  trialStartedAt: string
  trialEndsAt: string
}

function trialWindow(signedUpAt: string): { trialStartedAt: string; trialEndsAt: string } {
  const start = new Date(signedUpAt)
  const end = new Date(start.getTime() + TRIAL.durationDays * 24 * 60 * 60 * 1000)
  return { trialStartedAt: start.toISOString(), trialEndsAt: end.toISOString() }
}

async function findRepairs(): Promise<Repair[]> {
  const clients = await getAllClients()
  const repairs: Repair[] = []

  for (const client of clients) {
    if (await getByAccountId(client.clientId)) continue

    const { trialStartedAt, trialEndsAt } = trialWindow(client.createdAt)
    repairs.push({ clientId: client.clientId, email: client.email, trialStartedAt, trialEndsAt })
  }

  return repairs
}

async function applyRepair(repair: Repair): Promise<void> {
  await createSubscription({
    accountId: repair.clientId,
    status: 'trialing',
    plan: 'free',
    addons: {},
    overrides: {},
    isInternal: false,
    trialStartedAt: repair.trialStartedAt,
    trialEndsAt: repair.trialEndsAt,
    currentPeriodStart: repair.trialStartedAt,
    currentPeriodEnd: null,
    paymentProvider: null,
    providerSubscriptionId: null,
    providerCustomerId: null,
  })
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const repairs = await findRepairs()

  console.log(`Clients with no subscriptions row: ${repairs.length}`)
  for (const r of repairs) {
    console.log(`  ${r.clientId}  ${r.email}  trial ${r.trialStartedAt.slice(0, 10)} -> ${r.trialEndsAt.slice(0, 10)}`)
  }

  if (repairs.length === 0) return

  if (!apply) {
    console.log('\nDRY RUN - nothing written. Re-run with --apply to create these rows.')
    return
  }

  let created = 0
  const failures: { clientId: string; error: string }[] = []

  for (const repair of repairs) {
    try {
      await applyRepair(repair)
      created++
    } catch (error) {
      failures.push({ clientId: repair.clientId, error: error instanceof Error ? error.message : String(error) })
    }
  }

  console.log(`\nCreated: ${created}   Failed: ${failures.length}`)
  for (const f of failures) console.log(`  - ${f.clientId}: ${f.error}`)
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error('repair-missing-trial-subscriptions failed:', error)
  process.exit(1)
})
