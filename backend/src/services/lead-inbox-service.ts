import { getLeadById, getLeadsByClientId } from '../repositories/lead-repository.js'
import { getFormLeadById, getFormLeadsByClientId } from '../repositories/form-lead-repository.js'
import { getFormsByClientId, getPublicFormConfig } from '../repositories/form-repository.js'
import { getMetaLeadById, getMetaLeadsByClientId } from '../repositories/meta-lead-repository.js'
import {
  appendLeadNote,
  getLeadState,
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
import type { FormField, LeadRef, LeadState, UnifiedLead, UnifiedLeadDetail } from '../types/index.js'

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
  // The client's forms come along because a form lead's answers are keyed by
  // fieldId -- without the field definitions every form row renders as
  // "Unnamed lead / No contact". One query for all of them, not one per lead.
  const [chatLeads, formLeads, metaLeads, states, forms] = await Promise.all([
    getLeadsByClientId(clientId),
    getFormLeadsByClientId(clientId),
    getMetaLeadsByClientId(clientId, META_INBOX_LIMIT),
    getLeadStatesForClient(clientId),
    getFormsByClientId(clientId),
  ])

  const stateByLeadId = new Map(states.map((state) => [state.leadId, state]))
  const read = (leadId: string): LeadState | null => stateByLeadId.get(leadId) ?? null
  const fieldsByFormId = new Map<string, FormField[]>(forms.map((form) => [form.formId, form.fields]))

  const unified: UnifiedLead[] = [
    ...chatLeads.map((lead) => ({
      ...normalizeChatLead(lead),
      leadRef: { source: 'chat', botId: lead.botId, leadId: lead.leadId } as LeadRef,
      createdAt: lead.createdAt,
      state: read(lead.leadId),
    })),
    ...formLeads.map((lead) => ({
      ...normalizeFormLead(lead, fieldsByFormId.get(lead.formId)),
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

  // `now` is read ONCE, not inside the comparator. Array.sort calls the
  // comparator O(n log n) times, and a comparator that reads the clock is not a
  // stable total order: a lead whose nextActionAt straddles the current instant
  // can compare inconsistently between two calls within the same sort.
  const now = Date.now()
  return unified.sort((a, b) => compareByUrgency(a, b, now))
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

function compareByUrgency(a: UnifiedLead, b: UnifiedLead, now: number): number {
  const tierA = urgencyTier(a, now)
  const tierB = urgencyTier(b, now)
  if (tierA !== tierB) return tierA - tierB
  return compareWithinTier(a, b, tierA)
}

// A malformed customFields blob must not 404 the lead -- the same posture
// lead-resolution-service.ts takes. The operator still gets the contact fields
// and the notes, which is most of why they opened the page.
function parseCustomFields(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

// customFields keys are fieldIds. Swap each for its form label so the workspace
// shows "Budget: 3 BHK" instead of "6baea1e9-9d03-...: 3 BHK". Unmatched keys
// are kept as-is: an answer whose field was since deleted from the form is
// still an answer somebody gave.
function labelCustomFields(
  values: Record<string, string>,
  formFields: FormField[] | undefined
): Record<string, string> {
  if (!formFields) return values
  const labelByFieldId = new Map(formFields.map((field) => [field.fieldId, field.label]))
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [labelByFieldId.get(key) ?? key, value])
  )
}

// Everything the workspace needs out of the source record, from ONE read of it.
// Deliberately not readJourneyLead + a second fetch for the extras: that would
// read the same row twice per page load to assemble one object.
type SourceRecord = Omit<UnifiedLeadDetail, 'leadRef' | 'state'>

async function readSourceRecord(leadRef: LeadRef): Promise<SourceRecord | null> {
  switch (leadRef.source) {
    case 'chat': {
      const lead = await getLeadById(leadRef.botId, leadRef.leadId)
      if (!lead) return null
      return { ...normalizeChatLead(lead), createdAt: lead.createdAt, chatTranscript: lead.chatTranscript }
    }
    case 'form': {
      const lead = await getFormLeadById(leadRef.formId, leadRef.leadId)
      if (!lead) return null
      const form = await getPublicFormConfig(leadRef.formId)
      return {
        ...normalizeFormLead(lead, form?.fields),
        createdAt: lead.createdAt,
        // Relabelled for display: the raw map is keyed by fieldId, which is a
        // UUID no human wants to read next to their answer.
        customFields: labelCustomFields(parseCustomFields(lead.customFields), form?.fields),
      }
    }
    case 'meta': {
      const lead = await getMetaLeadById(leadRef.pageId, leadRef.leadId)
      if (!lead) return null
      return {
        ...normalizeMetaLead(lead),
        createdAt: lead.createdAt,
        customFields: parseCustomFields(lead.customFields),
      }
    }
  }
}

export async function getUnifiedLeadDetail(
  leadRef: LeadRef,
  clientId: string
): Promise<UnifiedLeadDetail> {
  const [record, state] = await Promise.all([readSourceRecord(leadRef), getLeadState(leadRef.leadId)])

  // 404 either way (missing vs. owned by someone else) -- don't reveal
  // existence to a non-owner. Mirrors lead-service.ts's getLeadDetail.
  if (!record || record.clientId !== clientId) {
    throw new Error('Lead not found')
  }

  return { ...record, leadRef, state }
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
