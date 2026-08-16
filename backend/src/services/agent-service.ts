import { v4 as uuidv4 } from 'uuid'
import {
  createAgent as createAgentRecord,
  deleteAgent as deleteAgentRecord,
  getAgentById,
  getAgentsByClientId,
  updateAgent as updateAgentRecord,
} from '../repositories/agent-repository.js'
import {
  claimAgentBinding,
  getAgentForResource,
  removeAgentBinding,
} from '../repositories/agent-binding-lookup-repository.js'
import { getBotById } from '../repositories/bot-repository.js'
import { getClientById } from '../repositories/client-repository.js'
import { getVoiceAgentById } from '../repositories/voice-repository.js'
import type { Agent, AgentChannel, AgentChannelBinding } from '../types/index.js'

export interface CreateAgentInput {
  clientId: string
  name: string
  channels: Partial<Record<AgentChannel, AgentChannelBinding>>
}

// Only web (botId) and voice (voice agentId) bindings point at a real,
// per-agent implementation record that can be owned and uniquely claimed.
//
// whatsapp joined this list on 2026-08-16. It used to be a marker with no
// resourceId, because the connection lives on the client record and there was
// nothing per-agent to claim. Binding the phoneNumberId changes that, and buys
// the product rule "one WhatsApp number belongs to exactly one Agent" for free:
// claimAgentBinding's ConditionExpression already rejects a second Agent, even
// one owned by the same client. The rule becomes a database constraint rather
// than a convention nobody enforces.
const CLAIMABLE_CHANNELS: AgentChannel[] = ['web', 'voice', 'whatsapp']

function claimableResources(
  channels: Partial<Record<AgentChannel, AgentChannelBinding>>
): { channel: AgentChannel; resourceId: string }[] {
  const out: { channel: AgentChannel; resourceId: string }[] = []
  for (const channel of CLAIMABLE_CHANNELS) {
    const resourceId = channels[channel]?.resourceId
    if (resourceId) {
      out.push({ channel, resourceId })
    }
  }
  return out
}

// SECURITY (plan-eng-review Issue 2): a client may only bind channel resources
// they own. Without this, POSTing another client's botId/voiceAgentId would
// wire it into the caller's Agent. Mirrors the 404-either-way ownership pattern
// used across the codebase -- the error messages match getBotConfig/voice-service
// so a non-owner can't distinguish "doesn't exist" from "not yours".
async function assertBindingsOwned(
  channels: Partial<Record<AgentChannel, AgentChannelBinding>>,
  clientId: string
): Promise<void> {
  for (const { channel, resourceId } of claimableResources(channels)) {
    if (channel === 'web') {
      const bot = await getBotById(resourceId, clientId)
      if (!bot) {
        throw new Error('Bot not found')
      }
    } else if (channel === 'voice') {
      const voiceAgent = await getVoiceAgentById(resourceId)
      if (!voiceAgent || voiceAgent.clientId !== clientId) {
        throw new Error('Voice agent not found')
      }
    } else if (channel === 'whatsapp') {
      // The resourceId must be THIS client's connected phone number. Without
      // this, a client could bind a phoneNumberId belonging to someone else and
      // start receiving their inbound messages, since inbound routing resolves
      // by phoneNumberId alone.
      const client = await getClientById(clientId)
      const connection = client?.metaDirectWhatsAppConnection
      if (!connection?.connected || connection.phoneNumberId !== resourceId) {
        throw new Error('WhatsApp number not found')
      }
    }
  }
}

async function getOwnedAgent(agentId: string, clientId: string): Promise<Agent> {
  const agent = await getAgentById(agentId, clientId)
  if (!agent || agent.clientId !== clientId) {
    throw new Error('Agent not found')
  }
  return agent
}

