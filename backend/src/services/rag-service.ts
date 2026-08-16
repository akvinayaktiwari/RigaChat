import { v4 as uuidv4 } from 'uuid'
import { extractPageFacts, generateEmbedding, generateEmbeddingsBatch } from './openai-service.js'
import { chunkFacts, chunkWithContext, crawlPagesParallel, extractSupportEmail, scanWebsite } from './crawler-service.js'
import { upsertChunks, similaritySearch, deleteChunksByNamespace } from '../repositories/vector-repository.js'
import { getPublicBotConfig } from '../repositories/bot-repository.js'
import { generateAndPrewarmSuggestions } from './suggestion-service.js'
import type { Chunk } from '../types/index.js'

// Awaited (not fire-and-forget) — Lambda can freeze the execution environment
// immediately after the HTTP response is sent, killing any unawaited promise
// before it runs. Looks up botName itself since callers here only have botId
// in scope. Never throws — bot KB indexing must succeed even if suggestion
// generation fails.
async function runSuggestionPrewarm(botId: string, kbContent: string): Promise<void> {
  try {
    const bot = await getPublicBotConfig(botId)
    if (!bot) return
    const result = await generateAndPrewarmSuggestions(botId, kbContent, bot.name)
    console.log(`Suggestions generated for bot ${botId}:`, result)
  } catch (error) {
    console.error(`Suggestion generation failed for bot ${botId}:`, error)
  }
}

export async function indexWebsite(
  namespaceId: string,
  websiteUrl: string
): Promise<{ pagesIndexed: number; chunksIndexed: number; supportEmail: string | null }> {
  try {
    const scan = await scanWebsite(websiteUrl)
    // useAICleaning disabled — extractPageFacts() below already removes
    // boilerplate and returns clean paragraphs, so cleanContentWithAI()
    // first would just be a second, redundant GPT-4o-mini call per page.
    const pages = await crawlPagesParallel(scan.selectedPages, false, (crawled, total) => {
      console.log(`Crawling: ${crawled}/${total} pages`)
    })

    const supportEmail = extractSupportEmail(pages.map((page) => page.fullPageText))

    const botConfig = await getPublicBotConfig(namespaceId)
    const botName = botConfig?.name ?? namespaceId

    const chunks: Chunk[] = []
    for (const page of pages) {
      const { facts, paragraphs } = await extractPageFacts(page.content, page.title, botName)

      const paragraphChunks = chunkWithContext(paragraphs || page.content, botName, page.title)
      const factChunks = chunkFacts(facts, botName, page.title)

      const createdAt = new Date().toISOString()
      for (const text of [...paragraphChunks, ...factChunks]) {
        chunks.push({ chunkId: uuidv4(), botId: namespaceId, text, sourceUrl: page.url, createdAt })
      }
    }

    const embeddings = await generateEmbeddingsBatch(chunks.map((chunk) => chunk.text))

    await upsertChunks(chunks, embeddings)

    await runSuggestionPrewarm(namespaceId, chunks.map((chunk) => chunk.text).join('\n\n'))

    return { pagesIndexed: pages.length, chunksIndexed: chunks.length, supportEmail }
  } catch (error) {
    throw new Error(
      `Failed to index website ${websiteUrl} for bot ${namespaceId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function indexKnowledgeBaseEntry(
  namespaceId: string,
  entryId: string,
  title: string,
  content: string
): Promise<void> {
  try {
    const combinedText = `${title}\n\n${content}`
    const botConfig = await getPublicBotConfig(namespaceId)
    const botName = botConfig?.name ?? namespaceId

    const chunks: Chunk[] = chunkWithContext(combinedText, botName, 'Knowledge Base').map((chunkString) => ({
      chunkId: uuidv4(),
      botId: namespaceId,
      text: chunkString,
      sourceUrl: `knowledge_base:${entryId}`,
      createdAt: new Date().toISOString(),
    }))

    const embeddings = await generateEmbeddingsBatch(chunks.map((chunk) => chunk.text))

    await upsertChunks(chunks, embeddings)

    await runSuggestionPrewarm(namespaceId, combinedText)
  } catch (error) {
    throw new Error(
      `Failed to index knowledge base entry ${entryId} for bot ${namespaceId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function retrieveContext(
  namespaceId: string,
  query: string,
  existingEmbedding?: number[]
): Promise<string[]> {
  try {
    const queryEmbedding = existingEmbedding ?? (await generateEmbedding(query))
    const results = await similaritySearch(namespaceId, queryEmbedding, 5)
    return results.map((result) => result.text)
  } catch (error) {
    throw new Error(
      `Failed to retrieve context for bot ${namespaceId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// -------------------------------------------------------------------------
// "Everything this Agent knows", across its bound channels.
//
// An Agent can own a web bot and a voice agent, each with its own Pinecone
// namespace. The 2026-07-29 design settled that the Agent's shared brain is the
// UNION of its bindings, aggregated at query time, so no vectors move and rule 5
// (every query scoped by a namespace id) stays intact.
//
// voice-routes.ts implemented that inline first. This is the same behaviour
// extracted so the WhatsApp turn handler cannot drift from it: without one
// definition, a client who put pricing in their voice agent's KB would get
// correct answers on a call and "I don't have that information" on WhatsApp,
// from what the dashboard calls one Agent.
//
// The embedding is generated ONCE and reused across namespaces. Generating it
// per namespace would double the OpenAI cost of every two-binding turn for an
// identical vector.
//
// KNOWN WEAK RANKING, tracked in TODOS.md: concatenate then take the first
// `limit`. That ignores score ordering across namespaces, so a strong voice-KB
// chunk can lose to a weak web-KB one purely because web is queried first. It is
// what voice already does, and unifying on it is better than inventing a second
// ranking; replacing it wants the eval suite in place to measure against.
// -------------------------------------------------------------------------
export async function retrieveAgentContext(
  namespaceIds: string[],
  query: string,
  limit = 5
): Promise<string[]> {
  const unique = [...new Set(namespaceIds.filter((id) => id.length > 0))]
  if (unique.length === 0) return []

  const queryEmbedding = await generateEmbedding(query)

  const perNamespace = await Promise.all(
    unique.map(async (namespaceId) => {
      try {
        return await retrieveContext(namespaceId, query, queryEmbedding)
      } catch (error) {
        // One namespace failing must not silence the Agent entirely. A partial
        // answer from the bindings that did respond beats no answer, and the
        // miss is logged rather than swallowed, because a namespace that is
        // always failing looks exactly like a sparse knowledge base.
        console.error(
          `[rag] namespace ${namespaceId} failed during agent retrieval:`,
          error instanceof Error ? error.message : error
        )
        return []
      }
    })
  )

  return perNamespace.flat().slice(0, limit)
}

export async function reindexNamespace(
  namespaceId: string,
  websiteUrl: string
): Promise<{ pagesIndexed: number; chunksIndexed: number; supportEmail: string | null }> {
  try {
    await deleteChunksByNamespace(namespaceId)
    return await indexWebsite(namespaceId, websiteUrl)
  } catch (error) {
    throw new Error(
      `Failed to reindex bot ${namespaceId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
