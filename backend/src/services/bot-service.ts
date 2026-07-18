import { v4 as uuidv4 } from 'uuid'
import {
  createBot,
  deleteBot,
  getBotById,
  getBotsByClientId,
  getPublicBotConfig,
  updateBot,
  updateIndexingJob,
} from '../repositories/bot-repository.js'
import { deleteChunksByNamespace } from '../repositories/vector-repository.js'
import { reindexNamespace } from './rag-service.js'
import { scanWebsite } from './crawler-service.js'
import { enqueueCrawlerJob } from '../lib/sqs.js'
import type { BotConfig, IndexingJob } from '../types/index.js'

const MAX_AUTO_QUEUE_PAGES = 50

function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

interface CreateBotInput {
  clientId: string
  name: string
  websiteUrl?: string
  greetingMessage: string
  brandColor: string
  widgetTrigger: BotConfig['widgetTrigger']
  leadTriggerAfterMessages: number
  leadFormFields: BotConfig['leadFormFields']
}

interface SetupBotResult {
  bot: BotConfig
  status: 'confirmation_required' | 'queued' | 'kb_only'
  jobId?: string
  totalPages: number
  selectedPages?: number
}

// deleteBot() already throws on real DynamoDB failures (relied on by the
// intentional "delete my bot" route). This wrapper is only for
// compensating cleanup after a mid-setup failure, where a cleanup error
// must not mask or crash the original failure being reported to the user.
async function safeDeleteBot(botId: string, clientId: string): Promise<void> {
  try {
    await deleteBot(botId, clientId)
  } catch (error) {
    console.error(`Failed to clean up orphaned bot ${botId}:`, error)
  }
}

async function crawlAndEnqueueOnSetup(
  botId: string,
  clientId: string,
  websiteUrl: string,
  botName: string
): Promise<Omit<SetupBotResult, 'bot'>> {
  let scan
  try {
    scan = await scanWebsite(websiteUrl)
  } catch (error) {
    await safeDeleteBot(botId, clientId)
    console.error(`Website scan failed during setup for bot ${botId}:`, error)
    throw new Error('SCAN_FAILED')
  }

  const jobId = uuidv4()
  const selectedPages = scan.requiresConfirmation ? MAX_AUTO_QUEUE_PAGES : scan.selectedPages.length

  await updateIndexingJob(botId, clientId, {
    jobId,
    status: scan.requiresConfirmation ? 'confirmation_required' : 'queued',
    websiteUrl,
    totalPages: scan.totalPages,
    selectedPages,
    crawledPages: 0,
    totalChunks: 0,
    queuedAt: new Date().toISOString(),
  })

  if (scan.requiresConfirmation) {
    return { status: 'confirmation_required', jobId, totalPages: scan.totalPages, selectedPages }
  }

  try {
    await enqueueCrawlerJob({ jobId, botId, clientId, urls: scan.selectedPages, useAICleaning: true, botName })
  } catch (error) {
    await safeDeleteBot(botId, clientId)
    console.error(`Failed to enqueue crawler job during setup for bot ${botId}:`, error)
    throw new Error('ENQUEUE_FAILED')
  }

  return { status: 'queued', jobId, totalPages: scan.totalPages }
}

export async function setupBot(input: CreateBotInput): Promise<SetupBotResult> {
  const botId = uuidv4()
  const hasWebsite = !!input.websiteUrl

  const bot = await createBot({
    botId,
    clientId: input.clientId,
    name: input.name,
    websiteUrl: input.websiteUrl,
    greetingMessage: input.greetingMessage,
    brandColor: input.brandColor,
    leadTriggerAfterMessages: input.leadTriggerAfterMessages,
    leadFormFields: input.leadFormFields,
    widgetTrigger: input.widgetTrigger,
    status: hasWebsite ? 'processing' : 'kb_only',
  })

  if (!hasWebsite) {
    return { bot, status: 'kb_only', totalPages: 0 }
  }

  const crawl = await crawlAndEnqueueOnSetup(botId, input.clientId, input.websiteUrl as string, bot.name ?? botId)
  return { bot, ...crawl }
}

