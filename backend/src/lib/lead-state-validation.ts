import type { LeadOutcome, LeadRef, LeadStatus } from '../types/index.js'
import type { LeadStatePatch } from '../repositories/lead-state-repository.js'

// Request parsing for the lead-state endpoints. Lives here rather than in
// lead-routes.ts because CLAUDE.md's layering rule is explicit -- a route
// handler holds no logic -- and because untrusted-input parsing is exactly
// the code that earns unit tests. The route now only maps the result to a
// status code.

const LEAD_STATUSES: readonly LeadStatus[] = ['new', 'contacted', 'qualified', 'closed']
const LEAD_OUTCOMES: readonly LeadOutcome[] = ['won', 'lost', 'unreachable']

export class LeadStateValidationError extends Error {}

// A LeadRef arrives from the client because the inbox handed it out -- it names
// the table AND the parent key, which is the only way to read a lead back
// without knowing its source in advance. It is still fully re-validated here,
// and the service re-checks ownership against the lead record itself.
export function parseLeadRef(raw: unknown): LeadRef | null {
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
export function parseStatePatch(body: Record<string, unknown>): LeadStatePatch {
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

