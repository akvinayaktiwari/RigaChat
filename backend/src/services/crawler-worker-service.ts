import { v4 as uuidv4 } from 'uuid'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import { crawlPagesParallel, chunkWithContext, chunkFacts, extractSupportEmail } from './crawler-service.js'
import { extractPageFacts, generateEmbeddingsBatch } from './openai-service.js'
import { indexKnowledgeBaseEntry } from './rag-service.js'
import { upsertChunks } from '../repositories/vector-repository.js'
import {
  claimCrawlerJob,
  getPublicBotConfig,
  updateBot,
  updateBotCrawlStatus,
  updateIndexingJob,
} from '../repositories/bot-repository.js'
import {
  claimVoiceCrawlerJob,
  getVoiceAgentById,
  updateVoiceAgent,
  updateVoiceIndexingJob,
} from '../repositories/voice-repository.js'
import { claimKBFileIndexingJob, getKBEntryById, updateKBIndexingStatus } from '../repositories/kb-repository.js'
import { getObjectAsBuffer } from '../lib/s3.js'
import { generateAndPrewarmSuggestions } from './suggestion-service.js'
import type { CrawlerJobMessage, KBFileCrawlerJobMessage, WebsiteCrawlerJobMessage } from '../lib/sqs.js'
import type { KBFileType } from './kb-service.js'
import type { Chunk, IndexingJob } from '../types/index.js'

interface CrawlAndChunkResult {
  chunks: Chunk[]
  pageCount: number
  supportEmail: string | null
}

interface EnrichedChunkResult {
  chunks: Chunk[]
  factsExtracted: number
  factsSkipped: number
}

type CrawledPage = Awaited<ReturnType<typeof crawlPagesParallel>>[number]
type PageFactsResult = Awaited<ReturnType<typeof extractPageFacts>>

const FACT_EXTRACTION_BATCH_SIZE = 5

// Dispatches indexing-job progress writes to whichever table the job
// actually belongs to — bots and voice agents each track indexingJob
// progress on their own table, with no shared repository for it.
async function updateJobProgress(
  botId: string,
  clientId: string,
  jobType: CrawlerJobMessage['type'],
  updates: Partial<IndexingJob>
): Promise<void> {
  if (jobType === 'voice_agent') {
    await updateVoiceIndexingJob(botId, clientId, updates)
  } else {
    await updateIndexingJob(botId, clientId, updates)
  }
}

// gpt-4o-mini's rate limit is 500 RPM. 5 concurrent calls per batch leaves
// safe headroom for multiple bots indexing at once — 10 was considered but
// risks 429s under concurrent load.
//
// Progress reporting: crawledPages already sits at pages.length (the crawl
// phase's ceiling) when this runs. selectedPages gets doubled by the caller
// before this starts, so crawledPages can keep climbing from N to 2N here
// instead of resetting backward — the frontend's crawledPages/selectedPages
// bar then moves forward through both phases instead of freezing (or worse,
// visibly rewinding) during fact extraction.
async function extractFactsBatch(
  pages: CrawledPage[],
  botName: string,
  botId: string,
  clientId: string,
  jobType: CrawlerJobMessage['type']
): Promise<PageFactsResult[]> {
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
    await updateJobProgress(botId, clientId, jobType, {
      crawledPages: pages.length + results.length,
      updatedAt: new Date().toISOString(),
    })
  }

  return results
}

// Facts and paragraphs are chunked and embedded separately (Option C) — facts
// give dense, high-precision hits for direct questions ("what's the price?"),
// paragraphs preserve context for open-ended ones.
async function buildEnrichedChunks(
  pages: CrawledPage[],
  botId: string,
  clientId: string,
  botName: string,
  jobType: CrawlerJobMessage['type']
): Promise<EnrichedChunkResult> {
  const t0 = Date.now()
  const allFacts = await extractFactsBatch(pages, botName, botId, clientId, jobType)
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

async function crawlAndChunk(job: WebsiteCrawlerJobMessage): Promise<CrawlAndChunkResult> {
  // useAICleaning disabled — extractPageFacts() already removes boilerplate
  // and returns clean paragraphs, so running cleanContentWithAI() first would
  // just be a second, redundant GPT-4o-mini call per page.
  const pages = await crawlPagesParallel(job.urls, false, async (crawled, total) => {
    await updateJobProgress(job.botId, job.clientId, job.type, {
      crawledPages: crawled,
      updatedAt: new Date().toISOString(),
    })
    console.log(`Progress: ${crawled}/${total}`)
  })

  if (pages.length === 0) {
    throw new Error('No content could be extracted')
  }

  // Double the denominator so the progress bar has room to keep climbing
  // through fact extraction instead of freezing (or rewinding) at the crawl
  // phase's ceiling. Restored to the true page count once the job completes.
  await updateJobProgress(job.botId, job.clientId, job.type, {
    selectedPages: pages.length * 2,
    updatedAt: new Date().toISOString(),
  })

  const { chunks, factsExtracted, factsSkipped } = await buildEnrichedChunks(
    pages,
    job.botId,
    job.clientId,
    job.botName,
    job.type
  )
  console.log(
    `Chunks built: ${chunks.length} total (${factsExtracted} pages with facts extracted, ${factsSkipped} pages without facts)`
  )

  const supportEmail = extractSupportEmail(pages.map((page) => page.fullPageText))

  return { chunks, pageCount: pages.length, supportEmail }
}

const NETWORK_ERROR_PATTERNS = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'fetch failed']

