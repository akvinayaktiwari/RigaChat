import { upsertConversationCache } from '../repositories/vector-repository.js'

// Never throws — this always runs at the tail end of an already-returned
// response (see streamAndCache in chat-service.ts), so a cache-write failure
// must never surface as a user-facing error.
export async function saveToCache(
  botId: string,
  question: string,
  answer: string,
  questionEmbedding: number[]
): Promise<void> {
  try {
    await upsertConversationCache(botId, question, answer, questionEmbedding)
  } catch (error) {
    console.error(`Cache write failed for bot ${botId}:`, error)
  }
}
