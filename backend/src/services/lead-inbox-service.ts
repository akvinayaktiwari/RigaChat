import { getLeadsByClientId } from '../repositories/lead-repository.js'
import { getFormLeadsByClientId } from '../repositories/form-lead-repository.js'
import { getMetaLeadsByClientId } from '../repositories/meta-lead-repository.js'
import {
  appendLeadNote,
  getLeadStatesForClient,
  upsertLeadState,
  type LeadStatePatch,
} from '../repositories/lead-state-repository.js'
import {
  normalizeChatLead,
  normalizeFormLead,
  normalizeMetaLead,
  readJourneyLead,
} from './lead-resolution-service.js'
import type { LeadRef, LeadState, UnifiedLead } from '../types/index.js'

// One inbox across chat, form and Meta leads.
//
// All three tables already carry a clientId index, so this is three parallel
// queries and a merge -- no new table and no migration. The per-source pages
// this replaces existed only because the three record shapes were never
// normalized in the read path; normalizeChatLead/FormLead/MetaLead in
// lead-resolution-service.ts is that normalization, already written for the
// journey layer.
const META_INBOX_LIMIT = 500

export async function getUnifiedInbox(clientId: string): Promise<UnifiedLead[]> {
  const [chatLeads, formLeads, metaLeads, states] = await Promise.all([
    getLeadsByClientId(clientId),
    getFormLeadsByClientId(clientId),
    getMetaLeadsByClientId(clientId, META_INBOX_LIMIT),
    getLeadStatesForClient(clientId),
  ])

  const stateByLeadId = new Map(states.map((state) => [state.leadId, state]))
  const read = (leadId: string): LeadState | null => stateByLeadId.get(leadId) ?? null

  const unified: UnifiedLead[] = [
    ...chatLeads.map((lead) => ({
      ...normalizeChatLead(lead),
      leadRef: { source: 'chat', botId: lead.botId, leadId: lead.leadId } as LeadRef,
      createdAt: lead.createdAt,
      state: read(lead.leadId),
    })),
    ...formLeads.map((lead) => ({
      ...normalizeFormLead(lead),
      leadRef: { source: 'form', formId: lead.formId, leadId: lead.leadId } as LeadRef,
      createdAt: lead.createdAt,
      state: read(lead.leadId),
    })),
    ...metaLeads.map((lead) => ({
      ...normalizeMetaLead(lead),
      leadRef: { source: 'meta', pageId: lead.pageId, leadId: lead.leadId } as LeadRef,
      createdAt: lead.createdAt,
      state: read(lead.leadId),
    })),
  ]

  return unified.sort(compareByUrgency)
}

// Lower tier = needs you sooner. This is the one design decision that makes the
// inbox a queue instead of a table: a recency-sorted list buries the lead you
// promised to call back yesterday under leads that just arrived.
const TIER_OVERDUE = 0
const TIER_UNTOUCHED = 1
const TIER_SCHEDULED = 2
const TIER_IN_PROGRESS = 3
const TIER_CLOSED = 4

function urgencyTier(lead: UnifiedLead, now: number): number {
  const state = lead.state
  if (state?.status === 'closed') return TIER_CLOSED
  if (state?.nextActionAt) {
    return Date.parse(state.nextActionAt) <= now ? TIER_OVERDUE : TIER_SCHEDULED
  }
  // No state row at all means nobody has opened it yet -- same as 'new'.
  if (!state || state.status === 'new') return TIER_UNTOUCHED
  return TIER_IN_PROGRESS
}

// Within a tier, the ordering that makes the tier actionable: due work oldest
// first, waiting leads oldest first (they are going cold), and finished or
// in-flight work newest first.
function compareWithinTier(a: UnifiedLead, b: UnifiedLead, tier: number): number {
  if (tier === TIER_OVERDUE || tier === TIER_SCHEDULED) {
    return Date.parse(a.state?.nextActionAt ?? '') - Date.parse(b.state?.nextActionAt ?? '')
  }
  if (tier === TIER_UNTOUCHED) {
    return Date.parse(a.createdAt) - Date.parse(b.createdAt)
  }
  return Date.parse(b.createdAt) - Date.parse(a.createdAt)
}

function compareByUrgency(a: UnifiedLead, b: UnifiedLead): number {
  const now = Date.now()
  const tierA = urgencyTier(a, now)
  const tierB = urgencyTier(b, now)
  if (tierA !== tierB) return tierA - tierB
  return compareWithinTier(a, b, tierA)
}

// Ownership is checked against the LEAD, not against the lead_state row: an
// untouched lead has no state row yet, so trusting the row's clientId would
// let the first writer claim any leadId they can guess. readJourneyLead is the
// same read the journey layer uses, so a lead that cannot be resolved here
// cannot be acted on there either.
async function assertLeadOwnedByClient(leadRef: LeadRef, clientId: string): Promise<void> {
  const lead = await readJourneyLead(leadRef)
  // 404 either way (missing vs. owned by someone else) -- don't reveal
  // existence to a non-owner. Mirrors lead-service.ts's getLeadDetail.
  if (!lead || lead.clientId !== clientId) {
    throw new Error('Lead not found')
  }
}

export async function updateLeadStateForClient(
  leadRef: LeadRef,
  clientId: string,
  patch: LeadStatePatch
): Promise<LeadState> {
  await assertLeadOwnedByClient(leadRef, clientId)

  // Any operator-driven state change is a touch. Recorded here rather than by
  // each caller so lastTouchedAt cannot drift from the change that caused it.
  return upsertLeadState(leadRef.leadId, clientId, {
    ...patch,
    lastTouchedAt: new Date().toISOString(),
  })
}

export async function addLeadNoteForClient(
  leadRef: LeadRef,
  clientId: string,
  body: string,
  authorId: string
): Promise<LeadState> {
  await assertLeadOwnedByClient(leadRef, clientId)
  return appendLeadNote(leadRef.leadId, clientId, body, authorId)
}
