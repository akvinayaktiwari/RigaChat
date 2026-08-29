import { incrementWaitAndRecheckIteration } from '../repositories/journey-execution-repository.js'
import { claimPendingReply } from '../repositories/journey-pending-reply-repository.js'
import { isOptedOut } from '../repositories/whatsapp-inbound-activity-repository.js'
import { getAppointmentRequestsByBotId } from '../repositories/appointment-request-repository.js'
import { getLeadState } from '../repositories/lead-state-repository.js'
import { AWAIT_REPLY_TIMEOUT_SECONDS } from './journey-compiler-service.js'
import { readJourneyLead, toLeadRef } from './lead-resolution-service.js'
import { sendHandoffAlert } from './notification-service.js'
import { appendLeadEvent } from '../repositories/lead-event-repository.js'
import { resolveTemplateParams } from '../lib/journey-template-params.js'
import { bookAppointment } from '../mcp/booking-mcp-server.js'
import { scheduleReminder } from '../mcp/reminder-mcp-server.js'
import { getQuotation } from '../mcp/quotation-mcp-server.js'
import { sendBrochure } from '../mcp/brochure-mcp-server.js'
import {
  hasActiveWhatsAppSession,
  sendWhatsAppMessageToLead,
  sendWhatsAppTemplateToLead,
} from './whatsapp-service.js'
import type {
  JourneyExecutorEvent,
  JourneyLead,
  JourneyOutcome,
  ResolvedConditionFields,
  WaitAndRecheckResult,
} from '../types/index.js'

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

  // Checked before anything else: a lead who asked to stop must not receive a
  // message, and a 60-90 day nurture journey will otherwise keep firing on
  // schedule long after they said so. This is the enforcement point -- opt-out
  // is recorded on the inbound side, honoured here.
  if (await isOptedOut(event.leadId)) {
    return { sent: false, reason: 'opted_out', message: 'Lead has opted out of WhatsApp messages.' }
  }

  // NOT getLeadById(event.botId, ...): that reads the chat leads table, so a
  // form or Meta lead resolved to null and every send reported no_phone_number
  // for a lead whose phone was on file. The event already carries leadSource
  // and leadParentId for exactly this.
  const lead = await readJourneyLead(toLeadRef(event), event.clientId)
  if (!lead?.phone) {
    return { sent: false, reason: 'no_phone_number', message: 'Lead has no phone number on file.' }
  }

  // Free text is preferred while the window is open -- it is free to send and
  // reads like a person. Outside the window Meta rejects free text outright
  // (error 131047), so the step's approved template is the only way through.
  if (await hasActiveWhatsAppSession(event.leadId)) {
    // Precedence, and it is the whole point of D12: the agent's grounded answer
    // to what the lead just said beats the step's authored hint, which beats the
    // generic default. `composedReply` arrives on the resume payload from the
    // turn handler, so this step sends the agent's words instead of a script and
    // the lead receives exactly one message for their message.
    const body = event.lastResult?.composedReply ?? event.messageHint ?? DEFAULT_SEND_MESSAGE_TEXT
    const result = await sendWhatsAppMessageToLead(event.clientId, lead.phone, body)

    // Recorded even when the send failed. "We tried and Meta refused" is the
    // single most useful thing a client can see in the timeline, and it is
    // invisible everywhere else: the Task output lives only in Step Functions
    // history, which expires and is not queryable by lead.
    await appendLeadEvent({
      leadId: event.leadId,
      clientId: event.clientId,
      botId: event.botId,
      type: 'message_out',
      channel: 'whatsapp',
      mode: 'free_text',
      body,
      bundleId: event.bundleId,
      stepId: event.stepId,
      ...(result.messageId ? { wamid: result.messageId } : {}),
      ...(result.success ? {} : { errorDetail: result.error }),
    })

    return { sent: result.success, ...result }
  }

  if (!event.whatsappTemplateName) {
    return {
      sent: false,
      reason: 'no_active_session',
      message:
        'Outside the 24h WhatsApp session window and this step names no approved template. ' +
        'Set whatsappTemplateName on the step to allow it to send here.',
    }
  }

  const params = resolveTemplateParams(event.whatsappTemplateParams ?? [], lead)
  const result = await sendWhatsAppTemplateToLead(event.clientId, lead.phone, event.whatsappTemplateName, params)

  await appendLeadEvent({
    leadId: event.leadId,
    clientId: event.clientId,
    botId: event.botId,
    type: 'message_out',
    channel: 'whatsapp',
    mode: 'template',
    templateName: event.whatsappTemplateName,
    body: event.messageHint ?? DEFAULT_SEND_MESSAGE_TEXT,
    bundleId: event.bundleId,
    stepId: event.stepId,
    ...(result.messageId ? { wamid: result.messageId } : {}),
    ...(result.success ? {} : { errorDetail: result.error }),
  })

  return { sent: result.success, viaTemplate: event.whatsappTemplateName, ...result }
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
  // leadSource/leadParentId ride along so a tool that needs to READ the lead
  // (booking, for the attendee name and email) can find it outside the chat
  // leads table. Optional on the way in, so pre-d024f8a executions still work.
  const shared = {
    botId: event.botId,
    clientId: event.clientId,
    leadId: event.leadId,
    ...(event.leadSource ? { leadSource: event.leadSource } : {}),
    ...(event.leadParentId ? { leadParentId: event.leadParentId } : {}),
  }

  const record = async (result: Record<string, unknown>): Promise<Record<string, unknown>> => {
    // The result is recorded verbatim rather than summarised: a booking carries
    // its calComBookingUid and a failure carries its reason, and both are what
    // a human reads when asking "did the agent actually do the thing".
    await appendLeadEvent({
      leadId: event.leadId,
      clientId: event.clientId,
      botId: event.botId,
      type: 'tool_call',
      bundleId: event.bundleId,
      stepId: event.stepId,
      toolName: event.toolName,
      result,
    })
    return result
  }

  switch (event.toolName) {
    case 'booking': {
      const timeZone = event.toolInput?.timeZone
      return record({
        ...(await bookAppointment({
          ...shared,
          requestedAt: requireStringField(event.toolInput, 'requestedAt'),
          ...(typeof timeZone === 'string' ? { timeZone } : {}),
        })),
      })
    }
    case 'reminder':
      return record({ ...(await scheduleReminder({ ...shared, remindAt: requireStringField(event.toolInput, 'remindAt') })) })
    case 'quotation':
      return record({ ...(await getQuotation(shared)) })
    case 'brochure':
      return record({ ...(await sendBrochure(shared)) })
    default:
      throw new Error(`tool_call has unknown toolName "${event.toolName}"`)
  }
}

