import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import {
  MessageCeilingError,
  checkLeadTrigger,
  saveAssistantMessage,
  startConversation,
  streamMessage,
} from '../services/chat-service.js'
import { EntitlementError, toEntitlementErrorResponse } from '../services/entitlement-service.js'
import { rateLimit } from '../lib/rate-limit.js'
import {
  CHAT_MESSAGE_RATE_LIMIT_MAX,
  CHAT_MESSAGE_RATE_LIMIT_SECONDS,
  CHAT_START_RATE_LIMIT_MAX,
  CHAT_START_RATE_LIMIT_SECONDS,
} from '../config/entitlements-config.js'
import type { ApiResponse } from '../types/index.js'

export const chatRoutes = new Hono()

interface StartConversationBody {
  botId?: string
  sourceUrl?: string
}

interface SendMessageBody {
  botId?: string
  conversationId?: string
  message?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// Unauthenticated by design -- anonymous visitors on a client's own site have
// no session to present. The per-IP ceiling is what stands in for one.
//
// /start is the tighter of the two because it is the unbounded operation: each
// call creates a new conversation, and MESSAGE_CEILING_PER_CONVERSATION only
// caps spend WITHIN one. Without this, start -> N messages -> start loops
// forever on a client's OpenAI quota.
chatRoutes.post(
  '/start',
  rateLimit({
    bucket: 'start',
    max: CHAT_START_RATE_LIMIT_MAX,
    windowSeconds: CHAT_START_RATE_LIMIT_SECONDS,
    message: 'Too many chats started from this network. Please try again in a few minutes.',
  }),
  async (c) => {
  const body = await c.req.json<StartConversationBody>()

  if (!body.botId || !body.sourceUrl) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'botId and sourceUrl are required' },
      400
    )
  }

  try {
    const result = await startConversation({ botId: body.botId, sourceUrl: body.sourceUrl })
    return c.json<ApiResponse<typeof result>>({ success: true, data: result }, 201)
  } catch (error) {
    if (error instanceof EntitlementError) {
      const { status, body: responseBody } = toEntitlementErrorResponse(error)
      return c.json(responseBody, status)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

chatRoutes.post(
  '/message',
  rateLimit({
    bucket: 'message',
    max: CHAT_MESSAGE_RATE_LIMIT_MAX,
    windowSeconds: CHAT_MESSAGE_RATE_LIMIT_SECONDS,
    message: 'You are sending messages too quickly. Please wait a moment.',
  }),
  async (c) => {
  const body = await c.req.json<SendMessageBody>()

  if (!body.botId || !body.conversationId || !body.message) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'botId, conversationId, and message are required' },
      400
    )
  }

  const { botId, conversationId, message } = body

  let generator: AsyncGenerator<string>
  try {
    generator = await streamMessage({ botId, conversationId, message })
  } catch (error) {
    if (error instanceof MessageCeilingError) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Too many requests' }, 429)
    }
    const msg = errorMessage(error)
    if (msg === 'Conversation not found' || msg === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: msg }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: msg }, 500)
  }

  c.header('Content-Type', 'text/plain')

  return stream(c, async (streamApi) => {
    let fullText = ''
    for await (const chunk of generator) {
      fullText += chunk
      await streamApi.write(chunk)
    }
    await saveAssistantMessage(botId, conversationId, fullText)
    await streamApi.close()
  })
})

chatRoutes.get('/lead-trigger/:botId/:conversationId', async (c) => {
  const botId = c.req.param('botId')
  const conversationId = c.req.param('conversationId')

  const shouldCapture = await checkLeadTrigger(botId, conversationId)
  return c.json<ApiResponse<{ shouldCapture: boolean }>>(
    { success: true, data: { shouldCapture } },
    200
  )
})
