import { deleteLead } from '../repositories/lead-repository.js'
import { deleteFormLead } from '../repositories/form-lead-repository.js'
import { deleteMetaLead } from '../repositories/meta-lead-repository.js'
import { deleteLeadState } from '../repositories/lead-state-repository.js'
import { deleteAllEventsForLead } from '../repositories/lead-event-repository.js'
import { deleteExecutionCountersForLead } from '../repositories/journey-execution-repository.js'
import { deletePendingReply } from '../repositories/journey-pending-reply-repository.js'
import { deleteInboundActivity } from '../repositories/whatsapp-inbound-activity-repository.js'
import { executionArnFor, executionNameFor, stopExecution } from '../lib/step-functions.js'
import { getActiveJourneys } from './journey-service.js'
import { readJourneyLead } from './lead-resolution-service.js'
import type { LeadRef } from '../types/index.js'

export class LeadNotFoundError extends Error {
  constructor(leadId: string) {
    super(`Lead ${leadId} not found`)
    this.name = 'LeadNotFoundError'
  }
}

export interface LeadErasureReport {
  leadId: string
  source: LeadRef['source']
  eventsDeleted: number
  executionsStopped: number
}

// Stops every journey that could still be messaging this lead.
//
// The execution name is a deterministic hash of leadId:bundleId:version
// (executionNameFor), so it can be RECOMPUTED rather than searched for -- for
// each of the client's live journeys we know exactly what this lead's execution
// would be called, and can stop it by name. The alternative, letting the
// execution discover mid-flight that its lead vanished, means the journey fails
// some minutes later and writes a journey_ended event for a lead that no longer
// exists.
async function stopJourneysForLead(leadId: string, clientId: string): Promise<number> {
  const bundles = await getActiveJourneys(clientId).catch((error) => {
    // A journey we cannot enumerate is a journey we cannot stop, and that must
    // not block an erasure: the deletion is the obligation, the stop is
    // best-effort cleanup on top of it.
    console.error(`[erasure] could not list journeys for client ${clientId}:`, error)
    return []
  })

  let stopped = 0
  for (const bundle of bundles) {
    if (!bundle.compiledStateMachineArn) continue
    const executionName = executionNameFor(leadId, bundle.bundleId, bundle.publishedVersion ?? 1)
    const arn = executionArnFor(bundle.compiledStateMachineArn, executionName)
    if (await stopExecution(arn, 'Lead data erased at the operator\'s request')) stopped += 1
  }
  return stopped
}

// Irreversible. Removes the lead and everything keyed by its leadId.
//
// ORDERING IS THE DESIGN. Each step is placed so that failing it leaves the
// erasure RETRYABLE rather than half-done and unfindable:
//
//   1. ownership     -- fail closed before touching anything
//   2. stop journeys -- so nothing writes new rows while we delete
//   3. side tables   -- pending replies, WhatsApp activity, counters, events,
//                       state
//   4. the lead row  -- LAST, because it is the only thing that can still
//                       address the leftovers. Deleting it first would strand
//                       every side-table row with no way to find them again.
export async function eraseLead(leadRef: LeadRef, clientId: string): Promise<LeadErasureReport> {
  const lead = await readJourneyLead(leadRef, clientId)
  // 404 for missing AND for someone else's, exactly like getUnifiedLeadDetail:
  // a delete endpoint that distinguishes them is an existence oracle.
  if (!lead || lead.clientId !== clientId) throw new LeadNotFoundError(leadRef.leadId)

  const executionsStopped = await stopJourneysForLead(leadRef.leadId, clientId)

  await deletePendingReply(leadRef.leadId)
  await deleteInboundActivity(leadRef.leadId)
  await deleteExecutionCountersForLead(leadRef.leadId)
  // The audit record, and the only place the person's actual message bodies
  // live. Deleting it is the point of an erasure rather than an archive.
  const eventsDeleted = await deleteAllEventsForLead(leadRef.leadId)
  await deleteLeadState(leadRef.leadId)

  switch (leadRef.source) {
    case 'chat':
      await deleteLead(leadRef.botId, leadRef.leadId)
      break
    case 'form':
      await deleteFormLead(leadRef.formId, leadRef.leadId)
      break
    case 'meta':
      await deleteMetaLead(clientId, leadRef.leadId)
      break
  }

  return { leadId: leadRef.leadId, source: leadRef.source, eventsDeleted, executionsStopped }
}
