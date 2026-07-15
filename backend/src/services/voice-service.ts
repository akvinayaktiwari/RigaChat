import {
  createVoiceAgent as createVoiceAgentRecord,
  deleteVoiceAgent as deleteVoiceAgentRecord,
  getVoiceAgentById as getVoiceAgentByIdRecord,
  getVoiceAgentsByClient,
  updateVoiceAgent as updateVoiceAgentRecord,
} from '../repositories/voice-repository.js'
import { OpenAIRealtimeProvider } from '../providers/openai-realtime-provider.js'
import { indexWebsite, retrieveContext } from './rag-service.js'
import type { CreateVoiceAgentInput, VoiceAgent, VoiceConfig } from '../types/index.js'

const SEED_QUERY = 'Tell me about this business'

export const voiceProvider = new OpenAIRealtimeProvider()

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
    Pick<VoiceAgent, 'name' | 'voice' | 'greetingMessage' | 'brandColor' | 'widgetPosition' | 'maxSessionDuration' | 'isEnabled'>
  >
): Promise<VoiceAgent> {
  await getOwnedVoiceAgent(agentId, clientId)
  return await updateVoiceAgentRecord(agentId, clientId, updates)
}

export async function deleteVoiceAgent(agentId: string, clientId: string): Promise<void> {
  await getOwnedVoiceAgent(agentId, clientId)
  await deleteVoiceAgentRecord(agentId, clientId)
}

export async function startVoiceSession(agentId: string): Promise<{ sessionId: string }> {
  const publicConfig = await getVoiceAgentPublicConfig(agentId)
  const agent = await getVoiceAgentByIdRecord(agentId)
  if (!agent) {
    throw new Error('Voice agent not found')
  }

  const contextChunks = await retrieveContext(agentId, SEED_QUERY)

  const config: VoiceConfig = {
    agentId,
    clientId: agent.clientId,
    voice: publicConfig.voice,
    greetingMessage: publicConfig.greetingMessage,
    maxSessionDuration: agent.maxSessionDuration,
    ragContext: contextChunks.join('\n\n'),
  }

  const session = await voiceProvider.connect(config)
  return { sessionId: session.sessionId }
}

export async function endVoiceSession(sessionId: string): Promise<void> {
  await voiceProvider.disconnect(sessionId)
}