// Ownership is validated BEFORE any binding is claimed. Bindings are then
// claimed atomically; if a later claim conflicts (the resource already belongs
// to another Agent) or the Agent write fails, the claims already made are
// released so a failed create never leaves orphaned bindings. This is
// compensation, not a real transaction -- DynamoDB has no cross-table
// transaction here -- but ownership-validate-first plus release-on-failure is
// sufficient for the single-writer create path.
export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  await assertBindingsOwned(input.channels, input.clientId)

  const agentId = uuidv4()
  const claimed: string[] = []
  try {
    for (const { resourceId } of claimableResources(input.channels)) {
      await claimAgentBinding(resourceId, agentId, input.clientId)
      claimed.push(resourceId)
    }
    return await createAgentRecord({
      agentId,
      clientId: input.clientId,
      name: input.name,
      channels: input.channels,
    })
  } catch (error) {
    for (const resourceId of claimed) {
      await removeAgentBinding(resourceId).catch(() => {})
    }
    throw error
  }
}

// Reverse lookup used by journey/scheduler create paths to stamp the owning
// Agent onto a new record. Returns undefined when the resource isn't bound to
// any Agent (additive: pre-Agent journeys keep working) or when the binding's
// client doesn't match (defensive -- the caller already owns the bot, but this
// guards against a stale/mismatched lookup row).
export async function resolveOwningAgentId(
  resourceId: string,
  clientId: string
): Promise<string | undefined> {
  const binding = await getAgentForResource(resourceId)
  if (binding && binding.clientId === clientId) {
    return binding.agentId
  }
  return undefined
}

export async function getAgent(agentId: string, clientId: string): Promise<Agent> {
  return await getOwnedAgent(agentId, clientId)
}

export async function getAgents(clientId: string): Promise<Agent[]> {
  return await getAgentsByClientId(clientId)
}

export async function deleteAgent(agentId: string, clientId: string): Promise<void> {
  const agent = await getOwnedAgent(agentId, clientId)
  for (const { resourceId } of claimableResources(agent.channels)) {
    await removeAgentBinding(resourceId).catch(() => {})
  }
  await deleteAgentRecord(agentId, clientId)
}

// -------------------------------------------------------------------------
// Turning WhatsApp on for an Agent. This is what the "Also available on
// WhatsApp" toggle calls.
//
// A web binding is REQUIRED, and that is a real constraint rather than an
// incidental one. An inbound WhatsApp lead has to be stored somewhere, scoped
// for RAG, and handed to a journey, and all three are keyed by botId: the leads
// table is partitioned by botId, the Pinecone namespace IS the botId (rule 5),
// and journey ignition resolves through the web binding. An Agent with WhatsApp
// and no bot has nowhere to put a lead and no knowledge to answer from.
//
// This also matches how the product is described: you switch WhatsApp on FOR a
// chatbot, so a bot always exists by the time anyone reaches here.
// -------------------------------------------------------------------------
export async function bindWhatsAppToAgent(agentId: string, clientId: string): Promise<Agent> {
  const agent = await getOwnedAgent(agentId, clientId)

  if (!agent.channels.web?.resourceId) {
    throw new Error(
      'This Agent has no chatbot yet. WhatsApp needs one for its knowledge base and to store leads against.'
    )
  }

  const client = await getClientById(clientId)
  const connection = client?.metaDirectWhatsAppConnection
  if (!connection?.connected) {
    throw new Error('Connect WhatsApp for this account before enabling it on an Agent.')
  }

  const channels = { ...agent.channels, whatsapp: { resourceId: connection.phoneNumberId } }

  // Ownership first, then the atomic claim, mirroring createAgent. A second
  // Agent claiming the same number fails here rather than silently sharing it.
  await assertBindingsOwned({ whatsapp: channels.whatsapp }, clientId)
  await claimAgentBinding(connection.phoneNumberId, agentId, clientId)

  try {
    return await updateAgentRecord(agentId, clientId, { channels })
  } catch (error) {
    // Release the claim so a failed write does not leave the number owned by an
    // Agent that never recorded the binding. Same compensation pattern as
    // createAgent; not a transaction, but sufficient for a single writer.
    await removeAgentBinding(connection.phoneNumberId).catch(() => undefined)
    throw error
  }
}

