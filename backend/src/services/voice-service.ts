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
import { generatePresignedUploadUrl, deleteObject } from '../lib/s3.js'
import { deriveTitleFromFilename, KB_FILE_CONTENT_TYPES } from './kb-service.js'
import type { KBFileType, KBUploadUrlResult } from './kb-service.js'
import {
  claimPhoneNumber,
  getPhoneNumberForAgent,
  normalisePhoneNumber,
  releasePhoneNumber,
  VoicePhoneConflictError,
} from '../repositories/voice-phone-lookup-repository.js'
import type {
  CreateVoiceAgentInput,
  VoiceAgent,
  VoiceKnowledgeBaseEntry,
  VoicePhoneLookup,
  VoiceUsageSummary,
} from '../types/index.js'

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

interface GetVoiceKBUploadUrlInput {
  agentId: string
  clientId: string
  filename: string
  fileType: KBFileType
  fileSizeBytes: number
}

// Presigned PUT URL only -- no DynamoDB write happens here, mirrors
// kb-service.ts's getKBUploadUrl(). Confirm-upload (the DB row + indexing
// enqueue, against voice_kb) is a separate module, once the file actually
// lands in S3.
export async function getVoiceKBUploadUrl(input: GetVoiceKBUploadUrlInput): Promise<KBUploadUrlResult> {
  await getOwnedVoiceAgent(input.agentId, input.clientId)
  await checkEntitlement(input.clientId, 'kbFileSize', input.fileSizeBytes)

  // Key prefix carries an explicit 'voice-agents' segment so it can't be
  // mistaken for a bot KB file key ({clientId}/{botId}/{entryId}/{filename})
  // even though both live in the same S3_BUCKET_KB_FILES bucket.
  const entryId = uuidv4()
  const key = `${input.clientId}/voice-agents/${input.agentId}/${entryId}/${input.filename}`

  const uploadUrl = await generatePresignedUploadUrl(key, KB_FILE_CONTENT_TYPES[input.fileType])

  return { uploadUrl, key, entryId }
}

interface ConfirmVoiceKBUploadInput {
  agentId: string
  clientId: string
  entryId: string
  filename: string
  fileType: KBFileType
  fileSizeBytes: number
  s3Key: string
}

