import { v4 as uuidv4 } from 'uuid'
import {
  createVoiceAgent as createVoiceAgentRecord,
  createVoiceKBEntry,
  deleteVoiceAgent as deleteVoiceAgentRecord,
  deleteVoiceKBEntry,
  getVoiceAgentById as getVoiceAgentByIdRecord,
  getVoiceAgentsByClient,
  getVoiceCallLogsForAgent,
  getVoiceKBEntriesByAgent,
  getVoiceKBEntry,
  updateVoiceAgent as updateVoiceAgentRecord,
  updateVoiceIndexingJob,
  updateVoiceKBEntry as updateVoiceKBEntryRecord,
} from '../repositories/voice-repository.js'
import { scanWebsite } from './crawler-service.js'
import { enqueueCrawlerJob } from '../lib/sqs.js'
import { indexKnowledgeBaseEntry } from './rag-service.js'
import { deleteChunksByEntryId } from '../repositories/vector-repository.js'
import { checkEntitlement } from './entitlement-service.js'
import { deleteObject } from '../lib/s3.js'
import type { CreateVoiceAgentInput, VoiceAgent, VoiceKnowledgeBaseEntry, VoiceUsageSummary } from '../types/index.js'

async function getOwnedVoiceAgent(agentId: string, clientId: string): Promise<VoiceAgent> {
  const agent = await getVoiceAgentByIdRecord(agentId)
  if (!agent || agent.clientId !== clientId) {
    throw new Error('Voice agent not found')
  }
  return agent
}

// Ownership-check-free passthrough for the public token-issuance route,
// which has no authenticated clientId yet to check ownership against —
// discovering the owning clientId is the whole point of this call.
export async function getVoiceAgentRecord(agentId: string): Promise<VoiceAgent | null> {
  return await getVoiceAgentByIdRecord(agentId)
}

export async function createVoiceAgent(input: CreateVoiceAgentInput): Promise<VoiceAgent> {
  // Checked before any DB write — same placement as setupBot()'s
  // checkEntitlement('agents') call in bot-service.ts.
  await checkEntitlement(input.clientId, 'voice')

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

export async function addVoiceKBEntry(
  agentId: string,
  clientId: string,
  title: string,
  content: string
): Promise<VoiceKnowledgeBaseEntry> {
  await getOwnedVoiceAgent(agentId, clientId)

  const now = new Date().toISOString()
  const entry: VoiceKnowledgeBaseEntry = {
    entryId: uuidv4(),
    agentId,
    clientId,
    title,
    content,
    createdAt: now,
    updatedAt: now,
  }

  await createVoiceKBEntry(entry)
  await indexKnowledgeBaseEntry(agentId, entry.entryId, title, content)

  return entry
}

export async function getVoiceKBEntries(agentId: string, clientId: string): Promise<VoiceKnowledgeBaseEntry[]> {
  await getOwnedVoiceAgent(agentId, clientId)
  return await getVoiceKBEntriesByAgent(agentId)
}

export async function updateVoiceKBEntry(
  agentId: string,
  clientId: string,
  entryId: string,
  updates: Pick<VoiceKnowledgeBaseEntry, 'title' | 'content'>
): Promise<VoiceKnowledgeBaseEntry> {
  await getOwnedVoiceAgent(agentId, clientId)
  const updated = await updateVoiceKBEntryRecord(agentId, entryId, updates)
  await indexKnowledgeBaseEntry(agentId, entryId, updates.title, updates.content)
  return updated
}

export async function removeVoiceKBEntry(agentId: string, clientId: string, entryId: string): Promise<void> {
  await getOwnedVoiceAgent(agentId, clientId)

  const entry = await getVoiceKBEntry(agentId, entryId)
  if (!entry) {
    throw new Error('Knowledge base entry not found')
  }

  // Same zombie-row risk as kb-service.ts's removeKBEntry() -- no file
  // upload path writes indexingStatus on main yet, so this guard is
  // unreachable today and becomes live once that path lands.
  if (entry.indexingStatus === 'processing') {
    throw new Error('Knowledge base entry is still being processed')
  }

  if (entry.sourceFileKey) {
    try {
      await deleteObject(entry.sourceFileKey)
    } catch (error) {
      // Log-don't-fail, same reasoning as the bot path: an orphaned S3
      // object is a storage-cost nuisance, not a correctness problem.
      console.error(`Failed to delete S3 object ${entry.sourceFileKey} for voice KB entry ${entryId}:`, error)
    }
  }

  await deleteChunksByEntryId(agentId, entryId)
  await deleteVoiceKBEntry(agentId, entryId)
}
