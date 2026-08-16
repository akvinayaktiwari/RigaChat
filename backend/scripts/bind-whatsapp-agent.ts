// Turns WhatsApp on for an Agent, without the dashboard toggle existing yet.
//
// This is the same service call the toggle will make (#10), exposed as a script
// so the inbound path can be exercised on a real number before any UI is built
// and before any client can switch it on themselves.
//
// It claims the client's phoneNumberId in agent_binding_lookup, which is what
// makes "one WhatsApp number belongs to exactly one Agent" a database
// constraint. A second Agent claiming the same number is rejected by the
// condition on that write, not by a check here.
//
// Run from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/bind-whatsapp-agent.ts --client-id=<id> [--agent-id=<id>] [--unbind]
//
// With no --agent-id, binds the client's only Agent and refuses if there are
// several, so a slip cannot silently wire the wrong one.

import { bindWhatsAppToAgent, getAgents, unbindWhatsAppFromAgent } from '../src/services/agent-service.js'
import { getClientById } from '../src/repositories/client-repository.js'

const clientId = process.argv.find((a) => a.startsWith('--client-id='))?.split('=')[1]
const agentIdArg = process.argv.find((a) => a.startsWith('--agent-id='))?.split('=')[1]
const unbind = process.argv.includes('--unbind')

async function main(): Promise<void> {
  if (!clientId) {
    console.error('usage: --client-id=<id> [--agent-id=<id>] [--unbind]')
    process.exit(1)
  }

  const client = await getClientById(clientId)
  const connection = client?.metaDirectWhatsAppConnection
  if (!connection?.connected) {
    console.error(`Client ${clientId} has no connected Meta WhatsApp connection.`)
    process.exit(1)
  }

  const agents = await getAgents(clientId)
  if (agents.length === 0) {
    console.error(`Client ${clientId} has no Agents.`)
    process.exit(1)
  }

  let agentId = agentIdArg
  if (!agentId) {
    if (agents.length > 1) {
      console.error(`Client has ${agents.length} Agents; pass --agent-id to choose one:`)
      for (const a of agents) console.error(`  ${a.agentId}  ${a.name}`)
      process.exit(1)
    }
    agentId = agents[0]!.agentId
  }

  const target = agents.find((a) => a.agentId === agentId)
  if (!target) {
    console.error(`Agent ${agentId} not found for client ${clientId}.`)
    process.exit(1)
  }

  console.log(`agent  : ${target.agentId} (${target.name})`)
  console.log(`web    : ${target.channels.web?.resourceId ?? 'NONE — binding will be refused'}`)
  console.log(`number : ${connection.displayPhoneNumber} (phoneNumberId ${connection.phoneNumberId})`)

  if (unbind) {
    const updated = await unbindWhatsAppFromAgent(agentId, clientId)
    console.log(`\nunbound. channels now: ${Object.keys(updated.channels).join(', ') || 'none'}`)
    return
  }

  const updated = await bindWhatsAppToAgent(agentId, clientId)
  console.log(`\nbound. channels now: ${Object.keys(updated.channels).join(', ')}`)
  console.log(`whatsapp -> ${updated.channels.whatsapp?.resourceId}`)
  console.log(`\nInbound messages to ${connection.displayPhoneNumber} now resolve to this Agent.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
