/**
 * One-off admin tool: replace a knowledge base entry's content from a file and
 * re-embed it.
 *
 * Exists because the KB editor in the dashboard is behind client Cognito auth,
 * and correcting a stale platform-owned bot (for example the VyostraAI sales
 * agent on the marketing site) is an operator action, not a client one. It goes
 * through kb-service.updateKBEntry() on purpose rather than writing DynamoDB and
 * Pinecone directly, so the entry's old vectors are deleted and the new text is
 * embedded through exactly the same path a client edit takes.
 *
 * Usage:
 *   npx tsx scripts/update-kb-entry.ts <botId> <entryId> <clientId> <contentFile> [--title "..."] [--dry-run]
 */
import { readFileSync } from 'node:fs'
import 'dotenv/config'

interface Args {
  botId: string
  entryId: string
  clientId: string
  contentFile: string
  title?: string
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((arg) => !arg.startsWith('--'))
  const [botId, entryId, clientId, contentFile] = positional

  if (!botId || !entryId || !clientId || !contentFile) {
    throw new Error(
      'Usage: update-kb-entry.ts <botId> <entryId> <clientId> <contentFile> [--title "..."] [--dry-run]'
    )
  }

  const titleIndex = argv.indexOf('--title')
  const title = titleIndex === -1 ? undefined : argv[titleIndex + 1]

  return { botId, entryId, clientId, contentFile, title, dryRun: argv.includes('--dry-run') }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const content = readFileSync(args.contentFile, 'utf-8')

  // Imported lazily so --dry-run works without a full env (these modules read
  // table names and API keys as they load).
  const { getKBEntryById } = await import('../src/repositories/kb-repository.js')
  const existing = await getKBEntryById(args.botId, args.entryId)

  if (!existing) throw new Error(`KB entry ${args.entryId} not found on bot ${args.botId}`)
  if (existing.clientId !== args.clientId) {
    throw new Error(`KB entry ${args.entryId} belongs to ${existing.clientId}, not ${args.clientId}`)
  }

  const title = args.title ?? existing.title
  console.log(`entry:   ${existing.entryId} ("${existing.title}")`)
  console.log(`bot:     ${args.botId}`)
  console.log(`title:   "${existing.title}" -> "${title}"`)
  console.log(`content: ${existing.content.length} chars -> ${content.length} chars`)

  if (args.dryRun) {
    console.log('\n--dry-run: nothing written.')
    return
  }

  const { updateKBEntry } = await import('../src/services/kb-service.js')
  await updateKBEntry(args.botId, args.entryId, args.clientId, { title, content })
  console.log('\nUpdated and re-embedded. Allow 30-60s for Pinecone propagation before testing.')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
