import {
  createKBEntry,
  deleteKBEntry,
  getKBEntriesByBotId,
  getKBEntryById,
  updateKBEntry as updateKBEntryRepo,
} from '../repositories/kb-repository.js'
import { indexKnowledgeBaseEntry } from './rag-service.js'
import { checkEntitlement } from './entitlement-service.js'
import type { KnowledgeBaseEntry } from '../types/index.js'

interface CreateKBEntryInput {
  botId: string
  clientId: string
  title: string
  content: string
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
