import { v4 as uuidv4 } from 'uuid'
import {
  createBot,
  deleteBot,
  getBotById,
  getBotsByClientId,
  getPublicBotConfig,
  updateBot,
} from '../repositories/bot-repository.js'
import { deleteChunksByBotId } from '../repositories/vector-repository.js'
import { indexWebsite } from './rag-service.js'
import type { BotConfig } from '../types/index.js'

interface CreateBotInput {
  clientId: string
  name: string
  websiteUrl: string
  greetingMessage: string
  brandColor: string
  widgetTrigger: BotConfig['widgetTrigger']
  leadTriggerAfterMessages: number
  leadFormFields: BotConfig['leadFormFields']
}

export async function setupBot(
  input: CreateBotInput
): Promise<{ bot: BotConfig; pagesIndexed: number; chunksIndexed: number }> {
  const botId = uuidv4()

  const bot = await createBot({
    botId,
    clientId: input.clientId,
    name: input.name,
    greetingMessage: input.greetingMessage,
    brandColor: input.brandColor,
    leadTriggerAfterMessages: input.leadTriggerAfterMessages,
    leadFormFields: input.leadFormFields,
    widgetTrigger: input.widgetTrigger,
  })

  try {
    const { pagesIndexed, chunksIndexed } = await indexWebsite(botId, input.websiteUrl)
    return { bot, pagesIndexed, chunksIndexed }
  } catch (error) {
    await deleteBot(botId, input.clientId)
    throw new Error(
      `Failed to set up bot for client ${input.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
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
  return bot
}

export async function updateBotConfig(
  botId: string,
  clientId: string,
  updates: Partial<Omit<BotConfig, 'botId' | 'clientId' | 'createdAt'>>
): Promise<BotConfig> {
  try {
    return await updateBot(botId, clientId, updates)
  } catch (error) {
    throw new Error(
      `Failed to update bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeBot(botId: string, clientId: string): Promise<void> {
  const bot = await getBotById(botId, clientId)
  if (!bot) {
    throw new Error('Bot not found')
  }

  try {
    await deleteBot(botId, clientId)
    await deleteChunksByBotId(botId)
  } catch (error) {
    throw new Error(
      `Failed to remove bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
