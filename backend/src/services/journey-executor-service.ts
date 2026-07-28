import { incrementWaitAndRecheckIteration } from '../repositories/journey-execution-repository.js'
import type { JourneyExecutorEvent, WaitAndRecheckResult } from '../types/index.js'

// The Lambda handler journey-compiler-service.ts's compiled Task states
// actually invoke (via journeyExecutorLambdaArn) -- see backend/index.ts's
// dispatch. Only wait_and_recheck_check is fully real right now;
// send_message/tool_call/human_handoff are deliberate stubs (agreed scope:
// prove the Journey/Step-Functions loop end-to-end before building the real
// channel-send integration and MCP toolbox, which are their own, larger
// pieces of undesigned work -- see TODOS.md).

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

async function handleToolCall(event: JourneyExecutorEvent): Promise<{ stub: true }> {
  // STUB: real implementation dispatches into the MCP toolbox (booking,
  // quotation, brochure, reminder per the approved design) -- none of
  // those capabilities exist yet. event.toolName is intentionally not
  // validated against anything real here; journey-service.ts already
  // validated it against the bundle's mcpToolbox at save time.
  console.log(
    `[journey-executor] STUB tool_call: bot=${event.botId} bundle=${event.bundleId} lead=${event.leadId} tool=${event.toolName}`,
    event.toolInput
  )
  return { stub: true }
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
