import { v4 as uuidv4 } from 'uuid'
import { crawlPagesParallel, chunkWithContext, chunkFacts } from './crawler-service.js'
import { extractPageFacts, generateEmbeddingsBatch } from './openai-service.js'
import { upsertChunks } from '../repositories/vector-repository.js'
import { getPublicBotConfig, updateIndexingJob } from '../repositories/bot-repository.js'
import { generateAndPrewarmSuggestions } from './suggestion-service.js'
import type { CrawlerJobMessage } from '../lib/sqs.js'
import type { Chunk } from '../types/index.js'

interface CrawlAndChunkResult {
  chunks: Chunk[]
  pageCount: number
}

interface EnrichedChunkResult {
  chunks: Chunk[]
  factsExtracted: number
  factsSkipped: number
}

type CrawledPage = Awaited<ReturnType<typeof crawlPagesParallel>>[number]
type PageFactsResult = Awaited<ReturnType<typeof extractPageFacts>>

const FACT_EXTRACTION_BATCH_SIZE = 5

// gpt-4o-mini's rate limit is 500 RPM. 5 concurrent calls per batch leaves
// safe headroom for multiple bots indexing at once — 10 was considered but
// risks 429s under concurrent load.
async function extractFactsBatch(pages: CrawledPage[], botName: string): Promise<PageFactsResult[]> {
  const results: PageFactsResult[] = []

  for (let i = 0; i < pages.length; i += FACT_EXTRACTION_BATCH_SIZE) {
    const batch = pages.slice(i, i + FACT_EXTRACTION_BATCH_SIZE)
    const batchResults = await Promise.allSettled(
      batch.map((page) => extractPageFacts(page.content, page.title, botName))
    )
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        console.error('Fact extraction failed in batch:', result.reason)
        results.push({ facts: '', paragraphs: '' })
      }
    }
  }

  return results
}

// Facts and paragraphs are chunked and embedded separately (Option C) — facts
// give dense, high-precision hits for direct questions ("what's the price?"),
// paragraphs preserve context for open-ended ones.
async function buildEnrichedChunks(
  pages: CrawledPage[],
  botId: string,
  botName: string
): Promise<EnrichedChunkResult> {
  const t0 = Date.now()
  const allFacts = await extractFactsBatch(pages, botName)
  console.log(
    `Fact extraction complete: ${pages.length} pages in ${Date.now() - t0}ms (batch size: ${FACT_EXTRACTION_BATCH_SIZE})`
  )

  const chunks: Chunk[] = []
  let factsExtracted = 0
  let factsSkipped = 0

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    const { facts, paragraphs } = allFacts[i]

    const paragraphChunks = chunkWithContext(paragraphs || page.content, botName, page.title)
    const factChunks = chunkFacts(facts, botName, page.title)

    if (factChunks.length > 0) factsExtracted++
    else factsSkipped++

    const createdAt = new Date().toISOString()
    for (const text of [...paragraphChunks, ...factChunks]) {
      chunks.push({ chunkId: uuidv4(), botId, text, sourceUrl: page.url, createdAt })
    }
  }

  return { chunks, factsExtracted, factsSkipped }
}

async function crawlAndChunk(job: CrawlerJobMessage): Promise<CrawlAndChunkResult> {
  // useAICleaning disabled — extractPageFacts() already removes boilerplate
  // and returns clean paragraphs, so running cleanContentWithAI() first would
  // just be a second, redundant GPT-4o-mini call per page.
  const pages = await crawlPagesParallel(job.urls, false, async (crawled, total) => {
    await updateIndexingJob(job.botId, job.clientId, { crawledPages: crawled })
    console.log(`Progress: ${crawled}/${total}`)
  })

  if (pages.length === 0) {
    throw new Error('No content could be extracted')
  }

  const { chunks, factsExtracted, factsSkipped } = await buildEnrichedChunks(pages, job.botId, job.botName)
  console.log(
    `Chunks built: ${chunks.length} total (${factsExtracted} pages with facts extracted, ${factsSkipped} pages without facts)`
  )

  return { chunks, pageCount: pages.length }
}

async function prewarmSuggestionsForJob(botId: string, chunks: Chunk[]): Promise<void> {
  try {
    const bot = await getPublicBotConfig(botId)
    if (!bot) return
    await generateAndPrewarmSuggestions(botId, chunks.map((c) => c.text).join('\n\n'), bot.name)
  } catch (error) {
    console.error('Suggestion prewarm failed:', error)
  }
}

export async function processCrawlerJob(job: CrawlerJobMessage): Promise<void> {
  try {
    await updateIndexingJob(job.botId, job.clientId, {
      status: 'processing',
      startedAt: new Date().toISOString(),
    })

    console.log(`Starting crawl for bot ${job.botId}: ${job.urls.length} pages`)

    const { chunks, pageCount } = await crawlAndChunk(job)

    console.log(`Embedding ${chunks.length} chunks in batch`)
    const embeddings = await generateEmbeddingsBatch(chunks.map((c) => c.text))
    await upsertChunks(chunks, embeddings)

    await updateIndexingJob(job.botId, job.clientId, {
      status: 'complete',
      crawledPages: pageCount,
      totalChunks: chunks.length,
      completedAt: new Date().toISOString(),
    })

    console.log(`Indexing complete: ${chunks.length} chunks`)

    await prewarmSuggestionsForJob(job.botId, chunks)
  } catch (error) {
    await updateIndexingJob(job.botId, job.clientId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    })
    console.error(`Crawl job failed for bot ${job.botId}:`, error)
    throw error
  }
}
