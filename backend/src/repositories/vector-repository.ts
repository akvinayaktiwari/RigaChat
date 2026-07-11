import { v4 as uuidv4 } from 'uuid'
import { getIndex } from '../lib/pinecone.js'
import type { CacheQueryResult, Chunk, SimilarityResult, SuggestedQuestion } from '../types/index.js'

const UPSERT_BATCH_SIZE = 100
// text-embedding-3-small cosine similarity for genuinely relevant natural-language
// query/chunk pairs typically lands in the 0.2-0.5 range, not 0.7+ — a 0.7 floor
// discarded real matches (observed 0.25-0.30 scores for on-topic content) before
// the LLM ever saw them, so retrieval always came back empty.
const MIN_SIMILARITY_SCORE = 0.2
// text-embedding-3-small always returns 1536-dimension vectors.
const EMBEDDING_DIMENSION = 1536
const SUGGESTION_CACHE_NAMESPACE_SUFFIX = '-cache'
// Cache hits must be near-duplicate questions, not just loosely related ones —
// unlike KB chunk retrieval (0.2 floor), a false-positive cache hit serves a
// wrong answer outright rather than just weak context, so this floor is much
// higher. Verbatim suggested-question clicks land at ~1.0; genuine paraphrases
// of the same question typically land 0.90+. This is a judgment call, not a
// value specified anywhere else in the codebase — tune if false hits/misses show up.
const CACHE_HIT_THRESHOLD = 0.9
// Cached conversation answers older than this are never served — they stay in
// Pinecone (free tier, no delete needed) but drop out of query results once stale.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

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

export async function getRepresentativeChunks(botId: string, topK: number = 40): Promise<string[]> {
  try {
    const index = getIndex()
    // No specific query intent here — we want a broad sample of this bot's
    // knowledge base, not chunks relevant to any one topic, so a zero vector
    // is used purely to satisfy Pinecone's required `vector` field while the
    // botId metadata filter does all the real scoping.
    const response = await index.query({
      vector: new Array(EMBEDDING_DIMENSION).fill(0),
      topK,
      filter: { botId: { $eq: botId } },
      includeMetadata: true,
    })

    return (response.matches ?? [])
      .map((match) => (typeof match.metadata?.text === 'string' ? match.metadata.text : ''))
      .filter((text): text is string => text.length > 0)
  } catch (error) {
    console.error(`Failed to fetch representative chunks for bot ${botId}:`, error)
    return []
  }
}

export async function upsertSuggestedQuestionCache(
  botId: string,
  question: SuggestedQuestion,
  questionEmbedding: number[]
): Promise<boolean> {
  try {
    const index = getIndex().namespace(`${botId}${SUGGESTION_CACHE_NAMESPACE_SUFFIX}`)
    await index.upsert([
      {
        id: `suggested-${question.id}-${botId}`,
        values: questionEmbedding,
        metadata: {
          question: question.question,
          answer: question.answer,
          botId,
          createdAt: new Date().toISOString(),
          source: 'suggested',
          emoji: question.emoji,
          category: question.category,
        },
      },
    ])
    return true
  } catch (error) {
    console.error(`Failed to cache suggested question ${question.id} for bot ${botId}:`, error)
    return false
  }
}

export async function deleteSuggestedQuestionsCache(botId: string): Promise<void> {
  try {
    const index = getIndex().namespace(`${botId}${SUGGESTION_CACHE_NAMESPACE_SUFFIX}`)
    await index.deleteMany({ botId: { $eq: botId }, source: { $eq: 'suggested' } })
  } catch (error) {
    console.error(`Failed to delete suggested question cache for bot ${botId}:`, error)
  }
}

export async function queryCacheNamespace(
  botId: string,
  queryEmbedding: number[]
): Promise<CacheQueryResult> {
  try {
    const index = getIndex().namespace(`${botId}${SUGGESTION_CACHE_NAMESPACE_SUFFIX}`)
    const response = await index.query({
      vector: queryEmbedding,
      topK: 1,
      filter: {
        botId: { $eq: botId },
        createdAt: { $gte: new Date(Date.now() - CACHE_TTL_MS).toISOString() },
      },
      includeMetadata: true,
    })

    const [best] = response.matches ?? []
    const similarity = best?.score ?? 0
    const answer = typeof best?.metadata?.answer === 'string' ? best.metadata.answer : null

    if (!answer || similarity < CACHE_HIT_THRESHOLD) {
      return { hit: false }
    }

    return { hit: true, data: { answer, similarity } }
  } catch (error) {
    console.error(`Failed to query suggestion cache for bot ${botId}:`, error)
    return { hit: false }
  }
}

export async function upsertConversationCache(
  botId: string,
  question: string,
  answer: string,
  questionEmbedding: number[]
): Promise<boolean> {
  try {
    const index = getIndex().namespace(`${botId}${SUGGESTION_CACHE_NAMESPACE_SUFFIX}`)
    await index.upsert([
      {
        id: `conversation-${uuidv4()}-${botId}`,
        values: questionEmbedding,
        metadata: {
          question,
          answer,
          botId,
          createdAt: new Date().toISOString(),
          source: 'conversation',
        },
      },
    ])
    return true
  } catch (error) {
    console.error(`Failed to cache conversation answer for bot ${botId}:`, error)
    return false
  }
}
