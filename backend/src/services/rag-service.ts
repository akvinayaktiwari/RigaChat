import { v4 as uuidv4 } from 'uuid'
import { extractPageFacts, generateEmbedding, generateEmbeddingsBatch } from './openai-service.js'
import { chunkFacts, chunkWithContext, crawlPagesParallel, extractSupportEmail, scanWebsite } from './crawler-service.js'
import { upsertChunks, similaritySearch, deleteChunksByBotId } from '../repositories/vector-repository.js'
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
  botId: string,
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

    const supportEmail = extractSupportEmail(pages.map((page) => page.content))

    const botConfig = await getPublicBotConfig(botId)
    const botName = botConfig?.name ?? botId

    const chunks: Chunk[] = []
    for (const page of pages) {
      const { facts, paragraphs } = await extractPageFacts(page.content, page.title, botName)

      const paragraphChunks = chunkWithContext(paragraphs || page.content, botName, page.title)
      const factChunks = chunkFacts(facts, botName, page.title)

      const createdAt = new Date().toISOString()
      for (const text of [...paragraphChunks, ...factChunks]) {
        chunks.push({ chunkId: uuidv4(), botId, text, sourceUrl: page.url, createdAt })
      }
    }

    const embeddings = await generateEmbeddingsBatch(chunks.map((chunk) => chunk.text))

    await upsertChunks(chunks, embeddings)

    await runSuggestionPrewarm(botId, chunks.map((chunk) => chunk.text).join('\n\n'))

    return { pagesIndexed: pages.length, chunksIndexed: chunks.length, supportEmail }
  } catch (error) {
    throw new Error(
      `Failed to index website ${websiteUrl} for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function indexKnowledgeBaseEntry(
  botId: string,
  entryId: string,
  title: string,
  content: string
): Promise<void> {
  try {
    const combinedText = `${title}\n\n${content}`
    const botConfig = await getPublicBotConfig(botId)
    const botName = botConfig?.name ?? botId

    const chunks: Chunk[] = chunkWithContext(combinedText, botName, 'Knowledge Base').map((chunkString) => ({
      chunkId: uuidv4(),
      botId,
      text: chunkString,
      sourceUrl: `knowledge_base:${entryId}`,
      createdAt: new Date().toISOString(),
    }))

    const embeddings = await generateEmbeddingsBatch(chunks.map((chunk) => chunk.text))

    await upsertChunks(chunks, embeddings)

    await runSuggestionPrewarm(botId, combinedText)
  } catch (error) {
    throw new Error(
      `Failed to index knowledge base entry ${entryId} for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function retrieveContext(
  botId: string,
  query: string,
  existingEmbedding?: number[]
): Promise<string[]> {
  try {
    const queryEmbedding = existingEmbedding ?? (await generateEmbedding(query))
    const results = await similaritySearch(botId, queryEmbedding, 5)
    return results.map((result) => result.text)
  } catch (error) {
    throw new Error(
      `Failed to retrieve context for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function reindexBot(
  botId: string,
  websiteUrl: string
): Promise<{ pagesIndexed: number; chunksIndexed: number; supportEmail: string | null }> {
  try {
    await deleteChunksByBotId(botId)
    return await indexWebsite(botId, websiteUrl)
  } catch (error) {
    throw new Error(
      `Failed to reindex bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
