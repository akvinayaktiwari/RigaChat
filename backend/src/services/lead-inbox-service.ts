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
import type { FormField, LeadRef, LeadState, UnifiedLead, UnifiedLeadDetail,
  LeadEvent,
  UrgencyTier,
  UnifiedInboxPage,
} from '../types/index.js'
import { getLeadEvents } from '../repositories/lead-event-repository.js'

// One inbox across chat, form and Meta leads.
//
// All three tables already carry a clientId index, so this is three parallel
// queries and a merge -- no new table and no migration. The per-source pages
// this replaces existed only because the three record shapes were never
// normalized in the read path; normalizeChatLead/FormLead/MetaLead in
// lead-resolution-service.ts is that normalization, already written for the
// journey layer.
const META_INBOX_LIMIT = 500

// NO DEFAULT PAGE SIZE. Omitting `limit` returns the whole inbox, exactly as
// this endpoint behaved before pagination existed.
//
// That looks like the wrong default and is the right one here, for two reasons:
//
//   1. The web CRM calls this with no limit and renders every lead. Defaulting
//      to a page would silently truncate a dashboard -- a client with 300 leads
//      would quietly lose 250 of them, with no error anywhere.
//   2. Paging does NOT reduce the read. Every page re-runs the full
//      cross-table fetch and sort, so a client fetching 5 pages costs 5 scans.
//      Making the web loop over pages to rebuild the full list would multiply
//      its backend cost by the page count for no benefit.
//
// So pagination is OPT-IN, and the caller that opts in is the phone, where the
// payload over mobile data is what actually hurts. The footgun -- a new client
// forgetting `limit` and pulling everything -- is the pre-existing behaviour,
// not a regression this introduces.
const MAX_PAGE_SIZE = 200

export interface InboxQuery {
  limit?: number
  cursor?: string
}

// A cursor is the sort POSITION of the last lead on the previous page, not an
// offset. An offset silently skips or repeats a lead when the list changes
// mid-scroll, which on a lead inbox means never seeing one that arrived.
//
// Opaque to callers on purpose: the encoding is an implementation detail and a
// client that parses it will break when the sort changes.
function encodeCursor(position: InboxPosition): string {
  return Buffer.from(JSON.stringify(position)).toString('base64url')
}

function decodeCursor(cursor: string): InboxPosition | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const { rank, sortKey, leadId } = parsed as Record<string, unknown>
    if (typeof rank !== 'number' || typeof sortKey !== 'number' || typeof leadId !== 'string') return null
    return { rank, sortKey, leadId }
  } catch {
    return null
  }
}

