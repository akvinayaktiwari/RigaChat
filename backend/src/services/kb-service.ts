import { v4 as uuidv4 } from 'uuid'
import {
  createKBEntry,
  createKBFileEntry,
  deleteKBEntry,
  getKBEntriesByBotId,
  getKBEntryById,
  updateKBEntry as updateKBEntryRepo,
} from '../repositories/kb-repository.js'
import { indexKnowledgeBaseEntry } from './rag-service.js'
import { checkEntitlement } from './entitlement-service.js'
import { getBotConfig } from './bot-service.js'
import { generatePresignedUploadUrl } from '../lib/s3.js'
import { enqueueCrawlerJob } from '../lib/sqs.js'
import type { KnowledgeBaseEntry } from '../types/index.js'

interface CreateKBEntryInput {
  botId: string
  clientId: string
  title: string
  content: string
}

export type KBFileType = 'pdf' | 'docx' | 'text'

export const KB_FILE_CONTENT_TYPES: Record<KBFileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  text: 'text/plain',
}

interface GetKBUploadUrlInput {
  botId: string
  clientId: string
  filename: string
  fileType: KBFileType
  fileSizeBytes: number
}

export interface KBUploadUrlResult {
  uploadUrl: string
  key: string
  // Exposed explicitly so callers (confirm-upload) don't have to parse it
  // back out of `key` -- same value, already minted below, just returned
  // directly instead of only being embedded in the key string.
  entryId: string
}

// Only generates a presigned PUT URL -- no DynamoDB write happens here.
// Indexing the uploaded file into a KnowledgeBaseEntry is a separate module,
// once the file actually lands in S3.
export async function getKBUploadUrl(input: GetKBUploadUrlInput): Promise<KBUploadUrlResult> {
  await checkEntitlement(input.clientId, 'kbFileSize', input.fileSizeBytes)

  // No KB entry exists yet, so there's no real entryId to key by. Minting
  // one now lets the S3 key follow the requested {clientId}/{botId}/{kbEntryId}/{filename}
  // structure and lets it double as the entryId the future indexing module
  // should reuse (rather than that module minting its own via
  // createKBEntry()'s internal uuidv4(), which would desync the S3 key from
  // the eventual DynamoDB row). Flagged: this wasn't spelled out in the spec.
  const kbEntryId = uuidv4()
  const key = `${input.clientId}/${input.botId}/${kbEntryId}/${input.filename}`

  const uploadUrl = await generatePresignedUploadUrl(key, KB_FILE_CONTENT_TYPES[input.fileType])

  return { uploadUrl, key, entryId: kbEntryId }
}

interface ConfirmKBUploadInput {
  botId: string
  clientId: string
  entryId: string
  filename: string
  fileType: KBFileType
  fileSizeBytes: number
  s3Key: string
}

// "nicer derivation" was offered as optional in the spec, not required --
// going with the simplest, most predictable rule (strip the extension) since
// anything fancier (hyphen/underscore-to-space, title-casing) risks mangling
// filenames it can't safely guess the intent of.
export function deriveTitleFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot > 0 ? filename.slice(0, lastDot) : filename
}

// Only creates the DynamoDB row and enqueues the indexing job -- no
// extraction happens here. See crawler-worker-service.ts's processKBFileJob()
// for the (stubbed) consumer side.
export async function confirmKBUpload(input: ConfirmKBUploadInput): Promise<KnowledgeBaseEntry> {
  const expectedKey = `${input.clientId}/${input.botId}/${input.entryId}/${input.filename}`
  if (input.s3Key !== expectedKey) {
    throw new Error('s3Key does not match expected upload location')
  }

  const jobId = uuidv4()

  const entry = await createKBFileEntry({
    entryId: input.entryId,
    botId: input.botId,
    clientId: input.clientId,
    title: deriveTitleFromFilename(input.filename),
    content: '',
    sourceFileKey: input.s3Key,
    fileType: input.fileType,
    fileSizeBytes: input.fileSizeBytes,
    indexingStatus: 'queued',
    indexingJobId: jobId,
  })

  // If this throws, the entry is left stuck at 'queued' -- the same
  // pre-existing gap already documented for the bot/voice-agent pipeline (no
  // reaper exists for a DB row written just before its SQS enqueue fails).
  // Not new here, not fixed here.
  await enqueueCrawlerJob({
    jobId,
    botId: input.botId,
    clientId: input.clientId,
    type: 'kb_file',
    entryId: input.entryId,
    s3Key: input.s3Key,
    fileType: input.fileType,
  })

  return entry
}

export async function addKBEntry(input: CreateKBEntryInput): Promise<KnowledgeBaseEntry> {
  // Called before the try block below on purpose — that block rewraps every
  // error into a generic Error, which would strip EntitlementError's type
  // and prevent the route from producing the correct 402/403 response.
  await checkEntitlement(input.clientId, 'chat')

  try {
    const entry = await createKBEntry({
      botId: input.botId,
      clientId: input.clientId,
      title: input.title,
      content: input.content,
    })

    await indexKnowledgeBaseEntry(input.botId, entry.entryId, entry.title, entry.content)

    return entry
  } catch (error) {
    throw new Error(
      `Failed to add knowledge base entry for bot ${input.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// getBotConfig() throws 'Bot not found' both when the bot genuinely doesn't
// exist and when it exists but belongs to a different clientId (the bots
// table's {clientId, botId} key means a mismatched clientId can't find the
// row at all) -- same 404, no distinction revealed either way.
export async function getKBEntries(botId: string, clientId: string): Promise<KnowledgeBaseEntry[]> {
  await getBotConfig(botId, clientId)

  try {
    return await getKBEntriesByBotId(botId)
  } catch (error) {
    throw new Error(
      `Failed to get knowledge base entries for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateKBEntry(
  botId: string,
  entryId: string,
  clientId: string,
  updates: Pick<KnowledgeBaseEntry, 'title' | 'content'>
): Promise<KnowledgeBaseEntry> {
  // 404 either way (missing vs. owned by someone else) -- don't reveal
  // existence to a non-owner. Mirrors voice-service.ts's getOwnedVoiceAgent().
  const existing = await getKBEntryById(botId, entryId)
  if (!existing || existing.clientId !== clientId) {
    throw new Error('KB entry not found')
  }

  try {
    const entry = await updateKBEntryRepo(botId, entryId, updates)
    await indexKnowledgeBaseEntry(botId, entryId, entry.title, entry.content)
    return entry
  } catch (error) {
    throw new Error(
      `Failed to update knowledge base entry ${entryId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeKBEntry(botId: string, entryId: string, clientId: string): Promise<void> {
  const entry = await getKBEntryById(botId, entryId)
  if (!entry || entry.clientId !== clientId) {
    throw new Error('KB entry not found')
  }

  try {
    await deleteKBEntry(botId, entryId)
  } catch (error) {
    throw new Error(
      `Failed to remove knowledge base entry ${entryId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
