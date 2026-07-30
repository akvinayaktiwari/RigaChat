import { v4 as uuidv4 } from 'uuid'
import {
  createAgent as createAgentRecord,
  deleteAgent as deleteAgentRecord,
  getAgentById,
  getAgentsByClientId,
} from '../repositories/agent-repository.js'
import {
  claimAgentBinding,
  getAgentForResource,
  removeAgentBinding,
} from '../repositories/agent-binding-lookup-repository.js'
import { getBotById } from '../repositories/bot-repository.js'
import { getVoiceAgentById } from '../repositories/voice-repository.js'
import type { Agent, AgentChannel, AgentChannelBinding } from '../types/index.js'

export interface CreateAgentInput {
  clientId: string
  name: string
  channels: Partial<Record<AgentChannel, AgentChannelBinding>>
}

// Only web (botId) and voice (voice agentId) bindings point at a real,
// per-agent implementation record that can be owned and uniquely claimed. A
// whatsapp binding is a marker -- its connection lives on the client, so there
// is no resourceId to validate or claim.
const CLAIMABLE_CHANNELS: AgentChannel[] = ['web', 'voice']

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