// Only for the operations that produce no message of their own. send_message,
// tool_call and human_handoff already write richer events, so a generic step row
// for them would double every entry in the timeline. This is what puts "waiting
// for a reply" and "checking for a booking" on the client's screen, which is
// most of what makes an agent look like it is working rather than idle.
async function recordStep(event: JourneyExecutorEvent): Promise<void> {
  await appendLeadEvent({
    leadId: event.leadId,
    clientId: event.clientId,
    botId: event.botId,
    type: 'journey_step',
    bundleId: event.bundleId,
    stepId: event.stepId,
    body: event.operation,
  })
}

// The terminal event. Written by the compiler's synthetic __journey_* states,
// which every exit from the state machine now routes through -- there is no
// path that ends a journey without passing here.
//
// The whole point is the OUTCOME. journey_ended sat in LeadEventType for a
// month with zero call sites, so a journey that finished cleanly and one that
// crashed on its second step were indistinguishable in the data; a bare
// "it ended" row would have kept them that way.
async function handleJourneyEnded(event: JourneyExecutorEvent): Promise<{ ended: true; outcome: JourneyOutcome }> {
  // Defensive: the outcome is static in the compiled Parameters, so an absent
  // one means an execution started against an OLD state machine version that
  // predates this feature. Recording it as 'completed' would be a lie, and
  // dropping the event would leave the same blind spot -- so it fails loudly.
  const outcome = event.outcome
  if (!outcome) {
    throw new Error('journey_ended received no outcome — the state machine predates the terminal-event compiler')
  }

  await appendLeadEvent({
    leadId: event.leadId,
    clientId: event.clientId,
    botId: event.botId,
    type: 'journey_ended',
    bundleId: event.bundleId,
    outcome,
    ...(event.stepId ? { stepId: event.stepId } : {}),
    ...(event.executionArn ? { executionArn: event.executionArn } : {}),
    // Flattened to a string here rather than stored raw: `errorDetail` is what
    // the timeline already renders for a failed WhatsApp status, so a failed
    // journey reuses the same field and the same UI instead of inventing a
    // second shape for "what went wrong".
    ...(event.journeyError ? { errorDetail: summariseJourneyError(event.journeyError) } : {}),
  })

  return { ended: true, outcome }
}

