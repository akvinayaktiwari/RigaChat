import { getAgentForResource } from '../repositories/agent-binding-lookup-repository.js'
import { getAgents } from './agent-service.js'
import type { Agent } from '../types/index.js'

// -------------------------------------------------------------------------
// "An inbound WhatsApp message arrived on this number. Whose Agent answers it?"
//
// This is the lookup the 2026-07-29 design left open (Open Question 3: inbound
// routing resolves to a clientId today, and should resolve to an agentId once an
// Agent owns the WhatsApp binding).
//
// ONE ENTRY POINT WITH ORDERED STRATEGIES, on purpose. The current product rule
// is one number to exactly one Agent, which strategy 2 alone satisfies. The rule
// will eventually loosen to many Agents sharing a number, distinguished by a
// reference code in the prefilled wa.me text. When that happens, strategy 1 gets
// a body and nothing else moves: not the webhook handler, not lead creation, not
// the agent turn. Building the seam now costs a few lines; retrofitting it later
// means touching every caller.
// -------------------------------------------------------------------------

export type AgentResolutionStrategy = 'ref_code' | 'number_binding' | 'only_agent'

export interface InboundAgentResolution {
  agent: Agent
  botId: string
  strategy: AgentResolutionStrategy
}

// Deliberately unimplemented. Returns null so the chain falls through, and there
// is a test asserting it is skipped rather than silently assumed to work.
//
// When it lands it will strip a marker like `[ref:7f3a2b]` out of the prefilled
// message text, look it up, and return the Agent it names. That also gives the
// source page for attribution, which a WhatsApp lead otherwise has no way to
// carry.
function resolveByRefCode(_phoneNumberId: string, _messageText: string): Agent | null {
  return null
}

// The Agent that claimed this phone number in agent_binding_lookup. This is the
// normal path today and the reason binding claims the number atomically.
async function resolveByNumberBinding(phoneNumberId: string, clientId: string): Promise<Agent | null> {
  const binding = await getAgentForResource(phoneNumberId)
  if (!binding) return null

  // A binding pointing at an Agent this client does not own means the number was
  // claimed by someone else. Refuse rather than follow it across a tenant
  // boundary -- the same posture as lead-resolution-service's chat branch.
  if (binding.clientId !== clientId) return null

  const agents = await getAgents(clientId)
  return agents.find((candidate) => candidate.agentId === binding.agentId) ?? null
}

// Fallback for a client who connected WhatsApp before the binding existed, or
// who never used the toggle. Mirrors the form/Meta lead path in
// lead-resolution-service.ts: exactly one Agent is unambiguous, more than one
// is not, and guessing would hand a real buyer to the wrong persona and the
// wrong knowledge base.
async function resolveByOnlyAgent(clientId: string): Promise<Agent | null> {
  const agents = await getAgents(clientId)
  return agents.length === 1 ? (agents[0] ?? null) : null
}

export async function resolveAgentForInboundMessage(
  phoneNumberId: string,
  clientId: string,
  messageText: string
): Promise<InboundAgentResolution | null> {
  const refCodeAgent = resolveByRefCode(phoneNumberId, messageText)
  if (refCodeAgent) {
    return toResolution(refCodeAgent, 'ref_code')
  }

  const boundAgent = await resolveByNumberBinding(phoneNumberId, clientId)
  if (boundAgent) {
    return toResolution(boundAgent, 'number_binding')
  }

  const onlyAgent = await resolveByOnlyAgent(clientId)
  if (onlyAgent) {
    return toResolution(onlyAgent, 'only_agent')
  }

  return null
}

// An Agent with no web binding cannot answer: there is no botId to scope
// Pinecone by (rule 5), no partition to store a lead under, and nothing for
// journey ignition to resolve. bindWhatsAppToAgent refuses to create that state,
// so reaching here means a binding predates that rule.
function toResolution(agent: Agent, strategy: AgentResolutionStrategy): InboundAgentResolution | null {
  const botId = agent.channels.web?.resourceId
  if (!botId) {
    console.error(
      `[inbound-agent] agent ${agent.agentId} resolved by ${strategy} but has no web binding; cannot answer`
    )
    return null
  }
  return { agent, botId, strategy }
}
