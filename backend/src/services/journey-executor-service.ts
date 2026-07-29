import { incrementWaitAndRecheckIteration } from '../repositories/journey-execution-repository.js'
import { getLeadById } from '../repositories/lead-repository.js'
import { bookAppointment } from '../mcp/booking-mcp-server.js'
import { scheduleReminder } from '../mcp/reminder-mcp-server.js'
import { getQuotation } from '../mcp/quotation-mcp-server.js'
import { sendBrochure } from '../mcp/brochure-mcp-server.js'
import { hasActiveWhatsAppSession, sendWhatsAppMessageToLead } from './whatsapp-service.js'
import type { JourneyExecutorEvent, WaitAndRecheckResult } from '../types/index.js'

// The Lambda handler journey-compiler-service.ts's compiled Task states
// actually invoke (via journeyExecutorLambdaArn) -- see backend/index.ts's
// dispatch. wait_and_recheck_check is fully real, tool_call dispatches to
// the real MCP toolbox functions for 'booking'/'reminder' (see
// handleToolCall below), and send_message is real for the whatsapp channel
// (see handleSendMessage below) -- 'quotation'/'brochure' inside tool_call,
// web_widget inside send_message, and human_handoff, remain deliberate
// stubs (agreed scope: no pricing/document/notification infra exists yet,
// and the web widget has no delivery mechanism for a Journey-initiated send
// at all -- see TODOS.md for each).

const DEFAULT_SEND_MESSAGE_TEXT = 'Following up on your inquiry -- let us know if you have any questions!'

// Real for the whatsapp channel; an honest, structural "not supported"
// result for every other channel (web_widget has no delivery mechanism for
// a Journey-initiated send at all -- confirmed by investigation, not
// assumed: the widget is strictly request-response with no push/poll path,
// and starts a brand-new conversationId every session with no
// history-replay-on-load, so a message written into a lead's conversation
// record today would never actually be seen). None of these branches throw
// for expected, non-transient outcomes (no phone on file, no active
// session) -- retrying a Task doesn't fix "this lead has no phone number,"
// so failing the whole Journey execution over it would be wrong. Each
// returns a structured result an operator (or a future client-visible
// lead-timeline view) can read.
async function handleSendMessage(event: JourneyExecutorEvent): Promise<Record<string, unknown>> {
  if (event.channel !== 'whatsapp') {
    return {
      sent: false,
      reason: 'unsupported_channel',
      message: `send_message is not supported on channel "${event.channel}" yet -- it has no delivery mechanism for a Journey-initiated send. See TODOS.md.`,
    }
  }

  const lead = await getLeadById(event.botId, event.leadId)
  if (!lead?.phone) {
    return { sent: false, reason: 'no_phone_number', message: 'Lead has no phone number on file.' }
  }

  // See whatsapp-service.ts's hasActiveWhatsAppSession() for why this is
  // currently always false, and what unlocks a real check.
  if (!(await hasActiveWhatsAppSession(event.leadId))) {
    return {
      sent: false,
      reason: 'no_active_session',
      message:
        'Cannot send free-text outside a 24h WhatsApp session window; template-based sends are not implemented yet.',
    }
  }

  const result = await sendWhatsAppMessageToLead(event.clientId, lead.phone, event.messageHint ?? DEFAULT_SEND_MESSAGE_TEXT)
  return { sent: result.success, ...result }
}

// Extracts a required string field out of toolInput (a Record<string,
// unknown> -- the compiler has no way to type-check a client-authored
// tool_call step's input against a specific capability's expected shape).
// Throwing here surfaces a clear, specific error (caught by the compiled
// Task state's own Retry policy / eventual execution failure) instead of
// booking-mcp-server.ts's bookAppointment() failing on `undefined` with a
// confusing message.
function requireStringField(toolInput: Record<string, unknown> | undefined, field: string): string {
  const value = toolInput?.[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`tool_call toolInput missing required field "${field}"`)
  }
  return value
}

// Dispatches by capability name (toolName), which is the bounded palette
// entry a client picked into their bundle's AgentConfig.mcpToolbox
// (journey-service.ts already validated toolName is a real member of that
// toolbox before this ever runs). Calls the SAME core functions
// mcp-routes.ts's real MCP servers expose over HTTP -- in-process, not a
// self-HTTP-call back into this same Lambda, since journey-executor-service
// and the MCP capability logic both already run inside the one Lambda.
async function handleToolCall(event: JourneyExecutorEvent): Promise<Record<string, unknown>> {
  const shared = { botId: event.botId, clientId: event.clientId, leadId: event.leadId }

  switch (event.toolName) {
    case 'booking': {
      const timeZone = event.toolInput?.timeZone
      return {
        ...(await bookAppointment({
          ...shared,
          requestedAt: requireStringField(event.toolInput, 'requestedAt'),
          ...(typeof timeZone === 'string' ? { timeZone } : {}),
        })),
      }
    }
    case 'reminder':
      return { ...(await scheduleReminder({ ...shared, remindAt: requireStringField(event.toolInput, 'remindAt') })) }
    case 'quotation':
      return { ...(await getQuotation(shared)) }
    case 'brochure':
      return { ...(await sendBrochure(shared)) }
    default:
      throw new Error(`tool_call has unknown toolName "${event.toolName}"`)
  }
}

async function handleHumanHandoff(event: JourneyExecutorEvent): Promise<{ handedOff: true }> {
  // STUB-ish: no notification infra (email/SMS-to-agent alert) exists yet,
  // so this is a structured log rather than a real alert -- deliberately
  // not building a notification feature nobody asked for as a side effect
  // of this pass. A future implementation would persist this and/or notify
  // the client's team.
  console.log(
    `[journey-executor] human_handoff: bot=${event.botId} bundle=${event.bundleId} lead=${event.leadId} step=${event.stepId} reason="${event.reason ?? ''}"`
  )
  return { handedOff: true }
}

// Increments a durable, atomic counter (see journey-execution-repository.ts)
// and decides exhausted from it -- fully real. `satisfied` is deliberately
// hardcoded false: checking whether a lead has actually replied, or their
// real lead_score, needs data that doesn't exist on any record yet (Lead
// has no `replied`/`lead_score` field). AppointmentRequest now exists
// (booking is real), but its `status` never transitions past 'requested',
// so even an `appointment_booked` check can't mean anything yet either.
// Wiring a real satisfied-check is tracked in TODOS.md, gated on those data
// models existing first -- returning false unconditionally here is honest
// about that gap rather than faking a check that can't mean anything yet.
async function handleWaitAndRecheckCheck(event: JourneyExecutorEvent): Promise<WaitAndRecheckResult> {
  if (!event.stepId || event.maxIterations === undefined) {
    throw new Error('wait_and_recheck_check event missing stepId or maxIterations')
  }

  const iterationCount = await incrementWaitAndRecheckIteration(event.leadId, event.stepId)

  return {
    satisfied: false,
    exhausted: iterationCount >= event.maxIterations,
  }
}

export async function executeJourneyStep(event: JourneyExecutorEvent): Promise<Record<string, unknown>> {
  switch (event.operation) {
    case 'send_message':
      return handleSendMessage(event)
    case 'tool_call':
      return handleToolCall(event)
    case 'human_handoff':
      return handleHumanHandoff(event)
    case 'wait_and_recheck_check':
      return { ...(await handleWaitAndRecheckCheck(event)) }
  }
}
