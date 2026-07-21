import { v4 as uuidv4 } from 'uuid'
import {
  createKBEntry,
  deleteKBEntry,
  getKBEntriesByBotId,
  getKBEntryById,
  updateKBEntry as updateKBEntryRepo,
} from '../repositories/kb-repository.js'
import { indexKnowledgeBaseEntry } from './rag-service.js'
import { checkEntitlement } from './entitlement-service.js'
import { generatePresignedUploadUrl } from '../lib/s3.js'
import type { KnowledgeBaseEntry } from '../types/index.js'

interface CreateKBEntryInput {
  botId: string
  clientId: string
  title: string
  content: string
}

export type KBFileType = 'pdf' | 'docx' | 'text'

const KB_FILE_CONTENT_TYPES: Record<KBFileType, string> = {
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

  return { uploadUrl, key }
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

export async function getKBEntries(botId: string): Promise<KnowledgeBaseEntry[]> {
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
  updates: Pick<KnowledgeBaseEntry, 'title' | 'content'>
): Promise<KnowledgeBaseEntry> {
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

export async function removeKBEntry(botId: string, entryId: string): Promise<void> {
  const entry = await getKBEntryById(botId, entryId)
  if (!entry) {
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
