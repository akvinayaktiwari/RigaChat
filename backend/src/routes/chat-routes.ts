import { Hono } from 'hono'
import { stream } from 'hono/streaming'
import {
  checkLeadTrigger,
  saveAssistantMessage,
  startConversation,
  streamMessage,
} from '../services/chat-service.js'
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

chatRoutes.post('/start', async (c) => {
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
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

chatRoutes.post('/message', async (c) => {
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
