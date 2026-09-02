// One-time backfill for M1 (issue #27): copy each client's single connected
// Page onto its own `meta_page_lookup` row.
//
// Why a backfill rather than a forced reconnect (decision D3): the data is
// already in the client records. Making customers re-consent on a Facebook
// screen for a bug they did not cause is the wrong trade, and a reconnect is
// the one operation that can lose a working connection.
//
// What it writes, per client with a metaConnection:
//   pageName                 <- metaConnection.pageName
//   pageAccessTokenEncrypted <- metaConnection.pageAccessTokenEncrypted
//   lastVerifiedAt           <- now (we have not re-checked with Meta; see M5)
//
// The ciphertext is copied verbatim. It is NOT decrypted and re-encrypted:
// there is no reason to bring a live Page token into process memory, and the
// KMS key is the same either way.
//
// Idempotent: a row that already carries a token is skipped, so a second run
// writes nothing. Conservative: a client whose metaConnection is missing a
// token, or whose page row belongs to a DIFFERENT client, is skipped loudly
// rather than overwritten -- an atomic claim exists precisely so one Page maps
// to one client, and a backfill must not be the thing that breaks it.
//
// Run from backend/:
//   npx tsx scripts/backfill-meta-page-registry.ts --dry-run
//   npx tsx scripts/backfill-meta-page-registry.ts

import { getAllClients } from '../src/repositories/client-repository.js'
import { getPageRegistration, setPageClientMapping } from '../src/repositories/meta-lead-repository.js'

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  if (dryRun) console.log('DRY RUN — no writes will be made.\n')

  const clients = await getAllClients()
  console.log(`Scanned ${clients.length} client(s).`)

  let written = 0
  let skippedAlreadyDone = 0
  let skippedNoConnection = 0
  let skippedUnsafe = 0

  for (const client of clients) {
    const conn = client.metaConnection
    if (!conn?.pageId) {
      skippedNoConnection += 1
      continue
    }

    if (!conn.pageAccessTokenEncrypted || !conn.pageName) {
      console.warn(
        `  SKIP ${client.clientId}: metaConnection for page ${conn.pageId} is missing a token or name. ` +
          `Nothing safe to copy; this client needs a reconnect.`
      )
      skippedUnsafe += 1
      continue
    }

    const existing = await getPageRegistration(conn.pageId)

    if (existing?.pageAccessTokenEncrypted) {
      skippedAlreadyDone += 1
      continue
    }

    // The row exists but belongs to someone else. Overwriting would break the
    // one-Page-one-client invariant the atomic claim protects.
    if (existing && existing.clientId !== client.clientId) {
      console.warn(
        `  SKIP ${client.clientId}: page ${conn.pageId} is claimed by ${existing.clientId}. ` +
          `Not overwriting a claim from a backfill.`
      )
      skippedUnsafe += 1
      continue
    }

    if (dryRun) {
      console.log(`  WOULD WRITE page ${conn.pageId} ("${conn.pageName}") -> ${client.clientId}`)
      written += 1
      continue
    }

    await setPageClientMapping(conn.pageId, client.clientId, {
      pageName: conn.pageName,
      pageAccessTokenEncrypted: conn.pageAccessTokenEncrypted,
    })
    console.log(`  wrote page ${conn.pageId} ("${conn.pageName}") -> ${client.clientId}`)
    written += 1
  }

  console.log(
    `\n${dryRun ? 'Would write' : 'Wrote'}: ${written}. ` +
      `Already done: ${skippedAlreadyDone}. No Meta connection: ${skippedNoConnection}. ` +
      `Skipped unsafe: ${skippedUnsafe}.`
  )

  if (skippedUnsafe > 0) {
    console.warn('\nSome clients were skipped as unsafe. Read the warnings above before re-running.')
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