export async function getClientBots(clientId: string): Promise<BotConfig[]> {
  try {
    return await getBotsByClientId(clientId)
  } catch (error) {
    throw new Error(
      `Failed to get bots for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getBotConfig(botId: string, clientId: string): Promise<BotConfig> {
  const bot = await getBotById(botId, clientId)
  if (!bot) {
    throw new Error('Bot not found')
  }
  return bot
}

export async function getPublicConfig(botId: string): Promise<BotConfig> {
  const bot = await getPublicBotConfig(botId)
  if (!bot) {
    throw new Error('Bot not found')
  }
  return { ...bot, suggestedQuestions: bot.suggestedQuestions ?? [] }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

async function handleWebsiteUrlChange(
  botId: string,
  clientId: string,
  bot: BotConfig,
  updates: Partial<Omit<BotConfig, 'botId' | 'clientId' | 'createdAt'>>
): Promise<void> {
  const hadWebsite = !!bot.websiteUrl
  const hasWebsite = !!updates.websiteUrl

  if (!hadWebsite && hasWebsite) {
    updates.status = 'processing'
    try {
      await startIndexingJob(botId, clientId, updates.websiteUrl as string)
    } catch (error) {
      console.error(`Failed to start indexing after websiteUrl update for bot ${botId}:`, error)
    }
  } else if (hadWebsite && !hasWebsite) {
    updates.status = 'kb_only'
  }
}

export async function updateBotConfig(
  botId: string,
  clientId: string,
  updates: Partial<Omit<BotConfig, 'botId' | 'clientId' | 'createdAt'>>
): Promise<BotConfig> {
  const sanitizedUpdates = { ...updates }
  if (sanitizedUpdates.supportEmail === '' || (sanitizedUpdates.supportEmail && !EMAIL_REGEX.test(sanitizedUpdates.supportEmail))) {
    delete sanitizedUpdates.supportEmail
  }

  if ('websiteUrl' in sanitizedUpdates) {
    const bot = await getBotById(botId, clientId)
    if (!bot) throw new Error('Bot not found')
    await handleWebsiteUrlChange(botId, clientId, bot, sanitizedUpdates)
  }

  try {
    return await updateBot(botId, clientId, sanitizedUpdates)
  } catch (error) {
    throw new Error(
      `Failed to update bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function resyncBot(
  botId: string,
  clientId: string,
  websiteUrl: string
): Promise<{ pagesIndexed: number; chunksIndexed: number }> {
  const bot = await getBotById(botId, clientId)
  if (!bot) throw new Error('Bot not found')
  const result = await reindexNamespace(botId, websiteUrl)
  if (result.supportEmail) {
    await updateBot(botId, clientId, { supportEmail: result.supportEmail })
  }
  return result
}

interface StartIndexingResult {
  status: 'confirmation_required' | 'queued'
  jobId: string
  totalPages: number
  message: string
  selectedPages?: number
}

export async function startIndexingJob(
  botId: string,
  clientId: string,
  url: string
): Promise<StartIndexingResult> {
  if (!isValidUrl(url)) {
    throw new Error('Invalid URL')
  }
  const bot = await getBotById(botId, clientId)
  if (!bot) throw new Error('Bot not found')

  const scan = await scanWebsite(url)
  const jobId = uuidv4()

  if (scan.requiresConfirmation) {
    await updateIndexingJob(botId, clientId, {
      jobId,
      status: 'confirmation_required',
      websiteUrl: url,
      totalPages: scan.totalPages,
      selectedPages: MAX_AUTO_QUEUE_PAGES,
      crawledPages: 0,
      totalChunks: 0,
      queuedAt: new Date().toISOString(),
    })
    return {
      status: 'confirmation_required',
      jobId,
      totalPages: scan.totalPages,
      selectedPages: MAX_AUTO_QUEUE_PAGES,
      message: `Found ${scan.totalPages} pages. We will crawl the ${MAX_AUTO_QUEUE_PAGES} most relevant pages. Click confirm to proceed.`,
    }
  }

  await updateIndexingJob(botId, clientId, {
    jobId,
    status: 'queued',
    websiteUrl: url,
    totalPages: scan.totalPages,
    selectedPages: scan.selectedPages.length,
    crawledPages: 0,
    totalChunks: 0,
    queuedAt: new Date().toISOString(),
  })
  await enqueueCrawlerJob({
    jobId,
    botId,
    clientId,
    urls: scan.selectedPages,
    useAICleaning: true,
    botName: bot.name ?? botId,
  })

  return {
    status: 'queued',
    jobId,
    totalPages: scan.totalPages,
    message: `Indexing ${scan.totalPages} pages...`,
  }
}

export async function confirmIndexingJob(
  botId: string,
  clientId: string,
  jobId: string
): Promise<{ status: 'queued'; message: string }> {
  const bot = await getBotById(botId, clientId)
  if (!bot) throw new Error('Bot not found')
  if (bot.indexingJob?.jobId !== jobId) throw new Error('Job not found')
  if (bot.indexingJob.status !== 'confirmation_required') {
    throw new Error('Job is not awaiting confirmation')
  }

  const scan = await scanWebsite(bot.indexingJob.websiteUrl)
  const urls = scan.selectedPages.slice(0, MAX_AUTO_QUEUE_PAGES)

  await updateIndexingJob(botId, clientId, {
    status: 'queued',
    selectedPages: urls.length,
    queuedAt: new Date().toISOString(),
  })

  try {
    await enqueueCrawlerJob({ jobId, botId, clientId, urls, useAICleaning: true, botName: bot.name ?? botId })
  } catch (error) {
    // User already confirmed they want this bot — keep the record so they can retry,
    // don't delete it like the initial setup flow does.
    console.error(`Failed to enqueue crawler job on confirm for bot ${botId}:`, error)
    throw new Error('ENQUEUE_FAILED')
  }

  return { status: 'queued', message: 'Indexing started' }
}

export async function getIndexingStatus(
  botId: string,
  clientId: string
): Promise<IndexingJob | { status: 'none' }> {
  const bot = await getBotById(botId, clientId)
  if (!bot) throw new Error('Bot not found')
  return bot.indexingJob ?? { status: 'none' }
}

export async function removeBot(botId: string, clientId: string): Promise<void> {
  const bot = await getBotById(botId, clientId)
  if (!bot) {
    throw new Error('Bot not found')
  }

  try {
    await deleteBot(botId, clientId)
    await deleteChunksByNamespace(botId)
  } catch (error) {
    throw new Error(
      `Failed to remove bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
