// One-time backfill: creates a subscriptions row for every existing client
// that doesn't already have one. Safe to re-run — clients with an existing
// row are skipped, so a second run creates zero additional rows.
//
// Run manually from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm scripts/backfill-subscriptions.ts
// (Mirrors the `dev` npm script's invocation — this repo has no existing
// ts-node one-off-script convention; deploy.js is plain JS run via bare
// `node`, not ts-node.)

import { getAllClients } from '../src/repositories/client-repository.js'
import { create as createSubscription, getByAccountId } from '../src/repositories/subscription-repository.js'

async function main(): Promise<void> {
  console.log('Scanning clients table...')
  const clients = await getAllClients()
  console.log(`Found ${clients.length} client(s).`)

  let created = 0
  let skipped = 0
  const errors: { clientId: string; error: string }[] = []

  for (const client of clients) {
    try {
      const existing = await getByAccountId(client.clientId)
      if (existing) {
        skipped++
        continue
      }

      const now = new Date().toISOString()
      await createSubscription({
        accountId: client.clientId,
        status: 'active',
        plan: client.plan,
        addons: {},
        overrides: {},
        isInternal: false,
        trialStartedAt: null,
        trialEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        paymentProvider: null,
        providerSubscriptionId: null,
        providerCustomerId: null,
      })
      created++
    } catch (error) {
      errors.push({
        clientId: client.clientId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log('\n=== Backfill summary ===')
  console.log(`Total clients scanned: ${clients.length}`)
  console.log(`Subscriptions created: ${created}`)
  console.log(`Skipped (already had a subscription): ${skipped}`)
  console.log(`Errors: ${errors.length}`)
  if (errors.length > 0) {
    for (const { clientId, error } of errors) {
      console.log(`  - ${clientId}: ${error}`)
    }
  }
}

main().catch((error) => {
  console.error('Backfill script failed to run:', error)
  process.exit(1)
})
