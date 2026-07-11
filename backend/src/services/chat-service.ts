import { v4 as uuidv4 } from 'uuid'
import { appendMessage, createConversation, getConversation } from '../repositories/conversation-repository.js'
import { retrieveContext } from './rag-service.js'
import { generateEmbedding, streamChatResponse } from './openai-service.js'
import { getPublicConfig } from './bot-service.js'
import { queryCacheNamespace } from '../repositories/vector-repository.js'
import { saveToCache } from './cache-service.js'
import type { ConversationMessage } from '../types/index.js'

interface StartConversationInput {
  botId: string
  sourceUrl: string
}

interface StartConversationResult {
  conversationId: string
  greeting: string
}

interface SendMessageInput {
  botId: string
  conversationId: string
  message: string
}

export async function startConversation(
  input: StartConversationInput
): Promise<StartConversationResult> {
  try {
    const botConfig = await getPublicConfig(input.botId)
    const conversationId = uuidv4()

    await createConversation({
      botId: input.botId,
      conversationId,
      messages: [],
      leadCaptured: false,
      sourceUrl: input.sourceUrl,
    })

    return { conversationId, greeting: botConfig.greetingMessage }
  } catch (error) {
    throw new Error(
      `Failed to start conversation for bot ${input.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

async function* singleChunkGenerator(text: string): AsyncGenerator<string> {
  yield text
}

// Wraps the LLM generator to accumulate the full answer as it streams out,
// then writes it to cache once the last chunk has been yielded. Awaiting the
// cache write here (rather than firing it off separately) keeps it inside the
// still-open response stream, so Lambda can't freeze the execution
// environment before it completes — the same class of bug fixed earlier for
// suggestion pre-warming.
async function* streamAndCache(
  botId: string,
  question: string,
  questionEmbedding: number[],
  upstream: AsyncGenerator<string>
): AsyncGenerator<string> {
  let fullAnswer = ''
  for await (const chunk of upstream) {
    fullAnswer += chunk
    yield chunk
  }
  await saveToCache(botId, question, fullAnswer, questionEmbedding)
}

export async function streamMessage(input: SendMessageInput): Promise<AsyncGenerator<string>> {
  const conversation = await getConversation(input.botId, input.conversationId)
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  const userMessage: ConversationMessage = {
    role: 'user',
    content: input.message,
    timestamp: new Date().toISOString(),
  }
  await appendMessage(input.botId, input.conversationId, userMessage)

  const botConfig = await getPublicConfig(input.botId)
  const queryEmbedding = await generateEmbedding(input.message)

  const cacheResult = await queryCacheNamespace(input.botId, queryEmbedding)
  if (cacheResult.hit && cacheResult.data) {
    console.log(`Cache hit for bot ${input.botId}, similarity: ${cacheResult.data.similarity}`)
    return singleChunkGenerator(cacheResult.data.answer)
  }

  const contextChunks = await retrieveContext(input.botId, input.message)

  const systemPrompt = `You are a helpful assistant for this business.
Keep responses concise and helpful.
Always be polite and professional.`

  // The assistant's response is saved after streaming completes, handled in the route layer.
  const upstream = streamChatResponse({
    systemPrompt,
    contextChunks,
    conversationHistory: conversation.messages,
    userMessage: input.message,
    botName: botConfig.name,
  })

  return streamAndCache(input.botId, input.message, queryEmbedding, upstream)
}

export async function saveAssistantMessage(
  botId: string,
  conversationId: string,
  content: string
): Promise<void> {
  const message: ConversationMessage = {
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
  }

  try {
    await appendMessage(botId, conversationId, message)
  } catch (error) {
    throw new Error(
      `Failed to save assistant message for conversation ${conversationId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function checkLeadTrigger(botId: string, conversationId: string): Promise<boolean> {
  const conversation = await getConversation(botId, conversationId)
  if (!conversation) return false
  if (conversation.leadCaptured) return false

  const botConfig = await getPublicConfig(botId)
  const userMessageCount = conversation.messages.filter((m) => m.role === 'user').length

  return userMessageCount >= botConfig.leadTriggerAfterMessages
}
