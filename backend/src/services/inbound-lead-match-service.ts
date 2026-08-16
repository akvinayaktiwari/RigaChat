import { getPendingReply } from '../repositories/journey-pending-reply-repository.js'
import { phonesMatch } from '../lib/phone-match.js'
import { getLeadsForClient } from './lead-service.js'
import type { Lead } from '../types/index.js'

// -------------------------------------------------------------------------
// "Which of this client's leads just messaged us?"
//
// Both inbound WhatsApp paths (Meta Direct and Gupshup) used to answer this
// with `leads.find(l => phonesMatch(l.phone, from))` over EVERY lead the client
// owns, across every bot, in DynamoDB scan order. One person who enquires twice
// -- or once on each of two bots -- produces several leads with the same phone,
// and `.find()` then picks an effectively arbitrary one.
//
// Observed in production on 2026-08-16: a reply from a lead captured that
// morning was recorded against a lead from 2026-07-07 on an unrelated bot,
// because that one happened to come back first among five phone matches. The
// journey parked on the real lead's await_reply step never resumed and timed
// out silently 24h later.
//
// The rule, in order:
//   1. a candidate with a journey parked on it -- that execution is literally
//      waiting for this message, which is about as strong a signal as exists
//   2. otherwise the most recent by createdAt -- a returning contact means
//      their latest enquiry, not their first
// -------------------------------------------------------------------------

// How many candidates get a pending-reply lookup. Each is a point read, and the
// list is already sorted newest-first, so this bounds the cost for a client
// whose CRM has accumulated dozens of leads on one phone number without
// changing the answer in any realistic case.
const MAX_PENDING_REPLY_PROBES = 10

export type InboundMatchReason = 'only_match' | 'pending_reply' | 'most_recent'

export interface InboundLeadMatch {
  lead: Lead
  // How many of the client's leads share this phone number. >1 means the choice
  // below actually mattered, which is what makes it worth logging.
  candidateCount: number
  reason: InboundMatchReason
}

export async function matchLeadForInboundMessage(
  clientId: string,
  fromPhone: string
): Promise<InboundLeadMatch | null> {
  const leads = await getLeadsForClient(clientId)
  const candidates = leads.filter((lead) => lead.phone && phonesMatch(lead.phone, fromPhone))

  if (candidates.length === 0) return null
  if (candidates.length === 1) {
    return { lead: candidates[0]!, candidateCount: 1, reason: 'only_match' }
  }

  // Newest first, so the pending-reply probe below starts where a parked
  // journey is most likely to be and the fallback is already correct.
  const byNewest = [...candidates].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  for (const lead of byNewest.slice(0, MAX_PENDING_REPLY_PROBES)) {
    // Never throws for a missing row -- returns null (see the repository).
    const pending = await getPendingReply(lead.leadId)
    if (pending) {
      return { lead, candidateCount: candidates.length, reason: 'pending_reply' }
    }
  }

  return { lead: byNewest[0]!, candidateCount: candidates.length, reason: 'most_recent' }
}

// Shared by both webhook paths so the two report an ambiguous match the same
// way. Only logs when the choice was non-trivial: a single match is the normal
// case and does not need a line.
export function logInboundMatch(source: string, fromPhone: string, match: InboundLeadMatch): void {
  if (match.candidateCount <= 1) return

  console.log(
    `[${source}] ${fromPhone} matched ${match.candidateCount} leads; chose ${match.lead.leadId} ` +
      `(${match.reason}, bot ${match.lead.botId})`
  )
}
