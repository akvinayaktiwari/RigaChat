import { getJourneyBundleById } from '../repositories/journey-repository.js'
import {
  getJourneyTriggerClaim,
  triggerClaimKey,
} from '../repositories/journey-trigger-claim-repository.js'
import { appendLeadEvent } from '../repositories/lead-event-repository.js'
import { executionNameFor, startExecution } from '../lib/step-functions.js'
import { resolveLeadAgentContext } from './lead-resolution-service.js'
import type {
  JourneyBundle,
  JourneyChannel,
  JourneyTriggerType,
  LeadRef,
  LeadResolutionFailureReason,
} from '../types/index.js'

// -------------------------------------------------------------------------
// The ignition point. Before this existed, JourneyTriggerType was a stored
// field with nothing that ever read it: publishJourneyBundle never provisioned
// a state machine and nothing in the repo called StartExecution, so a captured
// lead got a CRM sync and a notification to the client and then simply stopped.
//
// Deliberately ONE named entry point, called from the capture services. That
// confinement is the whole design: moving to DynamoDB Streams later replaces
// this function's callers, not the function or anything downstream of it.
// -------------------------------------------------------------------------

export type IgnitionOutcome =
  | { status: 'started'; bundleId: string; executionArn: string; journeyVersion: number }
  // A retried ignition lands here rather than starting a second journey. Note
  // this is a best-effort LABEL: the no-duplicate guarantee comes from AWS
  // (StartExecution is idempotent by execution name, and ours is deterministic),
  // not from this branch. See NEW_EXECUTION_SKEW_TOLERANCE_MS in
  // lib/step-functions.ts for the case that reports 'started' on a retry.
  | { status: 'already_started'; bundleId: string }
  | { status: 'no_match'; reason: NoMatchReason }
  | { status: 'failed'; reason: string }

export type NoMatchReason =
  | LeadResolutionFailureReason
  | 'no_published_journey'
  | 'journey_not_published'

export interface IgniteJourneyInput {
  leadRef: LeadRef
  clientId: string
  triggerType?: JourneyTriggerType
}

// Never throws. A journey-layer failure must not take down lead capture: the
// lead is the thing of value and it is already saved by the time we get here.
// But it must not vanish either -- every non-start returns a structured reason
// so the caller can record it against the lead. "Lead captured, never followed
// up" is the exact failure this product exists to prevent, and making it
// invisible would be reproducing it with our own logo on it.
export async function igniteJourneysForLead(input: IgniteJourneyInput): Promise<IgnitionOutcome> {
  try {
    return await ignite(input)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(`[ignition] failed for lead ${input.leadRef.leadId}:`, error)
    return { status: 'failed', reason }
  }
}

async function ignite(input: IgniteJourneyInput): Promise<IgnitionOutcome> {
  const triggerType = input.triggerType ?? 'lead_captured'

  const resolution = await resolveLeadAgentContext(input.leadRef, input.clientId)
  if (!resolution.resolved) {
    return { status: 'no_match', reason: resolution.reason }
  }
  const { context } = resolution

  // The trigger-claim row doubles as the ignition index. Because exactly one
  // published bundle may hold a given (Agent, trigger), "which journey runs for
  // this lead" is a single point read rather than a query-and-choose -- and the
  // ambiguity that would need resolving at ignition time was already made
  // impossible at publish time.
  const claim = await getJourneyTriggerClaim(
    triggerClaimKey({ agentId: context.agentId, botId: context.botId }, triggerType)
  )
  if (!claim) {
    return { status: 'no_match', reason: 'no_published_journey' }
  }

  const bundle = await getJourneyBundleById(claim.botId, claim.bundleId)
  if (!bundle || bundle.status !== 'published' || !bundle.compiledStateMachineVersionArn) {
    // The claim outlived its bundle, or the bundle was edited back to draft
    // between the claim read and this one. Reported rather than repaired here:
    // silently deleting another process's claim is how races get worse.
    return { status: 'no_match', reason: 'journey_not_published' }
  }

  const journeyVersion = bundle.publishedVersion ?? 1

  const result = await startExecution(
    bundle.compiledStateMachineVersionArn,
    executionNameFor(context.leadId, bundle.bundleId, journeyVersion),
    {
      botId: context.botId,
      bundleId: bundle.bundleId,
      clientId: context.clientId,
      leadId: context.leadId,
      channel: resolveChannel(bundle),
      leadSource: input.leadRef.source,
      leadParentId: leadParentIdOf(input.leadRef),
      journeyVersion,
      // Seeded empty so the compiled 'lastResult.$' passthrough resolves on the
      // FIRST state, before any Task has produced a result. Without it the very
      // first send_message dies with States.Runtime on a path that does not
      // exist yet.
      lastResult: {},
    }
  )

  if (!result.started) {
    return { status: 'already_started', bundleId: bundle.bundleId }
  }

  await appendLeadEvent({
    leadId: context.leadId,
    clientId: context.clientId,
    botId: context.botId,
    type: 'journey_started',
    bundleId: bundle.bundleId,
    body: bundle.name,
  })

  return {
    status: 'started',
    bundleId: bundle.bundleId,
    executionArn: result.executionArn,
    journeyVersion,
  }
}

// Which parent key locates this lead's record. Kept next to LeadRef's own
// definition in spirit: adding a fourth lead source means this switch stops
// compiling, which is the point.
function leadParentIdOf(leadRef: LeadRef): string {
  switch (leadRef.source) {
    case 'chat':
      return leadRef.botId
    case 'form':
      return leadRef.formId
    case 'meta':
      return leadRef.pageId
  }
}

// A JourneyDefinition does not declare its delivery channel yet, so it is
// inferred from what the Agent is configured for. WhatsApp wins when present
// because it is the only channel that can actually deliver a journey-initiated
// message -- the web widget is strictly request-response with no push path, so
// a send there would be a silent no-op. Worth replacing with an explicit
// channel on the journey once a second deliverable channel exists.
function resolveChannel(bundle: JourneyBundle): JourneyChannel {
  return bundle.agent.channelConfig.whatsapp ? 'whatsapp' : 'web_widget'
}
