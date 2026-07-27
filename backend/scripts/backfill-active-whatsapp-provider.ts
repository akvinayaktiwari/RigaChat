// One-time backfill: sets activeWhatsappProvider = 'gupshup' for every
// existing client with a connected Gupshup connection and no
// activeWhatsappProvider set yet. Safe to re-run — clients that already have
// the field set are skipped, so a second run (e.g. after a partial failure)
// creates zero additional writes.
//
// Note: getActiveProviderAndCredentials() in whatsapp-service.ts already has
// a defensive fallback that treats an unset activeWhatsappProvider + a
// connected Gupshup connection as active 'gupshup' — this script isn't the
// only thing standing between an unmigrated client and a broken send, it
// just makes the DB state explicit instead of relying on that fallback
// forever (design doc Premise 8).
//
// Run manually from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm scripts/backfill-active-whatsapp-provider.ts

import { getAllClients, updateClient } from '../src/repositories/client-repository.js'

async function main(): Promise<void> {
  console.log('Scanning clients table...')
  const clients = await getAllClients()
  console.log(`Found ${clients.length} client(s).`)

  let updated = 0
  let skipped = 0
  const errors: { clientId: string; error: string }[] = []

  for (const client of clients) {
    try {
      if (client.activeWhatsappProvider) {
        skipped++
        continue
      }

      if (!client.whatsappConnection?.connected) {
        skipped++
        continue
      }

      await updateClient(client.clientId, { activeWhatsappProvider: 'gupshup' })
      updated++
    } catch (error) {
      errors.push({
        clientId: client.clientId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log('\n=== Backfill summary ===')
  console.log(`Total clients scanned: ${clients.length}`)
  console.log(`activeWhatsappProvider set to 'gupshup': ${updated}`)
  console.log(`Skipped (already set, or no connected Gupshup connection): ${skipped}`)
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
