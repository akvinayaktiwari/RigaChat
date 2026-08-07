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
  updateLeadStateForClient,
} from '../services/lead-inbox-service.js'
import type { LeadStatePatch } from '../repositories/lead-state-repository.js'
import type {
  ApiResponse,
  Lead,
  LeadOutcome,
  LeadRef,
  LeadState,
  LeadStatus,
  UnifiedLead,
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

const LEAD_STATUSES: readonly LeadStatus[] = ['new', 'contacted', 'qualified', 'closed']
const LEAD_OUTCOMES: readonly LeadOutcome[] = ['won', 'lost', 'unreachable']

class LeadStateValidationError extends Error {}

// A LeadRef arrives from the client because the inbox handed it out -- it names
// the table AND the parent key, which is the only way to read a lead back
// without knowing its source in advance. It is still fully re-validated here,
// and the service re-checks ownership against the lead record itself.
function parseLeadRef(raw: unknown): LeadRef | null {
  if (typeof raw !== 'object' || raw === null) return null
  const ref = raw as Record<string, unknown>
  const { leadId, source } = ref
  if (typeof leadId !== 'string' || leadId.length === 0) return null

  if (source === 'chat' && typeof ref.botId === 'string') {
    return { source, botId: ref.botId, leadId }
  }
  if (source === 'form' && typeof ref.formId === 'string') {
    return { source, formId: ref.formId, leadId }
  }
  if (source === 'meta' && typeof ref.pageId === 'string') {
    return { source, pageId: ref.pageId, leadId }
  }
  return null
}

// null clears the field, absent leaves it alone. The repository distinguishes
// the two by whether the key is present, so a cleared field is set to undefined
// rather than dropped.
function parseNullableString(value: unknown, field: string): string | undefined {
  if (value === null) return undefined
  if (typeof value !== 'string' || value.length === 0) {
    throw new LeadStateValidationError(`${field} must be a non-empty string or null`)
  }
  return value
}

function parseTimestamp(value: unknown, field: string): string | undefined {
  const parsed = parseNullableString(value, field)
  if (parsed !== undefined && Number.isNaN(Date.parse(parsed))) {
    throw new LeadStateValidationError(`${field} must be an ISO-8601 timestamp`)
  }
  return parsed
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new LeadStateValidationError(`${field} must be one of: ${allowed.join(', ')}`)
  }
  return value as T
}

function parseLeadScore(value: unknown): number | undefined {
  if (value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new LeadStateValidationError('leadScore must be a number between 0 and 100, or null')
  }
  return value
}

// replied and appointmentBooked are deliberately NOT settable here: they are
// facts the journey executor observes, not opinions an operator holds. Letting
// the dashboard write them would make JourneyStep.recheckField unfalsifiable.
function parseStatePatch(body: Record<string, unknown>): LeadStatePatch {
  const patch: LeadStatePatch = {}

  if ('status' in body) patch.status = parseEnum(body.status, LEAD_STATUSES, 'status')
  if ('ownerId' in body) patch.ownerId = parseNullableString(body.ownerId, 'ownerId')
  if ('nextActionAt' in body) patch.nextActionAt = parseTimestamp(body.nextActionAt, 'nextActionAt')
  if ('leadScore' in body) patch.leadScore = parseLeadScore(body.leadScore)
  if ('outcome' in body) {
    patch.outcome = body.outcome === null ? undefined : parseEnum(body.outcome, LEAD_OUTCOMES, 'outcome')
  }

  // Reopening a closed lead drops its outcome. Leaving a stale 'lost' on a
  // lead that is being worked again is how a pipeline starts lying.
  if (patch.status !== undefined && patch.status !== 'closed' && !('outcome' in body)) {
    patch.outcome = undefined
  }

  if (Object.keys(patch).length === 0) {
    throw new LeadStateValidationError('No updatable fields supplied')
  }
  return patch
}

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
