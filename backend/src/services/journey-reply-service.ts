import {
  clearPendingReply,
  getPendingReply,
} from '../repositories/journey-pending-reply-repository.js'
import {
  consumeResumeAllowance,
  isOptedOut,
  recordOptOut,
} from '../repositories/whatsapp-inbound-activity-repository.js'
import { failAwaitingExecution, resumeAwaitingExecution } from '../lib/step-functions.js'

// -------------------------------------------------------------------------
// Where an inbound WhatsApp message meets a paused journey.
//
// This is the half of the conversation the engine could not previously have:
// send_message talks AT a lead, and await_reply is what lets the journey act on
// what they say back.
// -------------------------------------------------------------------------

// Matched against the whole message, trimmed and lowercased -- not a substring
// search. "STOP" must opt out; "stop by the site office on Sunday?" must not.
// Meta's own opt-out vocabulary plus the two most common natural phrasings.
const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'opt out',
  'optout',
  'remove me',
  'do not contact me',
])

// Deliberately loose: a journey reaching several await_reply steps in an hour is
// normal conversation, while hundreds are not. See consumeResumeAllowance for
// why this is a backstop rather than the real control.
const MAX_RESUMES_PER_WINDOW = 20
const RESUME_WINDOW_MS = 60 * 60 * 1000

export type InboundReplyOutcome =
  | { handled: 'resumed'; bundleId: string; stepId: string }
  | { handled: 'opted_out'; stoppedJourney: boolean }
  | { handled: 'no_pending_journey' }
  | { handled: 'rate_limited' }
  | { handled: 'stale_token'; reason: 'token_expired' | 'token_unknown' }

export function isOptOutMessage(text: string): boolean {
  return OPT_OUT_KEYWORDS.has(text.trim().toLowerCase().replace(/[.!]+$/, ''))
}

// Never throws. It is called from the Gupshup webhook handler, where a failure
// would turn a successfully-received message into a 500 and make Gupshup redeliver
// something we already have. Callers get a structured outcome instead.
export async function handleInboundLeadMessage(leadId: string, text: string): Promise<InboundReplyOutcome> {
  // Opt-out is checked BEFORE the pending-reply lookup, and short-circuits it.
  // Treating "STOP" as a conversational reply would advance the journey and send
  // the next message -- responding to a request to stop by messaging them again.
  if (isOptOutMessage(text)) {
    return handleOptOut(leadId)
  }

  // A lead who opted out previously stays opted out; their later messages must
  // not quietly resume a journey they asked to leave.
  if (await isOptedOut(leadId)) {
    return { handled: 'no_pending_journey' }
  }

  const pending = await getPendingReply(leadId)
  if (!pending) {
    return { handled: 'no_pending_journey' }
  }

  // The binding that makes a forged webhook near-useless: an inbound message can
  // only advance a journey that is genuinely parked on THIS lead, using a token
  // this system stored itself. It cannot start a journey, skip a step, choose a
  // branch, or resume someone else's.
  if (!(await consumeResumeAllowance(leadId, MAX_RESUMES_PER_WINDOW, RESUME_WINDOW_MS))) {
    console.warn(`[journey-reply] lead ${leadId} exceeded the resume allowance; not resuming`)
    return { handled: 'rate_limited' }
  }

  const result = await resumeAwaitingExecution(pending.taskToken, {
    replied: true,
    message: text,
    repliedAt: new Date().toISOString(),
  })

  // Clear regardless of outcome: the token is single-use, and a stale one is
  // worse than none -- leaving it would let a later message attempt a resume
  // that can only ever fail.
  await clearPendingReply(leadId, pending.taskToken)

  if (!result.resumed) {
    return { handled: 'stale_token', reason: result.reason }
  }

  return { handled: 'resumed', bundleId: pending.bundleId, stepId: pending.stepId }
}

// Records the opt-out first, then abandons any paused execution. That order
// matters: if the second step fails, the lead is still opted out and every
// future send is blocked, which is the outcome that actually protects them.
// Doing it the other way round could leave a lead un-opted-out.
async function handleOptOut(leadId: string): Promise<InboundReplyOutcome> {
  await recordOptOut(leadId)

  const pending = await getPendingReply(leadId)
  if (!pending) {
    return { handled: 'opted_out', stoppedJourney: false }
  }

  // Fail rather than succeed the task, so the journey takes an error path
  // instead of continuing down `next` and sending the follow-up message.
  const result = await failAwaitingExecution(
    pending.taskToken,
    'LeadOptedOut',
    `Lead ${leadId} asked to stop receiving messages`
  )
  await clearPendingReply(leadId, pending.taskToken)

  return { handled: 'opted_out', stoppedJourney: result.resumed }
}