function mapCrawlErrorMessage(message: string): string {
  if (message === 'No content could be extracted') {
    return "We couldn't read your website automatically. It may be built with React or another JavaScript framework that requires a browser to render."
  }
  if (NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
    return "We couldn't reach your website. Please check the URL and try again."
  }
  return 'Something went wrong while reading your website. Please try again or add your content via Knowledge Base.'
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

const MIN_EXTRACTED_TEXT_LENGTH = 50
// DynamoDB items cap at 400KB total; Agency-tier source files can be up to
// 100MB, so full extracted text can't safely live in this field. Only a
// preview is stored here -- the full text is chunked and embedded into
// Pinecone via indexKnowledgeBaseEntry() below and never reconstituted as
// one attribute.
const CONTENT_PREVIEW_MAX_LENGTH = 2000

async function extractText(buffer: Buffer, fileType: KBFileType): Promise<string> {
  if (fileType === 'pdf') {
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return result.text
    } finally {
      await parser.destroy()
    }
  }
  if (fileType === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  return buffer.toString('utf-8')
}

// Replaces the earlier 'failed' stub that only proved the route -> DynamoDB
// -> SQS -> worker -> status plumbing. This is the real extraction ->
// chunk -> embed -> upsert pipeline.
async function processKBFileJob(job: KBFileCrawlerJobMessage): Promise<void> {
  // The claim's own conditional UpdateCommand already performs the
  // 'queued' -> 'processing' transition atomically -- mirrors
  // claimCrawlerJob/claimVoiceCrawlerJob's precedent, which never re-writes
  // status again right after a successful claim either.
  const claimed = await claimKBFileIndexingJob(job.botId, job.entryId, job.jobId)
  if (!claimed) {
    console.log(`KB file job ${job.jobId} already claimed by another invocation — skipping duplicate`)
    return
  }

  console.log(
    `Received KB file job for entry ${job.entryId} (bot ${job.botId}): fileType=${job.fileType}, key=${job.s3Key} — status now 'processing'`
  )

  try {
    const entry = await getKBEntryById(job.botId, job.entryId)
    if (!entry) {
      throw new Error(`KB entry ${job.entryId} no longer exists`)
    }

    let buffer: Buffer
    try {
      buffer = await getObjectAsBuffer(job.s3Key)
    } catch (error) {
      throw new Error(`fetch stage failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    let extractedText: string
    try {
      extractedText = await extractText(buffer, job.fileType)
    } catch (error) {
      throw new Error(`extract stage failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    const trimmed = extractedText.trim()
    if (trimmed.length < MIN_EXTRACTED_TEXT_LENGTH) {
      // Graceful failure path for scanned/image-only PDFs -- deliberately
      // not OCR'd in this version. Not an exception (nothing actually
      // failed), so this returns directly rather than falling into the
      // catch block below.
      await updateKBIndexingStatus(job.botId, job.entryId, {
        indexingStatus: 'failed',
        indexingError: 'No readable text found in file — scanned/image-only PDFs are not supported in this version.',
      })
      return
    }

    try {
      // Reuses the exact same chunk (chunkWithContext) -> embed
      // (generateEmbeddingsBatch) -> upsert (upsertChunks) sequence text KB
      // entries already use -- including the 'knowledge_base:{entryId}'
      // sourceUrl convention deleteChunksByEntryId() already depends on.
      await indexKnowledgeBaseEntry(job.botId, job.entryId, entry.title, trimmed)
    } catch (error) {
      throw new Error(`embed/upsert stage failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    await updateKBIndexingStatus(job.botId, job.entryId, {
      indexingStatus: 'complete',
      content: trimmed.slice(0, CONTENT_PREVIEW_MAX_LENGTH),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`KB file extraction failed for entry ${job.entryId} (bot ${job.botId}):`, error)
    await updateKBIndexingStatus(job.botId, job.entryId, {
      indexingStatus: 'failed',
      indexingError: message,
    })
  }
}

export async function processCrawlerJob(job: CrawlerJobMessage): Promise<void> {
  if (job.type === 'kb_file') {
    await processKBFileJob(job)
    return
  }

  const isVoiceAgent = job.type === 'voice_agent'

  // Idempotency check — only one Lambda processes this job. SQS's at-least-once
  // delivery can invoke this twice for the same message; this atomic conditional
  // write ensures only the first invocation transitions 'queued' -> 'processing'.
  const claimed = isVoiceAgent
    ? await claimVoiceCrawlerJob(job.botId, job.clientId, job.jobId)
    : await claimCrawlerJob(job.botId, job.clientId, job.jobId)
  if (!claimed) {
    console.log(`Job ${job.jobId} already claimed by another invocation — skipping duplicate`)

    if (isVoiceAgent) {
      // A genuine concurrent duplicate (the case this claim guards against) means
      // some other invocation is processing this exact jobId and will complete it
      // normally — safe to stay quiet. But if the stored jobId no longer matches
      // this job at all, this job was superseded and dropped with no guarantee a
      // successor is in flight — that's a silent permanent loss, so it's worth
      // surfacing at a level monitoring is more likely to catch.
      const current = await getVoiceAgentById(job.botId)
      if (current?.indexingJob?.jobId !== job.jobId) {
        console.warn(
          `Voice agent ${job.botId}'s job ${job.jobId} was superseded by a different job (current: ${current?.indexingJob?.jobId ?? 'none'}) before it could run — this job is permanently dropped.`
        )
      }
    }

    return // SQS will not retry since no error thrown
  }

  try {
    console.log(`Starting crawl for ${isVoiceAgent ? 'voice agent' : 'bot'} ${job.botId}: ${job.urls.length} pages`)

    await updateJobProgress(job.botId, job.clientId, job.type, {
      phase: 'crawling',
      updatedAt: new Date().toISOString(),
    })

    const { chunks, pageCount, supportEmail } = await crawlAndChunk(job)

    console.log(`Embedding ${chunks.length} chunks in batch`)
    // Embedding is a single bulk call (generateEmbeddingsBatch + upsertChunks below),
    // not a per-chunk loop — there's no iteration boundary to report incremental
    // chunksDone against, so phase 'indexing' is written once here with chunksDone
    // left absent (renders as an indeterminate bar) until the completion write below.
    await updateJobProgress(job.botId, job.clientId, job.type, {
      phase: 'indexing',
      updatedAt: new Date().toISOString(),
    })
    const embeddings = await generateEmbeddingsBatch(chunks.map((c) => c.text))
    await upsertChunks(chunks, embeddings)

    await updateJobProgress(job.botId, job.clientId, job.type, {
      status: 'complete',
      crawledPages: pageCount,
      selectedPages: pageCount,
      totalChunks: chunks.length,
      completedAt: new Date().toISOString(),
      phase: 'ready',
      chunksDone: chunks.length,
      updatedAt: new Date().toISOString(),
      summary: { pages: pageCount, passages: chunks.length },
    })

    if (isVoiceAgent) {
      await updateVoiceAgent(job.botId, job.clientId, { isIndexed: true })
    } else {
      await updateBot(job.botId, job.clientId, {
        status: 'active',
        ...(supportEmail ? { supportEmail } : {}),
      })
    }

    console.log(`Indexing complete: ${chunks.length} chunks`)

    if (!isVoiceAgent) {
      await prewarmSuggestionsForJob(job.botId, chunks)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateJobProgress(job.botId, job.clientId, job.type, {
      status: 'failed',
      error: message,
      errorDetail: { message, retryable: true },
      phase: 'failed',
      updatedAt: new Date().toISOString(),
    })
    if (!isVoiceAgent) {
      await updateBotCrawlStatus(job.botId, job.clientId, 'crawl_failed', mapCrawlErrorMessage(message))
    }
    console.error(`Crawl job failed for ${isVoiceAgent ? 'voice agent' : 'bot'} ${job.botId}:`, error)
    // Do not rethrow — SQS retries won't fix a SPA/rendering failure, so the
    // job must complete cleanly instead of looping forever.
  }
}
