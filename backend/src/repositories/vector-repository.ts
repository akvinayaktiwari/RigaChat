import { getIndex } from '../lib/pinecone.js'
import type { Chunk, SimilarityResult } from '../types/index.js'

const UPSERT_BATCH_SIZE = 100
// text-embedding-3-small cosine similarity for genuinely relevant natural-language
// query/chunk pairs typically lands in the 0.2-0.5 range, not 0.7+ — a 0.7 floor
// discarded real matches (observed 0.25-0.30 scores for on-topic content) before
// the LLM ever saw them, so retrieval always came back empty.
const MIN_SIMILARITY_SCORE = 0.2

interface VectorRecord {
  id: string
  values: number[]
  metadata: {
    botId: string
    chunkId: string
    text: string
    sourceUrl: string
    createdAt: string
  }
}

export async function upsertChunks(chunks: Chunk[], embeddings: number[][]): Promise<void> {
  if (chunks.length !== embeddings.length) {
    throw new Error(
      `Mismatched chunks and embeddings: received ${chunks.length} chunks but ${embeddings.length} embeddings.`
    )
  }

  const vectors: VectorRecord[] = chunks.map((chunk, i) => ({
    id: chunk.chunkId,
    values: embeddings[i],
    metadata: {
      botId: chunk.botId,
      chunkId: chunk.chunkId,
      text: chunk.text,
      sourceUrl: chunk.sourceUrl,
      createdAt: chunk.createdAt,
    },
  }))

  try {
    const index = getIndex()

    for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
      const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE)
      await index.upsert(batch)
    }
  } catch (error) {
    throw new Error(
      `Failed to upsert chunks to Pinecone: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function similaritySearch(
  botId: string,
  queryEmbedding: number[],
  topK: number = 5
): Promise<SimilarityResult[]> {
  try {
    const index = getIndex()

    const response = await index.query({
      vector: queryEmbedding,
      topK,
      filter: { botId: { $eq: botId } },
      includeMetadata: true,
    })

    return (response.matches ?? [])
      .filter((match) => (match.score ?? 0) >= MIN_SIMILARITY_SCORE)
      .map((match) => ({
        chunkId: String(match.metadata?.chunkId ?? match.id),
        text: String(match.metadata?.text ?? ''),
        sourceUrl: String(match.metadata?.sourceUrl ?? ''),
        score: match.score ?? 0,
      }))
      .sort((a, b) => b.score - a.score)
  } catch (error) {
    throw new Error(
      `Failed to run similarity search for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteChunksByBotId(botId: string): Promise<void> {
  try {
    const index = getIndex()
    await index.deleteMany({ botId: { $eq: botId } })
  } catch (error) {
    throw new Error(
      `Failed to delete chunks for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
