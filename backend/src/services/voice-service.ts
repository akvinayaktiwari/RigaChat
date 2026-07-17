import {
  createVoiceAgent as createVoiceAgentRecord,
  deleteVoiceAgent as deleteVoiceAgentRecord,
  getVoiceAgentById as getVoiceAgentByIdRecord,
  getVoiceAgentsByClient,
  updateVoiceAgent as updateVoiceAgentRecord,
} from '../repositories/voice-repository.js'
import { indexWebsite } from './rag-service.js'
import type { CreateVoiceAgentInput, VoiceAgent } from '../types/index.js'

async function getOwnedVoiceAgent(agentId: string, clientId: string): Promise<VoiceAgent> {
  const agent = await getVoiceAgentByIdRecord(agentId)
  if (!agent || agent.clientId !== clientId) {
    throw new Error('Voice agent not found')
  }
  return agent
}

export async function createVoiceAgent(input: CreateVoiceAgentInput): Promise<VoiceAgent> {
  return await createVoiceAgentRecord(input)
}

export async function setupVoiceAgent(agentId: string, clientId: string): Promise<VoiceAgent> {
  const agent = await getOwnedVoiceAgent(agentId, clientId)
  await indexWebsite(agentId, agent.websiteUrl)
  return await updateVoiceAgentRecord(agentId, clientId, { isIndexed: true })
}

export async function getVoiceAgents(clientId: string): Promise<VoiceAgent[]> {
  return await getVoiceAgentsByClient(clientId)
}

export async function getVoiceAgentById(agentId: string, clientId: string): Promise<VoiceAgent> {
  const agent = await getVoiceAgentByIdRecord(agentId)
  if (!agent || agent.clientId !== clientId) {
    throw new Error('Voice agent not found')
  }
  return agent
}

export async function getVoiceAgentPublicConfig(
  agentId: string
): Promise<Pick<VoiceAgent, 'agentId' | 'name' | 'voice' | 'greetingMessage' | 'brandColor' | 'widgetPosition' | 'isEnabled'>> {
  const agent = await getVoiceAgentByIdRecord(agentId)
  if (!agent) {
    throw new Error('Voice agent not found')
  }
  if (!agent.isEnabled) {
    throw new Error('Voice agent is not enabled')
  }

  return {
    agentId: agent.agentId,
    name: agent.name,
    voice: agent.voice,
    greetingMessage: agent.greetingMessage,
    brandColor: agent.brandColor,
    widgetPosition: agent.widgetPosition,
    isEnabled: agent.isEnabled,
  }
}

export async function updateVoiceAgent(
  agentId: string,
  clientId: string,
  updates: Partial<
    Pick<
      VoiceAgent,
      'name' | 'voice' | 'greetingMessage' | 'systemPrompt' | 'brandColor' | 'widgetPosition' | 'maxSessionDuration' | 'isEnabled'
    >
  >
): Promise<VoiceAgent> {
  await getOwnedVoiceAgent(agentId, clientId)
  return await updateVoiceAgentRecord(agentId, clientId, updates)
}

export async function getVoiceAgentContext(
  agentId: string
): Promise<Pick<VoiceAgent, 'name' | 'voice' | 'greetingMessage' | 'systemPrompt'>> {
  const agent = await getVoiceAgentByIdRecord(agentId)
  if (!agent) {
    throw new Error('Voice agent not found')
  }

  return {
    name: agent.name,
    voice: agent.voice,
    greetingMessage: agent.greetingMessage,
    systemPrompt: agent.systemPrompt,
  }
}

export async function deleteVoiceAgent(agentId: string, clientId: string): Promise<void> {
  await getOwnedVoiceAgent(agentId, clientId)
  await deleteVoiceAgentRecord(agentId, clientId)
}
