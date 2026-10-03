// One-time backfill: rewrite every Zoho CRM connection stored with plaintext
// tokens so it holds KMS-encrypted ones instead.
//
// Why: connections made before 2026-10-03 stored the Zoho access and refresh
// tokens as plain strings on the client record. New connections are encrypted,
// and an old row is rewritten encrypted the next time its token refreshes, but
// a client whose leads have stopped (or who never gets one) would keep a live
// refresh token in plaintext indefinitely. This closes that tail. The privacy
// policy's statement that Zoho secrets are KMS-encrypted is true only once this
// has run in production.
//
// What it does, per client with a crmConnection: decrypts nothing, reads the
// plaintext pair, encrypts both with lib/kms.ts, and writes the connection back
// whole, which drops the plaintext fields in the same write.
//
// Idempotent: a fully encrypted connection is skipped, so a second run writes
// nothing. A connection with no tokens at all is reported and left alone; it
// needs the client to reconnect, which the backfill cannot do for them.
//
// Run from backend/ (needs AWS credentials and WHATSAPP_KMS_KEY_ID):
//   npx tsx scripts/encrypt-zoho-tokens.ts --dry-run
//   npx tsx scripts/encrypt-zoho-tokens.ts

import { getAllClients } from '../src/repositories/client-repository.js'
import { encryptLegacyZohoTokens, type ZohoTokenMigration } from '../src/services/crm-service.js'

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  if (dryRun) console.log('DRY RUN — no writes will be made.\n')

  const clients = await getAllClients()
  console.log(`Scanned ${clients.length} client(s).`)

  const counts: Record<ZohoTokenMigration, number> = {
    encrypted: 0,
    'already-encrypted': 0,
    'no-connection': 0,
    'no-tokens': 0,
  }

  for (const client of clients) {
    const result = await encryptLegacyZohoTokens(client, dryRun)
    counts[result] += 1
    if (result === 'encrypted') console.log(`  ${dryRun ? 'WOULD ENCRYPT' : 'ENCRYPTED'} ${client.clientId}`)
  }

  console.log(`\n${dryRun ? 'Would encrypt' : 'Encrypted'}: ${counts.encrypted}`)
  console.log(`Already encrypted: ${counts['already-encrypted']}`)
  console.log(`No Zoho connection: ${counts['no-connection']}`)
  console.log(`Connected but no tokens (needs a reconnect): ${counts['no-tokens']}`)
}

main().catch((error: unknown) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