// Step Functions hands a caught error as { Error, Cause }, where Cause is
// usually a JSON string carrying the Lambda's own errorMessage. Read
// defensively at every level: this runs on the failure path, and throwing here
// would replace a recorded failure with an unrecorded one.
function summariseJourneyError(raw: Record<string, unknown>): string {
  const errorName = typeof raw.Error === 'string' ? raw.Error : 'UnknownError'
  const cause = typeof raw.Cause === 'string' ? raw.Cause : undefined
  if (!cause) return errorName

  try {
    const parsed: unknown = JSON.parse(cause)
    if (parsed && typeof parsed === 'object' && 'errorMessage' in parsed) {
      const message = (parsed as { errorMessage?: unknown }).errorMessage
      if (typeof message === 'string') return `${errorName}: ${message}`
    }
  } catch {
    // Cause is not always JSON (States.Timeout, States.Runtime and friends
    // send a bare string). The raw text is the diagnostic either way.
  }
  return `${errorName}: ${cause}`.slice(0, 1000)
}

async function handleHumanHandoff(event: JourneyExecutorEvent): Promise<{ handedOff: true; notified: boolean }> {
  // The event is written FIRST and unconditionally. It is the durable record
  // that the agent stopped, and it has to survive a notification that never
  // lands -- otherwise a client with no WhatsApp connection would have a lead
  // silently abandoned with nothing in the timeline to show for it.
  await appendLeadEvent({
    leadId: event.leadId,
    clientId: event.clientId,
    botId: event.botId,
    type: 'handoff',
    bundleId: event.bundleId,
    stepId: event.stepId,
    ...(event.reason ? { reason: event.reason } : {}),
  })

  // Non-fatal by construction (see notification-service.ts): the journey has
  // already stopped talking to the lead by this point, so failing the
  // execution over an undelivered alert would strand them twice.
  const alert = await sendHandoffAlert({
    leadRef: toLeadRef(event),
    clientId: event.clientId,
    reason: event.reason ?? 'The agent handed this lead to a human.',
    trigger: 'hand_to_agent',
  })

  console.log(
    `[journey-executor] human_handoff: bot=${event.botId} bundle=${event.bundleId} lead=${event.leadId} step=${event.stepId} reason="${event.reason ?? ''}" notified=${alert.notified}${alert.skipReason ? ` skip=${alert.skipReason}` : ''}`
  )
  return { handedOff: true, notified: alert.notified }
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
// Whether the thing this step is waiting FOR has actually happened.
//
// Only appointment_booked is real. It became checkable when the Cal.com
// integration gave AppointmentRequest.status a genuine 'confirmed' transition
// instead of everything sitting at 'requested' forever.
//
// 'replied' and 'lead_score' still return false, and deliberately so: neither
// has anywhere to live yet. `replied` is largely superseded by await_reply,
// which waits on a reply directly rather than polling for one, and lead_score
// needs a scoring model nobody has specified. Returning false is honest about
// that; inventing a check that cannot mean anything would be worse.
async function isRecheckSatisfied(event: JourneyExecutorEvent): Promise<boolean> {
  if (event.recheckField !== 'appointment_booked') return false

  const requests = await getAppointmentRequestsByBotId(event.botId)
  return requests.some((request) => request.leadId === event.leadId && request.status === 'confirmed')
}

// Resolves the fields a condition step branches on, so the Choice that follows
// reads a path that exists.
//
// Before this, `condition` compiled to a Choice reading `$.replied` — a path
// nothing ever wrote into the execution state, because those values live in the
// lead_state table. Any journey containing a condition step therefore died at
// that state with States.Runtime, and ASL forbids Catch on a Choice, so it was
// the one failure that ended a journey with NO journey_ended event. Moving the
// read into a Task fixes both halves: the path exists, and the Task carries the
// catch-all like every other Task.
//
// Missing state is not an error. A lead with no lead_state row simply has not
// replied, has no score and has not booked — which is the correct answer for a
// fresh lead, not a reason to fail their journey.
async function handleResolveCondition(event: JourneyExecutorEvent): Promise<ResolvedConditionFields> {
  const state = await getLeadState(event.leadId).catch((error) => {
    // Read failures are NOT swallowed into "false": that would silently send
    // every lead down the onFalse branch during an outage, which looks like
    // working software making wrong decisions. Failing is loud and recorded.
    throw new Error(`resolve_condition could not read lead state for ${event.leadId}: ${errorText(error)}`)
  })

  // appointment_booked prefers the lead_state flag but falls back to the
  // appointment_requests table, which is where a confirmed booking actually
  // lands today — the same source isRecheckSatisfied already trusts.
  const booked =
    state?.appointmentBooked ??
    (await getAppointmentRequestsByBotId(event.botId)
      .then((requests) => requests.some((r) => r.leadId === event.leadId && r.status === 'confirmed'))
      .catch(() => false))

  return {
    replied: String(state?.replied ?? false),
    lead_score: String(state?.leadScore ?? 0),
    appointment_booked: String(booked),
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function handleWaitAndRecheckCheck(event: JourneyExecutorEvent): Promise<WaitAndRecheckResult> {
  if (!event.stepId || event.maxIterations === undefined) {
    throw new Error('wait_and_recheck_check event missing stepId or maxIterations')
  }

  // Satisfaction is checked BEFORE the counter is consumed, so a lead who books
  // on the final permitted iteration still takes onSatisfied rather than being
  // marked exhausted on the same tick that their booking landed.
  const satisfied = await isRecheckSatisfied(event)
  const iterationCount = await incrementWaitAndRecheckIteration(event.leadId, event.stepId)

  return {
    satisfied,
    exhausted: !satisfied && iterationCount >= event.maxIterations,
  }
}

// Parks the execution on the lead. Unlike every other handler, this one's
// return value never reaches the state machine: with the callback pattern the
// execution resumes only on SendTaskSuccess, so the ONLY thing that matters
// here is that the token is durably stored before this returns. If the write
// fails, throwing is correct and deliberate -- a Lambda error fails the task,
// which is far better than returning cleanly and leaving an execution parked on
// a token nobody recorded, unresumable until it times out 24 hours later.
async function handleAwaitReply(event: JourneyExecutorEvent): Promise<Record<string, unknown>> {
  if (!event.taskToken || !event.stepId) {
    throw new Error('await_reply event missing taskToken or stepId')
  }

  const now = Date.now()
  await claimPendingReply({
    leadId: event.leadId,
    taskToken: event.taskToken,
    bundleId: event.bundleId,
    stepId: event.stepId,
    botId: event.botId,
    clientId: event.clientId,
    createdAt: new Date(now).toISOString(),
    // Outlives the execution's own timeout by an hour so the row is still
    // around to be read (and recognised as expired) rather than vanishing
    // first. DynamoDB TTL then reclaims it without anyone having to notice.
    expiresAt: Math.floor(now / 1000) + AWAIT_REPLY_TIMEOUT_SECONDS + 3600,
  })

  return { awaiting: true, stepId: event.stepId }
}

export async function executeJourneyStep(event: JourneyExecutorEvent): Promise<Record<string, unknown>> {
  switch (event.operation) {
    case 'send_message':
      return handleSendMessage(event)
    case 'tool_call':
      return handleToolCall(event)
    case 'human_handoff':
      return handleHumanHandoff(event)
    case 'await_reply':
      await recordStep(event)
      return handleAwaitReply(event)
    case 'wait_and_recheck_check':
      await recordStep(event)
      return { ...(await handleWaitAndRecheckCheck(event)) }
    // No recordStep: the terminal event IS the record, and a generic
    // journey_step row beside it would double the ending in the timeline.
    case 'journey_ended':
      return handleJourneyEnded(event)
    // No recordStep: this is plumbing for the Choice that follows, not a step
    // the client authored, and a timeline row for it would be noise.
    case 'resolve_condition':
      return { ...(await handleResolveCondition(event)) }
  }
}
