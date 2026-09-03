import { phonesMatch } from '../lib/phone-match.js'
import { getPendingReply } from '../repositories/journey-pending-reply-repository.js'
import { getLeadsForClient } from './lead-service.js'
import { getVoiceLeadsByClientId } from '../repositories/voice-lead-repository.js'
import type { LeadRef } from '../types/index.js'

// -------------------------------------------------------------------------
// "Is this phone number already someone we know?"
//
// The join that makes one person ONE lead across channels. A caller who
// enquired through the web widget on Tuesday and phones on Thursday should land
// on the same leadId -- same lead_events stream, same lead_state, same journey
// -- rather than becoming a stranger every time they switch channel.
//
// Phone number is the join key because it is the only identifier every channel
// carries: WhatsApp is addressed by it, a phone call announces it as caller ID,
// and a web/form lead almost always captures it.
//
// Source-agnostic BY DESIGN, unlike inbound-lead-match-service which searches
// only the chat leads table. That narrowness is invisible today because chat is
// where leads have historically been created; it stops being invisible the
// moment voice can create one. See the TODO in TODOS.md about pointing the
// WhatsApp path here so the reverse direction (call first, WhatsApp later)
// unifies too.
//
// The ordering rule is inherited from inbound-lead-match-service, and it was
// paid for: a reply once landed on a lead from five weeks earlier on an
// unrelated bot because `.find()` picked an arbitrary phone match, and the
// journey parked on the real lead timed out silently 24h later.
//   1. a candidate with a journey parked on it -- that execution is literally
//      waiting to hear from this person
//   2. otherwise the most recent by createdAt -- a returning contact means
//      their latest enquiry, not their first
// -------------------------------------------------------------------------

const MAX_PENDING_REPLY_PROBES = 10

export type IdentityMatchReason = 'only_match' | 'pending_reply' | 'most_recent'

export interface LeadIdentityMatch {
  leadRef: LeadRef
  leadId: string
  phone: string
  name?: string
  createdAt: string
  // >1 means the ordering rule above actually decided something, which is what
  // makes it worth logging when a call is attributed to the wrong lead.
  candidateCount: number
  reason: IdentityMatchReason
}

interface Candidate {
  leadRef: LeadRef
  leadId: string
  phone: string
  name?: string
  createdAt: string
}

async function collectCandidates(clientId: string, phone: string): Promise<Candidate[]> {
  // Both sources are fetched even when the first yields a match: picking the
  // most recent contact across ALL channels is the whole point, and stopping
  // early would silently prefer whichever source was queried first.
  const [chatLeads, voiceLeads] = await Promise.all([
    getLeadsForClient(clientId).catch((error: unknown) => {
      console.error(
        `[lead-identity] chat lead lookup failed for ${clientId}:`,
        error instanceof Error ? error.message : error
      )
      return []
    }),
    getVoiceLeadsByClientId(clientId, 100).catch((error: unknown) => {
      console.error(
        `[lead-identity] voice lead lookup failed for ${clientId}:`,
        error instanceof Error ? error.message : error
      )
      return []
    }),
  ])

  const candidates: Candidate[] = []

  for (const lead of chatLeads) {
    if (lead.phone && phonesMatch(lead.phone, phone)) {
      candidates.push({
        leadRef: { source: 'chat', botId: lead.botId, leadId: lead.leadId },
        leadId: lead.leadId,
        phone: lead.phone,
        name: lead.name,
        createdAt: lead.createdAt,
      })
    }
  }

  for (const lead of voiceLeads) {
    if (lead.phone && phonesMatch(lead.phone, phone)) {
      candidates.push({
        leadRef: { source: 'voice', agentId: lead.agentId, leadId: lead.leadId },
        leadId: lead.leadId,
        phone: lead.phone,
        name: lead.name,
        createdAt: lead.createdAt,
      })
    }
  }

  return candidates
}

// A partial failure returns fewer candidates rather than throwing: failing to
// recognise a returning caller costs a duplicate lead, while throwing costs the
// call itself. The duplicate is recoverable; the dropped call is not.
export async function findLeadByPhone(clientId: string, phone: string): Promise<LeadIdentityMatch | null> {
  if (!phone) return null

  const candidates = await collectCandidates(clientId, phone)
  if (candidates.length === 0) return null

  if (candidates.length === 1) {
    const only = candidates[0]!
    return { ...only, candidateCount: 1, reason: 'only_match' }
  }

  const byNewest = [...candidates].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  for (const candidate of byNewest.slice(0, MAX_PENDING_REPLY_PROBES)) {
    const pending = await getPendingReply(candidate.leadId)
    if (pending) {
      return { ...candidate, candidateCount: candidates.length, reason: 'pending_reply' }
    }
  }

  return { ...byNewest[0]!, candidateCount: candidates.length, reason: 'most_recent' }
}
