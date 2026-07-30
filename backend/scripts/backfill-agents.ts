// One-time backfill: wraps each existing client's chatbot + voice agent into a
// single top-level Agent (the additive cross-channel identity umbrella).
//
// Additive and non-destructive: it creates new Agent records and claims their
// channel bindings in agent_binding_lookup. It never moves data, never touches
// Pinecone namespaces, and never modifies the underlying bot/voice records.
//
// Idempotent — safe to re-run:
//   - a client whose bot/voice resource is already bound to an Agent is skipped
//     (getAgentForResource check before creating), so a second run writes nothing.
//
// Conservative on ambiguity — never guesses a wrong pairing:
//   - a client with more than one chatbot OR more than one voice agent is
//     SKIPPED with a warning. Which bot pairs with which voice agent into one
//     Agent is a product decision, not something this script should assume. The
//     single real client today (1 bot + 1 voice agent) is unambiguous; grouping
//     for multi-resource clients is done by hand later.
//
// Run manually from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm scripts/backfill-agents.ts

import { getAllClients } from '../src/repositories/client-repository.js'
import { getBotsByClientId } from '../src/repositories/bot-repository.js'
import { getVoiceAgentsByClient } from '../src/repositories/voice-repository.js'
import { getAgentForResource } from '../src/repositories/agent-binding-lookup-repository.js'
import { createAgent } from '../src/services/agent-service.js'
import type { AgentChannel, AgentChannelBinding } from '../src/types/index.js'

async function main(): Promise<void> {
  console.log('Scanning clients table...')
  const clients = await getAllClients()
  console.log(`Found ${clients.length} client(s).`)

  let created = 0
  let skippedNone = 0
  let skippedAlready = 0
  let skippedAmbiguous = 0
  const errors: { clientId: string; error: string }[] = []

  for (const client of clients) {
    try {
      const bots = await getBotsByClientId(client.clientId)
      const voiceAgents = await getVoiceAgentsByClient(client.clientId)

      if (bots.length === 0 && voiceAgents.length === 0) {
        skippedNone++
        continue
      }

      if (bots.length > 1 || voiceAgents.length > 1) {
        skippedAmbiguous++
        console.warn(
          `  SKIP ${client.clientId}: ${bots.length} bot(s), ${voiceAgents.length} voice agent(s) — ambiguous grouping, wrap by hand.`
        )
        continue
      }

      const bot = bots[0]
      const voice = voiceAgents[0]

      const alreadyBound =
        (bot && (await getAgentForResource(bot.botId))) ||
        (voice && (await getAgentForResource(voice.agentId)))
      if (alreadyBound) {
        skippedAlready++
        continue
      }

      const channels: Partial<Record<AgentChannel, AgentChannelBinding>> = {}
      if (bot) {
        channels.web = { resourceId: bot.botId }
      }
      if (voice) {
        channels.voice = { resourceId: voice.agentId }
      }

      const name = bot?.name ?? voice?.name ?? 'Agent'
      const agent = await createAgent({ clientId: client.clientId, name, channels })
      created++
      console.log(
        `  OK   ${client.clientId}: created Agent ${agent.agentId} (${Object.keys(channels).join('+') || 'no'} channel(s))`
      )
    } catch (error) {
      errors.push({
        clientId: client.clientId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log('\n=== Backfill summary ===')
  console.log(`Total clients scanned: ${clients.length}`)
  console.log(`Agents created: ${created}`)
  console.log(`Skipped (no bot or voice agent): ${skippedNone}`)
  console.log(`Skipped (already wrapped in an Agent): ${skippedAlready}`)
  console.log(`Skipped (ambiguous — >1 bot or >1 voice agent): ${skippedAmbiguous}`)
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
