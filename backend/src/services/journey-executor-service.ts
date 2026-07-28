import { incrementWaitAndRecheckIteration } from '../repositories/journey-execution-repository.js'
import { bookAppointment } from '../mcp/booking-mcp-server.js'
import { scheduleReminder } from '../mcp/reminder-mcp-server.js'
import { getQuotation } from '../mcp/quotation-mcp-server.js'
import { sendBrochure } from '../mcp/brochure-mcp-server.js'
import type { JourneyExecutorEvent, WaitAndRecheckResult } from '../types/index.js'

// The Lambda handler journey-compiler-service.ts's compiled Task states
// actually invoke (via journeyExecutorLambdaArn) -- see backend/index.ts's
// dispatch. wait_and_recheck_check is fully real, and tool_call dispatches
// to the real MCP toolbox functions for 'booking'/'reminder' (see
// handleToolCall below) -- but 'quotation'/'brochure' inside that same
// dispatch, and send_message/human_handoff, remain deliberate stubs (agreed
// scope: no calendar/pricing/document/channel-send infra exists yet in this
// codebase -- see TODOS.md for each).

async function handleSendMessage(event: JourneyExecutorEvent): Promise<{ sent: boolean; stub: true }> {
  // STUB: real implementation needs to route through the bot's existing
  // chat/RAG pipeline (chat-service.ts/rag-service.ts) and the right
  // MessageChannel implementation for event.channel -- undesigned; the web
  // widget's MessageChannel wasn't built with a Journey-initiated (as
  // opposed to user-initiated) send in mind.
  console.log(
    `[journey-executor] STUB send_message: bot=${event.botId} bundle=${event.bundleId} lead=${event.leadId} channel=${event.channel} step=${event.stepId} hint="${event.messageHint ?? ''}"`
  )
  return { sent: false, stub: true }
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
    case 'booking':
      return { ...(await bookAppointment({ ...shared, requestedAt: requireStringField(event.toolInput, 'requestedAt') })) }
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

// The one fully real operation in this pass: increments a durable,
// atomic counter (see journey-execution-repository.ts) and decides
// exhausted from it. `satisfied` is deliberately hardcoded false --
// checking whether a lead has actually replied, or what their lead_score
// or appointment_booked state is, needs real data that doesn't exist on
// any record yet (Lead has no `replied`/`lead_score` field, and there's no
// booking record since tool_call is stubbed above). Wiring a real
// satisfied-check is tracked in TODOS.md, gated on those data models
// existing first -- returning false unconditionally here is honest about
// that gap rather than faking a check that can't mean anything yet.
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