// WHAT THIS FIXES AND WHAT IT DOES NOT.
//
//   Fixed: the RESPONSE. A client with several thousand leads was sent all of
//   them on every app open, over mobile data, to render the first five rows.
//
//   NOT fixed: the READ. This still queries every chat lead, every form lead,
//   the capped Meta leads, every lead state and every form, then sorts in
//   memory -- because a global urgency order across three tables with three
//   different partition keys cannot be pushed down to DynamoDB. Making the read
//   cheap needs a materialised inbox table, which is its own project.
//
//   That split is deliberate: the payload is what the user feels on a phone,
//   and it is fixable today without touching the data model.
export async function getUnifiedInbox(clientId: string, query: InboxQuery = {}): Promise<UnifiedInboxPage> {
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

  const unified: SortableLead[] = [
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
  const sorted: UnifiedLead[] = unified
    .sort((a, b) => compareByUrgency(a, b, now))
    // Stamped AFTER the sort, so the value a client renders is provably the
    // same one that decided the row's position.
    .map((lead) => ({ ...lead, urgencyTier: urgencyTierOf(lead, now) }))

  const after = query.cursor ? decodeCursor(query.cursor) : null
  // An unreadable cursor starts from the top rather than erroring. A client
  // holding a stale cursor after a deploy should see their inbox, not a 400.
  const start = after ? sorted.findIndex((lead) => comparePositions(positionOf(lead, now), after) > 0) : 0
  const from = start === -1 ? sorted.length : start

  const limit = query.limit === undefined ? sorted.length : Math.min(Math.max(query.limit, 1), MAX_PAGE_SIZE)
  const page = sorted.slice(from, from + limit)
  const last = page[page.length - 1]
  const hasMore = from + page.length < sorted.length

  return {
    leads: page,
    total: sorted.length,
    ...(hasMore && last ? { nextCursor: encodeCursor(positionOf(last, now)) } : {}),
  }
}

// Lower tier = needs you sooner. This is the one design decision that makes the
// inbox a queue instead of a table: a recency-sorted list buries the lead you
// promised to call back yesterday under leads that just arrived.
// Rank drives the sort; the NAME goes on the wire. Clients used to recompute
// this from state.status and state.nextActionAt to explain a lead's position in
// the queue, which meant a second copy of this logic with nothing checking the
// mirror. Now the server says it once.
const TIER_RANK: Record<UrgencyTier, number> = {
  overdue: 0,
  untouched: 1,
  scheduled: 2,
  in_progress: 3,
  closed: 4,
}

export function urgencyTierOf(lead: { state: UnifiedLead['state'] }, now: number): UrgencyTier {
  const state = lead.state
  if (state?.status === 'closed') return 'closed'
  if (state?.nextActionAt) {
    return Date.parse(state.nextActionAt) <= now ? 'overdue' : 'scheduled'
  }
  // No state row at all means nobody has opened it yet -- same as 'new'.
  if (!state || state.status === 'new') return 'untouched'
  return 'in_progress'
}

// Within a tier, the ordering that makes the tier actionable: due work oldest
// first, waiting leads oldest first (they are going cold), and finished or
// in-flight work newest first.
//
// NEGATED for the "newest first" tiers so that ASCENDING is always correct.
// That uniformity is what lets a pagination cursor be a single comparable
// number instead of a direction-aware special case per tier.
// An unparseable date yields NaN, and NaN destroys the TOTAL ORDER pagination
// depends on: NaN !== NaN, and every comparison against it is false, so the
// cursor can never advance past such a lead and the caller is served the same
// page forever. On a phone that is an inbox that scrolls without end.
//
// Real leads always carry a valid ISO createdAt, so this is defensive -- but
// the failure it prevents is severe and silent, and the guard is one line.
// Unparseable sorts LAST rather than first: a corrupt row should not be the
// first thing an operator sees.
function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function sortKeyOf(lead: SortableLead, tier: UrgencyTier): number {
  if (tier === 'overdue' || tier === 'scheduled') {
    return finite(Date.parse(lead.state?.nextActionAt ?? ''), Number.MAX_SAFE_INTEGER)
  }
  if (tier === 'untouched') {
    return finite(Date.parse(lead.createdAt), Number.MAX_SAFE_INTEGER)
  }
  return finite(-Date.parse(lead.createdAt), Number.MAX_SAFE_INTEGER)
}

// The full sort position of a lead. Carrying leadId is not cosmetic: without a
// tiebreak the order was NOT a total order, so two leads sharing a timestamp
// could swap places between two requests -- which for a paginated reader means
// seeing one lead twice and never seeing the other at all.
// The comparator only reads state, createdAt and leadId, so it works on a lead
// that does not carry its tier yet. That is what lets the tier be stamped AFTER
// the sort rather than guessed during construction.
type SortableLead = Omit<UnifiedLead, 'urgencyTier'>

export interface InboxPosition {
  rank: number
  sortKey: number
  leadId: string
}

export function positionOf(lead: SortableLead, now: number): InboxPosition {
  const tier = urgencyTierOf(lead, now)
  return { rank: TIER_RANK[tier], sortKey: sortKeyOf(lead, tier), leadId: lead.leadId }
}

function comparePositions(a: InboxPosition, b: InboxPosition): number {
  if (a.rank !== b.rank) return a.rank - b.rank
  if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey
  return a.leadId < b.leadId ? -1 : a.leadId > b.leadId ? 1 : 0
}

function compareByUrgency(a: SortableLead, b: SortableLead, now: number): number {
  return comparePositions(positionOf(a, now), positionOf(b, now))
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
// urgencyTier is omitted too: it is derived from `state`, which a source record
// does not carry. getUnifiedLeadDetail stamps it once both halves are in hand.
type SourceRecord = Omit<UnifiedLeadDetail, 'leadRef' | 'state' | 'urgencyTier'>

async function readSourceRecord(leadRef: LeadRef, clientId: string): Promise<SourceRecord | null> {
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
      const lead = await getMetaLeadById(clientId, leadRef.leadId)
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
  const [record, state] = await Promise.all([readSourceRecord(leadRef, clientId), getLeadState(leadRef.leadId)])

  // 404 either way (missing vs. owned by someone else) -- don't reveal
  // existence to a non-owner. Mirrors lead-service.ts's getLeadDetail.
  if (!record || record.clientId !== clientId) {
    throw new Error('Lead not found')
  }

  // The detail screen shows the same badge the list does, so the tier has to
  // travel here too rather than being recomputed by the client.
  return { ...record, leadRef, state, urgencyTier: urgencyTierOf({ state }, Date.now()) }
}

// Ownership is checked against the LEAD, not against the lead_state row: an
// untouched lead has no state row yet, so trusting the row's clientId would
// let the first writer claim any leadId they can guess. readJourneyLead is the
// same read the journey layer uses, so a lead that cannot be resolved here
// cannot be acted on there either.
async function assertLeadOwnedByClient(leadRef: LeadRef, clientId: string): Promise<void> {
  const lead = await readJourneyLead(leadRef, clientId)
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

// -------------------------------------------------------------------------
// The lead's timeline: everything that happened to them, in order.
//
// Ownership is checked the SAME way getUnifiedLeadDetail does, and against the
// source record rather than the events. lead_events is partitioned by leadId
// alone, so a leadId guessed or lifted from a URL would otherwise read another
// tenant's conversation. The events themselves carry a clientId, but filtering
// after the read is not a boundary: it still fetched the rows.
//
// Bounded by default. A long-running nurture can accumulate hundreds of rows and
// the page renders all of them; the cap keeps one lead from pulling an unbounded
// read on a Lambda shared with every other request.
// -------------------------------------------------------------------------
const MAX_TIMELINE_EVENTS = 500

export async function getLeadTimeline(leadRef: LeadRef, clientId: string): Promise<LeadEvent[]> {
  const record = await readSourceRecord(leadRef, clientId)

  // 404 either way, so a non-owner cannot distinguish "does not exist" from
  // "not yours".
  if (!record || record.clientId !== clientId) {
    throw new Error('Lead not found')
  }

  return getLeadEvents(leadRef.leadId, MAX_TIMELINE_EVENTS)
}
