import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import { getPublicConfig } from '../services/bot-service.js'
import {
  captureLead,
  getLeadDetail,
  getLeadsForBot,
  getLeadsForClient,
} from '../services/lead-service.js'
import type { ApiResponse, Lead } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const leadRoutes = new Hono<AuthEnv>()

interface CaptureLeadBody {
  botId?: string
  conversationId?: string
  name?: string
  phone?: string
  email?: string
  propertyInterest?: string
  budgetRange?: string
  chatTranscript?: string
  sourceUrl?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

leadRoutes.post('/', async (c) => {
  const body = await c.req.json<CaptureLeadBody>()

  if (!body.botId || !body.conversationId || !body.name || !body.phone || !body.email) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'botId, conversationId, name, phone, and email are required' },
      400
    )
  }

  try {
    const bot = await getPublicConfig(body.botId)

    const lead = await captureLead({
      botId: body.botId,
      clientId: bot.clientId,
      conversationId: body.conversationId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      propertyInterest: body.propertyInterest,
      budgetRange: body.budgetRange,
      chatTranscript: body.chatTranscript ?? '',
      sourceUrl: body.sourceUrl ?? '',
    })

    return c.json<ApiResponse<Lead>>({ success: true, data: lead }, 201)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

leadRoutes.get('/bot/:botId', requireAuth, async (c) => {
  const botId = c.req.param('botId')
  const leads = await getLeadsForBot(botId)
  return c.json<ApiResponse<Lead[]>>({ success: true, data: leads }, 200)
})

leadRoutes.get('/all', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const leads = await getLeadsForClient(clientId)
  return c.json<ApiResponse<Lead[]>>({ success: true, data: leads }, 200)
})

leadRoutes.get('/:botId/:leadId', requireAuth, async (c) => {
  const botId = c.req.param('botId')
  const leadId = c.req.param('leadId')

  try {
    const lead = await getLeadDetail(botId, leadId)
    return c.json<ApiResponse<Lead>>({ success: true, data: lead }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Lead not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
