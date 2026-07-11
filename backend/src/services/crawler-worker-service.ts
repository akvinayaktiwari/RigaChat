import { v4 as uuidv4 } from 'uuid'
import { crawlPagesParallel, chunkTextSemantic } from './crawler-service.js'
import { generateEmbeddingsBatch } from './openai-service.js'
import { upsertChunks } from '../repositories/vector-repository.js'
import { getPublicBotConfig, updateIndexingJob } from '../repositories/bot-repository.js'
import { generateAndPrewarmSuggestions } from './suggestion-service.js'
import type { CrawlerJobMessage } from '../lib/sqs.js'
import type { Chunk } from '../types/index.js'

interface CrawlAndChunkResult {
  chunks: Chunk[]
  pageCount: number
}

async function crawlAndChunk(job: CrawlerJobMessage): Promise<CrawlAndChunkResult> {
  const pages = await crawlPagesParallel(job.urls, job.useAICleaning, async (crawled, total) => {
    await updateIndexingJob(job.botId, job.clientId, { crawledPages: crawled })
    console.log(`Progress: ${crawled}/${total}`)
  })

  if (pages.length === 0) {
    throw new Error('No content could be extracted')
  }

  const chunks: Chunk[] = []
  for (const page of pages) {
    for (const chunkString of chunkTextSemantic(page.content)) {
      chunks.push({
        chunkId: uuidv4(),
        botId: job.botId,
        text: chunkString,
        sourceUrl: page.url,
        createdAt: new Date().toISOString(),
      })
    }
  }
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
