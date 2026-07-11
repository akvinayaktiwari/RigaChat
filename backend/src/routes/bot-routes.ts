import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  confirmIndexingJob,
  getBotConfig,
  getClientBots,
  getIndexingStatus,
  getPublicConfig,
  removeBot,
  resyncBot,
  setupBot,
  startIndexingJob,
  updateBotConfig,
} from '../services/bot-service.js'
import { generateAndPrewarmSuggestions, getKbContentForBot } from '../services/suggestion-service.js'
import type { ApiResponse, BotConfig, PrewarmResult } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const botRoutes = new Hono<AuthEnv>()

const DEFAULT_LEAD_FORM_FIELDS: BotConfig['leadFormFields'] = [
  { fieldId: 'name', label: 'Your Name', type: 'text', required: true },
  { fieldId: 'phone', label: 'Phone Number', type: 'phone', required: true },
  { fieldId: 'email', label: 'Email Address', type: 'email', required: true },
  { fieldId: 'propertyInterest', label: 'Property Interest', type: 'text', required: false },
  { fieldId: 'budgetRange', label: 'Budget Range', type: 'text', required: false },
]

interface SetupBotBody {
  name?: string
  websiteUrl?: string
  greetingMessage?: string
  brandColor?: string
  widgetTrigger?: BotConfig['widgetTrigger']
  leadTriggerAfterMessages?: number
  leadFormFields?: BotConfig['leadFormFields']
}

type UpdateBotBody = Partial<Omit<BotConfig, 'botId' | 'clientId' | 'createdAt'>>

interface ResyncBotBody {
  websiteUrl?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

botRoutes.post('/setup', requireAuth, async (c) => {
  const body = await c.req.json<SetupBotBody>()

  if (!body.name || !body.websiteUrl) {
    return c.json<ApiResponse<null>>({ success: false, error: 'name and websiteUrl are required' }, 400)
  }

  const clientId = c.get('user').sub

  try {
    const result = await setupBot({
      clientId,
      name: body.name,
      websiteUrl: body.websiteUrl,
      greetingMessage: body.greetingMessage ?? '',
      brandColor: body.brandColor ?? '#6366f1',
      widgetTrigger: body.widgetTrigger ?? 'delay_5s',
      leadTriggerAfterMessages: body.leadTriggerAfterMessages ?? 2,
      leadFormFields: body.leadFormFields ?? DEFAULT_LEAD_FORM_FIELDS,
    })
    return c.json<ApiResponse<typeof result>>({ success: true, data: result }, 201)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

botRoutes.get('/my-bots', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const bots = await getClientBots(clientId)
  return c.json<ApiResponse<BotConfig[]>>({ success: true, data: bots }, 200)
})

botRoutes.get('/public/:botId', async (c) => {
  const botId = c.req.param('botId')

  try {
    const bot = await getPublicConfig(botId)
    return c.json<ApiResponse<BotConfig>>({ success: true, data: bot }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

botRoutes.get('/:botId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')

  try {
    const bot = await getBotConfig(botId, clientId)
    return c.json<ApiResponse<BotConfig>>({ success: true, data: bot }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

botRoutes.patch('/:botId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const updates = await c.req.json<UpdateBotBody>()

  try {
    const bot = await updateBotConfig(botId, clientId, updates)
    return c.json<ApiResponse<BotConfig>>({ success: true, data: bot }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

botRoutes.delete('/:botId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')

  try {
    await removeBot(botId, clientId)
    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Bot deleted' } }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

botRoutes.post('/:botId/regenerate-suggestions', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')

  try {
    const bot = await getBotConfig(botId, clientId)
    const kbContent = await getKbContentForBot(botId)

    if (!kbContent) {
      return c.json<ApiResponse<null>>(
        { success: false, error: 'No knowledge base found. Add website content before generating suggestions.' },
        400
      )
    }

    const result = await generateAndPrewarmSuggestions(botId, kbContent, bot.name)
    return c.json<ApiResponse<{ message: string; result: PrewarmResult }>>(
      { success: true, data: { message: 'Suggestions regenerated successfully', result } },
      200
    )
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

interface IndexBotBody {
  url?: string
}

interface ConfirmIndexBody {
  jobId?: string
}

botRoutes.post('/:botId/index', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const body = await c.req.json<IndexBotBody>()

  if (!body.url) {
    return c.json<ApiResponse<null>>({ success: false, error: 'url is required' }, 400)
  }

  try {
    const result = await startIndexingJob(botId, clientId, body.url)
    return c.json<ApiResponse<typeof result>>({ success: true, data: result }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    if (error instanceof Error && error.message === 'Invalid URL') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

botRoutes.post('/:botId/confirm-index', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const body = await c.req.json<ConfirmIndexBody>()

  if (!body.jobId) {
    return c.json<ApiResponse<null>>({ success: false, error: 'jobId is required' }, 400)
  }

  try {
    const result = await confirmIndexingJob(botId, clientId, body.jobId)
    return c.json<ApiResponse<typeof result>>({ success: true, data: result }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

botRoutes.get('/:botId/index-status', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')

  try {
    const status = await getIndexingStatus(botId, clientId)
    return c.json<ApiResponse<typeof status>>({ success: true, data: status }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

botRoutes.post('/:botId/resync', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const body = await c.req.json<ResyncBotBody>()

  if (!body.websiteUrl) {
    return c.json<ApiResponse<null>>({ success: false, error: 'websiteUrl is required' }, 400)
  }

  try {
    const result = await resyncBot(botId, clientId, body.websiteUrl)
    return c.json<ApiResponse<typeof result>>({ success: true, data: result }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
