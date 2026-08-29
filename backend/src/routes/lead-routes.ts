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
  getLeadTimeline,
  getUnifiedInbox,
  getUnifiedLeadDetail,
  updateLeadStateForClient,
  setLeadArchivedForClient,
} from '../services/lead-inbox-service.js'
import {
  LeadStateValidationError,
  parseLeadRef,
  parseStatePatch,
} from '../lib/lead-state-validation.js'
import { eraseLead, LeadNotFoundError } from '../services/lead-erasure-service.js'
import type { LeadErasureReport } from '../services/lead-erasure-service.js'
import type {
  ApiResponse,
  Lead,
  LeadEvent,
  LeadRef,
  LeadState,
  UnifiedLead,
  UnifiedLeadDetail,
  UnifiedInboxPage,
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

// Returns a PAGE, not a bare array. The shape changed on 2026-08-27 when this
// endpoint was paginated -- see lead-inbox-service.ts for what that fixes (the
// multi-megabyte response over mobile data) and what it does not (the read
// cost, which needs a materialised inbox table).
//
// `limit` and `cursor` are both optional. Omitting them returns the first page
// at the default size rather than everything, which is the point.
leadRoutes.get('/inbox', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  const rawLimit = c.req.query('limit')
  const limit = rawLimit === undefined ? undefined : Number.parseInt(rawLimit, 10)
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
    return c.json<ApiResponse<null>>({ success: false, error: 'limit must be a positive integer' }, 400)
  }

  try {
    const page = await getUnifiedInbox(clientId, {
      ...(limit !== undefined ? { limit } : {}),
      ...(c.req.query('cursor') ? { cursor: c.req.query('cursor') as string } : {}),
      ...(c.req.query('includeArchived') === 'true' ? { includeArchived: true } : {}),
    })
    return c.json<ApiResponse<UnifiedInboxPage>>({ success: true, data: page }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// The lead's full timeline. Same LeadRef-in-query-params shape as /detail above,
// for the same reason: this is a GET reached by opening a link.
leadRoutes.get('/events', requireAuth, async (c) => {
  const clientId = c.get('user').sub
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
    const events = await getLeadTimeline(leadRef, clientId)
    return c.json<ApiResponse<LeadEvent[]>>({ success: true, data: events }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Lead not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
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

// Archive / unarchive. Its own route rather than a field on PATCH /state
// because it is not a state change: /state stamps lastTouchedAt on every call
// (an operator changing a status is working the lead), and archiving is the
// opposite claim.
leadRoutes.post('/archive', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<Record<string, unknown>>()

  const leadRef = parseLeadRef(body.leadRef)
  if (!leadRef) {
    return c.json<ApiResponse<null>>({ success: false, error: 'A valid leadRef is required' }, 400)
  }
  if (typeof body.archived !== 'boolean') {
    return c.json<ApiResponse<null>>({ success: false, error: 'archived must be true or false' }, 400)
  }

  try {
    const state = await setLeadArchivedForClient(leadRef, clientId, body.archived, clientId)
    return c.json<ApiResponse<LeadState>>({ success: true, data: state }, 200)
  } catch (error) {
    const { message, status } = stateErrorResponse(error)
    return c.json<ApiResponse<null>>({ success: false, error: message }, status)
  }
})

// IRREVERSIBLE. Deletes the lead and everything keyed by its leadId, including
// the message history, and stops any journey still running for them.
//
// DELETE with the LeadRef in QUERY PARAMS, matching /detail and /events: a
// LeadRef is three fields with a discriminator, bodies on DELETE are widely
// mishandled by proxies and clients, and this is the one route where a request
// silently losing its parameters must not be able to mean something else.
leadRoutes.delete('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub

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

  // The lead's own id, echoed back by the caller. Not security -- the auth
  // middleware already did that -- but a guard against a UI wiring the wrong
  // row's ref into an irreversible action, which is the realistic way this
  // deletes the wrong person.
  if (c.req.query('confirmLeadId') !== leadRef.leadId) {
    return c.json<ApiResponse<null>>(
      { success: false, error: 'confirmLeadId must match the leadId being erased' },
      400
    )
  }

  try {
    const report = await eraseLead(leadRef, clientId)
    return c.json<ApiResponse<LeadErasureReport>>({ success: true, data: report }, 200)
  } catch (error) {
    if (error instanceof LeadNotFoundError) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Lead not found' }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
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