export async function unbindWhatsAppFromAgent(agentId: string, clientId: string): Promise<Agent> {
  const agent = await getOwnedAgent(agentId, clientId)
  const resourceId = agent.channels.whatsapp?.resourceId

  const { whatsapp: _removed, ...channels } = agent.channels
  const updated = await updateAgentRecord(agentId, clientId, { channels })

  // After the record, so a failure above leaves the claim intact rather than
  // freeing a number the Agent still lists.
  if (resourceId) {
    await removeAgentBinding(resourceId)
  }

  return updated
}

// -------------------------------------------------------------------------
// Bot-scoped view of the WhatsApp channel, for the "Also available on WhatsApp"
// toggle on the bot detail page.
//
// Deliberately keyed by botId rather than agentId. The screen is about a
// chatbot, the product story is "make this chatbot a WhatsApp bot", and the
// Agent is an identity layer the client has never been shown. Exposing agentId
// to the UI here would put a fourth meaning of "agent" in front of them (see
// the naming-collision TODO). The indirection stays server-side.
// -------------------------------------------------------------------------

export interface BotWhatsAppStatus {
  // false when the client has not connected WhatsApp at all -- the toggle is
  // hidden rather than shown broken.
  connectionAvailable: boolean
  enabled: boolean
  // Present only when a connection exists. This is the DISPLAY number, the one
  // a human dials. Never phoneNumberId, which is Meta's internal resource id and
  // cannot form a wa.me link.
  displayPhoneNumber?: string
  // Set when this bot's Agent cannot take the channel, so the UI can explain
  // instead of failing on click.
  blockedReason?: string
}

async function getAgentOwningBot(botId: string, clientId: string): Promise<Agent | null> {
  const binding = await getAgentForResource(botId)
  if (!binding || binding.clientId !== clientId) return null

  const agents = await getAgents(clientId)
  return agents.find((candidate) => candidate.agentId === binding.agentId) ?? null
}

export async function getBotWhatsAppStatus(botId: string, clientId: string): Promise<BotWhatsAppStatus> {
  const bot = await getBotById(botId, clientId)
  if (!bot) {
    throw new Error('Bot not found')
  }

  const client = await getClientById(clientId)
  const connection = client?.metaDirectWhatsAppConnection
  if (!connection?.connected) {
    return { connectionAvailable: false, enabled: false }
  }

  const agent = await getAgentOwningBot(botId, clientId)
  if (!agent) {
    return {
      connectionAvailable: true,
      enabled: false,
      displayPhoneNumber: connection.displayPhoneNumber,
      blockedReason: 'This chatbot is not part of an Agent yet.',
    }
  }

  // Enabled means THIS bot's Agent holds the number. Another Agent holding it is
  // reported as blocked rather than off, so the client is told why the toggle
  // will not work instead of watching it fail.
  const boundHere = agent.channels.whatsapp?.resourceId === connection.phoneNumberId
  const ownerOfNumber = await getAgentForResource(connection.phoneNumberId)
  const takenByAnother = !boundHere && ownerOfNumber !== null && ownerOfNumber.agentId !== agent.agentId

  return {
    connectionAvailable: true,
    enabled: boundHere,
    displayPhoneNumber: connection.displayPhoneNumber,
    ...(takenByAnother
      ? { blockedReason: 'This WhatsApp number is already answering for another Agent.' }
      : {}),
  }
}

export async function enableWhatsAppForBot(botId: string, clientId: string): Promise<BotWhatsAppStatus> {
  const agent = await getAgentOwningBot(botId, clientId)
  if (!agent) {
    throw new Error('This chatbot is not part of an Agent yet.')
  }

  await bindWhatsAppToAgent(agent.agentId, clientId)
  return getBotWhatsAppStatus(botId, clientId)
}

export async function disableWhatsAppForBot(botId: string, clientId: string): Promise<BotWhatsAppStatus> {
  const agent = await getAgentOwningBot(botId, clientId)
  if (!agent) {
    throw new Error('This chatbot is not part of an Agent yet.')
  }

  await unbindWhatsAppFromAgent(agent.agentId, clientId)
  return getBotWhatsAppStatus(botId, clientId)
}
