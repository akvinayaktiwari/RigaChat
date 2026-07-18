import { v4 as uuidv4 } from 'uuid'
import {
  createVoiceAgent as createVoiceAgentRecord,
  deleteVoiceAgent as deleteVoiceAgentRecord,
  getVoiceAgentById as getVoiceAgentByIdRecord,
  getVoiceAgentsByClient,
  getVoiceCallLogsForAgent,
  updateVoiceAgent as updateVoiceAgentRecord,
  updateVoiceIndexingJob,
} from '../repositories/voice-repository.js'
import { scanWebsite } from './crawler-service.js'
import { enqueueCrawlerJob } from '../lib/sqs.js'
import type { CreateVoiceAgentInput, VoiceAgent, VoiceUsageSummary } from '../types/index.js'

async function getOwnedVoiceAgent(agentId: string, clientId: string): Promise<VoiceAgent> {
  const agent = await getVoiceAgentByIdRecord(agentId)
  if (!agent || agent.clientId !== clientId) {
    throw new Error('Voice agent not found')
  }
  return agent
}

export async function createVoiceAgent(input: CreateVoiceAgentInput): Promise<VoiceAgent> {
  const hasWebsite = !!input.websiteUrl
  return await createVoiceAgentRecord({ ...input, status: hasWebsite ? 'processing' : 'kb_only' })
}

export async function setupVoiceAgent(agentId: string, clientId: string): Promise<VoiceAgent> {
  const agent = await getOwnedVoiceAgent(agentId, clientId)

  if (!agent.websiteUrl) {
    return await updateVoiceAgentRecord(agentId, clientId, { isIndexed: true })
  }

  const scan = await scanWebsite(agent.websiteUrl)
  const jobId = uuidv4()

  await updateVoiceIndexingJob(agentId, clientId, {
    jobId,
    status: 'queued',
    websiteUrl: agent.websiteUrl,
    totalPages: scan.totalPages,
    selectedPages: scan.selectedPages.length,
    crawledPages: 0,
    totalChunks: 0,
    queuedAt: new Date().toISOString(),
  })

  await enqueueCrawlerJob({
    jobId,
    botId: agentId,
    clientId,
    urls: scan.selectedPages,
    useAICleaning: true,
    botName: agent.name,
    type: 'voice_agent',
  })

  return agent
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
): Promise<Pick<VoiceAgent, 'name' | 'voice' | 'greetingMessage' | 'systemPrompt' | 'botId'>> {
  const agent = await getVoiceAgentByIdRecord(agentId)
  if (!agent) {
    throw new Error('Voice agent not found')
  }

  return {
    name: agent.name,
    voice: agent.voice,
    greetingMessage: agent.greetingMessage,
    systemPrompt: agent.systemPrompt,
    botId: agent.botId,
  }
}

export async function deleteVoiceAgent(agentId: string, clientId: string): Promise<void> {
  await getOwnedVoiceAgent(agentId, clientId)
  await deleteVoiceAgentRecord(agentId, clientId)
}

export async function getVoiceAgentUsage(agentId: string, clientId: string): Promise<VoiceUsageSummary> {
  await getOwnedVoiceAgent(agentId, clientId)
  const logs = await getVoiceCallLogsForAgent(agentId)

  const sortedByRecent = [...logs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  return {
    totalCalls: sortedByRecent.length,
    totalMinutes: Math.round(sortedByRecent.reduce((sum, log) => sum + log.durationSeconds, 0) / 60),
    totalTokens: sortedByRecent.reduce((sum, log) => sum + log.totalTokens, 0),
    recentCalls: sortedByRecent.slice(0, 10),
  }
}
