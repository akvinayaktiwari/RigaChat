import { v4 as uuidv4 } from 'uuid'
import { appendMessage, createConversation, getConversation } from '../repositories/conversation-repository.js'
import { retrieveContext } from './rag-service.js'
import { generateEmbedding, streamChatResponse } from './openai-service.js'
import { getPublicConfig } from './bot-service.js'
import { queryCacheNamespace } from '../repositories/vector-repository.js'
import { getCachedAnswer, setCachedAnswer } from '../repositories/redis-repository.js'
import { saveToCache } from './cache-service.js'
import { checkEntitlement } from './entitlement-service.js'
import { getByAccountId } from '../repositories/subscription-repository.js'
import { CEILING_CHECK_THRESHOLD, MESSAGE_CEILING_PER_CONVERSATION } from '../config/entitlements-config.js'
import type { ConversationMessage } from '../types/index.js'

// Deliberately distinct from EntitlementError — this is a flat per-conversation
// abuse guard, not a plan/billing concept, so it's kept out of the
// LIMIT_EXCEEDED/402 shape entirely.
export class MessageCeilingError extends Error {}

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
  // getPublicConfig() and checkEntitlement() are called before the try block
  // below on purpose — that block rewraps every error into a generic Error,
  // which would strip EntitlementError's type and prevent the route from
  // producing the correct 402/403 response (same fix as addKBEntry() in the
  // prior module).
  const botConfig = await getPublicConfig(input.botId)
  await checkEntitlement(botConfig.clientId, 'chat')

  try {
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
  // Redis write is faster (same region) — save there before the Pinecone write.
  await setCachedAnswer(question, botId, fullAnswer)
  console.log(`Cache write complete for bot ${botId}, message length: ${fullAnswer.length} chars`)
  await saveToCache(botId, question, fullAnswer, questionEmbedding)
}

export async function streamMessage(input: SendMessageInput): Promise<AsyncGenerator<string>> {
  const conversation = await getConversation(input.botId, input.conversationId)
  if (!conversation) {
    throw new Error('Conversation not found')
  }

  // Cheap pre-filter: below CEILING_CHECK_THRESHOLD, skip the
  // getPublicConfig()/getByAccountId() lookups entirely — zero new DB
  // reads for the overwhelming majority of ordinary conversations, which
  // never come anywhere near MESSAGE_CEILING_PER_CONVERSATION.
  if (conversation.messages.length >= CEILING_CHECK_THRESHOLD) {
    // A direct subscription-repository lookup instead of a full
    // resolveEntitlements() call — this only needs the raw isInternal flag,
    // not the computed Entitlements shape (which doesn't expose isInternal
    // separately anyway), so it skips the PLANS lookup and the entitlements
    // cache write that resolveEntitlements() would otherwise do on every
    // single message. Duplicates the getPublicConfig() call made later in
    // this function (inside the Promise.all below) — that one only runs on
    // a cache miss, so hoisting it here would add a bot-record fetch to the
    // Redis-cache-hit fast path this function is otherwise optimized for.
    const botConfigForCeilingCheck = await getPublicConfig(input.botId)
    const subscription = await getByAccountId(botConfigForCeilingCheck.clientId)
    const isInternal = subscription?.isInternal === true

    if (!isInternal && conversation.messages.length >= MESSAGE_CEILING_PER_CONVERSATION) {
      throw new MessageCeilingError('This conversation has reached its message limit.')
    }
  }

  const userMessage: ConversationMessage = {
    role: 'user',
    content: input.message,
    timestamp: new Date().toISOString(),
  }
  await appendMessage(input.botId, input.conversationId, userMessage)

  const t0 = Date.now()

  // Layer 1: Redis exact answer cache (Mumbai ~1ms)
  const redisAnswer = await getCachedAnswer(input.message, input.botId)
  if (redisAnswer) {
    console.log('Answer cache hit (Redis)')
    console.log(`Pre-LLM total: ${Date.now() - t0}ms`)
    return singleChunkGenerator(redisAnswer)
  }

  const [queryEmbedding, botConfig] = await Promise.all([
    generateEmbedding(input.message),
    getPublicConfig(input.botId),
  ])

  const cacheResult = await queryCacheNamespace(input.botId, queryEmbedding)
  console.log(`Pre-LLM total: ${Date.now() - t0}ms`)
  if (cacheResult.hit && cacheResult.data) {
    console.log(`Cache hit for bot ${input.botId}, similarity: ${cacheResult.data.similarity}`)
    return singleChunkGenerator(cacheResult.data.answer)
  }

  const contextChunks = await retrieveContext(input.botId, input.message, queryEmbedding)

  const systemPrompt = `You are ${botConfig.name}, an AI assistant. Answer questions using ONLY the provided context.

RULES:
1. Use information from ALL provided context chunks, not just the first one. Synthesize a complete answer.
2. If context chunks contain partial information, combine them into one coherent answer.
3. If context does not contain the answer, say: "I don't have that information right now. Would you like to speak with our team?"
4. Never add information not in the context.
5. Never contradict your earlier answers.
6. Never invent prices, fees, or contact details.

Keep responses under 4 sentences unless the question requires a detailed list.`

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