// Only creates the DynamoDB row and enqueues the indexing job -- no
// extraction happens here. See crawler-worker-service.ts's
// processVoiceKBFileJob() (stub) for the consumer side. createVoiceKBEntry()
// is reused as-is: unlike the bot table's createKBEntry(), it never mints
// its own entryId, so it already accepts the fully-formed entry built below.
export async function confirmVoiceKBUpload(input: ConfirmVoiceKBUploadInput): Promise<VoiceKnowledgeBaseEntry> {
  await getOwnedVoiceAgent(input.agentId, input.clientId)

  const expectedKey = `${input.clientId}/voice-agents/${input.agentId}/${input.entryId}/${input.filename}`
  if (input.s3Key !== expectedKey) {
    throw new Error('s3Key does not match expected upload location')
  }

  const jobId = uuidv4()
  const now = new Date().toISOString()

  const entry: VoiceKnowledgeBaseEntry = {
    entryId: input.entryId,
    agentId: input.agentId,
    clientId: input.clientId,
    title: deriveTitleFromFilename(input.filename),
    content: '',
    createdAt: now,
    updatedAt: now,
    sourceFileKey: input.s3Key,
    fileType: input.fileType,
    fileSizeBytes: input.fileSizeBytes,
    indexingStatus: 'queued',
    indexingJobId: jobId,
  }

  await createVoiceKBEntry(entry)

  // If this throws, the entry is left stuck at 'queued' -- the same
  // pre-existing gap already documented for the bot KB file pipeline (no
  // reaper exists for a DB row written just before its SQS enqueue fails).
  // Not new here, not fixed here.
  await enqueueCrawlerJob({
    jobId,
    type: 'voice_kb_file',
    agentId: input.agentId,
    clientId: input.clientId,
    entryId: input.entryId,
    s3Key: input.s3Key,
    fileType: input.fileType,
  })

  return entry
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

// -------------------------------------------------------------------------
// Phone number assignment
//
// The repository's claim/release take an agentId and trust it: they are the
// atomic-write layer, and the inbound-call path that also uses this table has
// no authenticated client to check against. Ownership is therefore enforced
// here, on every one of these, via the same getOwnedVoiceAgent every other
// authenticated voice operation goes through. Without it a client could claim a
// number onto someone else's agent and receive their calls.
//
// Every phoneNumber below is OUR Plivo DID, never the client's own advertised
// number -- see VoicePhoneLookup for why storing the latter produces a row no
// call can ever match.
// -------------------------------------------------------------------------

export class InvalidPhoneNumberError extends Error {
  constructor(phoneNumber: string) {
    super(`"${phoneNumber}" is not a valid phone number. Use E.164 form, e.g. +919876543210.`)
    this.name = 'InvalidPhoneNumberError'
  }
}

export class PhoneNumberInUseError extends Error {
  constructor(phoneNumber: string) {
    super(`Phone number ${phoneNumber} is already assigned to a different voice agent`)
    this.name = 'PhoneNumberInUseError'
  }
}

export class AgentAlreadyHasNumberError extends Error {
  readonly currentNumber: string

  constructor(currentNumber: string) {
    super(`This voice agent already answers on ${currentNumber}`)
    this.name = 'AgentAlreadyHasNumberError'
    this.currentNumber = currentNumber
  }
}

export async function getVoiceAgentPhoneNumber(
  agentId: string,
  clientId: string
): Promise<VoicePhoneLookup | null> {
  await getOwnedVoiceAgent(agentId, clientId)
  return await getPhoneNumberForAgent(agentId)
}

export async function assignVoiceAgentPhoneNumber(
  agentId: string,
  clientId: string,
  phoneNumber: string
): Promise<VoicePhoneLookup> {
  await getOwnedVoiceAgent(agentId, clientId)

  // Normalised here so every comparison below is against the same spelling the
  // table is keyed by, and so a malformed number is a 400 rather than a 500 out
  // of the repository.
  let normalised: string
  try {
    normalised = normalisePhoneNumber(phoneNumber)
  } catch {
    throw new InvalidPhoneNumberError(phoneNumber)
  }

  // Refused rather than swapped. Moving an agent to a new DID means releasing
  // the old row and claiming a new one, which is two writes with no transaction
  // around them -- a half-completed swap leaves the agent answering on neither
  // number, and the symptom is silence on a line the client still pays for.
  // Making the release an explicit, separate action keeps that state
  // unreachable and makes a routing change something the client chose.
  //
  // A courtesy check, not a lock: it reads the eventually-consistent index, so
  // two assignments racing on the SAME agent can both pass and leave it with
  // two numbers. Both still ring that agent -- the per-number claim below is
  // what has to be atomic, and is.
  const existing = await getPhoneNumberForAgent(agentId)
  if (existing && existing.phoneNumber !== normalised) {
    throw new AgentAlreadyHasNumberError(existing.phoneNumber)
  }

  try {
    return await claimPhoneNumber(normalised, agentId, clientId)
  } catch (error) {
    // The claim is atomic, so this is the losing side of a genuine race or a
    // number another client already holds. Either way it is a conflict, not a
    // server fault, and the caller must be told which.
    if (error instanceof VoicePhoneConflictError) {
      throw new PhoneNumberInUseError(normalised)
    }
    throw error
  }
}

// Released by agent rather than by number: the number to release is a fact the
// server already holds, and taking it from the caller would let a malformed
// request delete a row belonging to an agent they do own but did not mean to
// touch.
export async function releaseVoiceAgentPhoneNumber(agentId: string, clientId: string): Promise<void> {
  await getOwnedVoiceAgent(agentId, clientId)

  const existing = await getPhoneNumberForAgent(agentId)
  if (!existing) return

  await releasePhoneNumber(existing.phoneNumber)
}
