// One-time backfill: seed leadCount and lastLeadAt on each meta_page_lookup row
// from the leads that already exist.
//
// Without it, every Page connected before counting shipped reads "No leads yet"
// on the dashboard while holding hundreds of leads -- worse than showing
// nothing, because it looks like the Page is broken.
//
// Safe to re-run. Both fields are SET to values recomputed from the leads table
// rather than incremented, so a second run converges instead of doubling.
//
// The one race, and its direction matters: a lead that lands AFTER the scan has
// read its Page but BEFORE the SET lands is missing from the tally, and the SET
// then overwrites the increment the live path had already applied. So the error
// is always an UNDERCOUNT -- by however many leads arrive inside that window --
// never a double count. A number that is one or two low looks perfectly
// plausible, so do not expect to notice it: re-run once traffic is quiet and it
// converges on the truth.
//
// Run from backend/:
//   npx tsx scripts/backfill-meta-page-lead-counts.ts --dry-run
//   npx tsx scripts/backfill-meta-page-lead-counts.ts

import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from '../src/repositories/dynamo-client.js'

interface Tally {
  count: number
  lastLeadAt: string
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  if (dryRun) console.log('DRY RUN — no writes will be made.\n')

  const leadsTable = getTableName('meta_leads')
  const pagesTable = getTableName('meta_page_lookup')

  // A full scan is right here and nowhere else: this runs once, offline, and
  // meta_leads has no pageId index to query instead.
  const tallies = new Map<string, Tally>()
  let startKey: Record<string, unknown> | undefined
  let scanned = 0

  do {
    const page = await dynamoClient.send(
      new ScanCommand({
        TableName: leadsTable,
        ProjectionExpression: 'pageId, createdAt',
        ExclusiveStartKey: startKey,
      })
    )
    for (const item of page.Items ?? []) {
      const row = item as { pageId?: string; createdAt?: string }
      if (!row.pageId || !row.createdAt) continue
      scanned += 1
      const seen = tallies.get(row.pageId)
      tallies.set(row.pageId, {
        count: (seen?.count ?? 0) + 1,
        lastLeadAt: seen && seen.lastLeadAt > row.createdAt ? seen.lastLeadAt : row.createdAt,
      })
    }
    startKey = page.LastEvaluatedKey as Record<string, unknown> | undefined
  } while (startKey)

  console.log(`Scanned ${scanned} lead(s) across ${tallies.size} page(s).`)

  let written = 0
  let missingPage = 0

  for (const [pageId, tally] of tallies) {
    if (dryRun) {
      console.log(`  WOULD SET page ${pageId} -> ${tally.count} lead(s), last ${tally.lastLeadAt}`)
      written += 1
      continue
    }

    try {
      await dynamoClient.send(
        new UpdateCommand({
          TableName: pagesTable,
          Key: { pageId },
          UpdateExpression: 'SET leadCount = :count, lastLeadAt = :lastLeadAt',
          // Never create a row for a Page nobody has connected -- leads can
          // outlive a disconnect, and a phantom row would put a Page the client
          // removed back in their list.
          ConditionExpression: 'attribute_exists(pageId)',
          ExpressionAttributeValues: { ':count': tally.count, ':lastLeadAt': tally.lastLeadAt },
        })
      )
      console.log(`  set page ${pageId} -> ${tally.count} lead(s), last ${tally.lastLeadAt}`)
      written += 1
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        console.warn(`  SKIP ${pageId}: has ${tally.count} lead(s) but no page row (disconnected).`)
        missingPage += 1
        continue
      }
      throw error
    }
  }

  console.log(`\n${dryRun ? 'Would write' : 'Wrote'}: ${written}. No page row: ${missingPage}.`)
}

main().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
