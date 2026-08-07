import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import { getPublicConfig } from '../services/bot-service.js'
import {
  captureLead,
  getLeadDetail,
  getLeadsForBot,
  getLeadsForClient,
  LeadValidationError,
} from '../services/lead-service.js'
import {
  addLeadNoteForClient,
  getUnifiedInbox,
  getUnifiedLeadDetail,
  updateLeadStateForClient,
} from '../services/lead-inbox-service.js'
import {
  LeadStateValidationError,
  parseLeadRef,
  parseStatePatch,
} from '../lib/lead-state-validation.js'
import type {
  ApiResponse,
  Lead,
  LeadRef,
  LeadState,
  UnifiedLead,
  UnifiedLeadDetail,
} from '../types/index.js'

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

  if (!body.botId || !body.conversationId || !body.sourceUrl) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'botId, conversationId, and sourceUrl are required' },
      400
    )
  }

  try {
    const bot = await getPublicConfig(body.botId)

    const lead = await captureLead(bot, {
      botId: body.botId,
      clientId: bot.clientId,
      conversationId: body.conversationId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      propertyInterest: body.propertyInterest,
      budgetRange: body.budgetRange,
      chatTranscript: body.chatTranscript ?? '',
      sourceUrl: body.sourceUrl,
    })

    return c.json<ApiResponse<Lead>>({ success: true, data: lead }, 201)
  } catch (error) {
    if (error instanceof LeadValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

leadRoutes.get('/bot/:botId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')

  try {
    const leads = await getLeadsForBot(botId, clientId)
    return c.json<ApiResponse<Lead[]>>({ success: true, data: leads }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

leadRoutes.get('/all', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const leads = await getLeadsForClient(clientId)
  return c.json<ApiResponse<Lead[]>>({ success: true, data: leads }, 200)
})

// ---------------------------------------------------------------------------
// Unified inbox + lead state
// ---------------------------------------------------------------------------

function stateErrorResponse(error: unknown): { message: string; status: 400 | 404 | 500 } {
  if (error instanceof LeadStateValidationError) return { message: error.message, status: 400 }
  if (error instanceof Error && error.message === 'Lead not found') {
    return { message: error.message, status: 404 }
  }
  return { message: errorMessage(error), status: 500 }
}

leadRoutes.get('/inbox', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const leads = await getUnifiedInbox(clientId)
    return c.json<ApiResponse<UnifiedLead[]>>({ success: true, data: leads }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

leadRoutes.get('/detail', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  // Same LeadRef, arriving as query params instead of a body -- this is a GET
  // reached by opening a link, so the whole ref has to live in the URL.
  const leadRef = parseLeadRef({
    source: c.req.query('source'),
    leadId: c.req.query('leadId'),
    botId: c.req.query('botId'),
    formId: c.req.query('formId'),
    pageId: c.req.query('pageId'),
  })
  if (!leadRef) {
    return c.json<ApiResponse<null>>({ success: false, error: 'A valid leadRef is required' }, 400)
  }

  try {
    const lead = await getUnifiedLeadDetail(leadRef, clientId)
    return c.json<ApiResponse<UnifiedLeadDetail>>({ success: true, data: lead }, 200)
  } catch (error) {
    const { message, status } = stateErrorResponse(error)
    return c.json<ApiResponse<null>>({ success: false, error: message }, status)
  }
})

leadRoutes.patch('/state', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<Record<string, unknown>>()

  const leadRef = parseLeadRef(body.leadRef)
  if (!leadRef) {
    return c.json<ApiResponse<null>>({ success: false, error: 'A valid leadRef is required' }, 400)
  }

  try {
    const state = await updateLeadStateForClient(leadRef, clientId, parseStatePatch(body))
    return c.json<ApiResponse<LeadState>>({ success: true, data: state }, 200)
  } catch (error) {
    const { message, status } = stateErrorResponse(error)
    return c.json<ApiResponse<null>>({ success: false, error: message }, status)
  }
})

leadRoutes.post('/notes', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<Record<string, unknown>>()

  const leadRef = parseLeadRef(body.leadRef)
  if (!leadRef) {
    return c.json<ApiResponse<null>>({ success: false, error: 'A valid leadRef is required' }, 400)
  }
  if (typeof body.body !== 'string' || body.body.trim().length === 0) {
    return c.json<ApiResponse<null>>({ success: false, error: 'A non-empty note body is required' }, 400)
  }

  try {
    const state = await addLeadNoteForClient(leadRef, clientId, body.body.trim(), clientId)
    return c.json<ApiResponse<LeadState>>({ success: true, data: state }, 201)
  } catch (error) {
    const { message, status } = stateErrorResponse(error)
    return c.json<ApiResponse<null>>({ success: false, error: message }, status)
  }
})

leadRoutes.get('/:botId/:leadId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')
  const leadId = c.req.param('leadId')

  try {
    const lead = await getLeadDetail(botId, leadId, clientId)
    return c.json<ApiResponse<Lead>>({ success: true, data: lead }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Lead not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
