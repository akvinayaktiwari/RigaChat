import { findLeadByPhone } from './lead-identity-service.js'
import { readJourneyLead } from './lead-resolution-service.js'
import type { JourneyLead, LeadRef } from '../types/index.js'

// -------------------------------------------------------------------------
// "Which of this client's leads just messaged us?"
//
// Both inbound WhatsApp paths (Meta Direct and Gupshup) used to answer this
// with `leads.find(l => phonesMatch(l.phone, from))` over EVERY lead the client
// owns, across every bot, in DynamoDB scan order. One person who enquires twice
// -- or once on each of two bots -- produces several leads with the same phone,
// and `.find()` then picked an effectively arbitrary one.
//
// Observed in production on 2026-08-16: a reply from a lead captured that
// morning was recorded against a lead from 2026-07-07 on an unrelated bot,
// because that one happened to come back first among five phone matches. The
// journey parked on the real lead's await_reply step never resumed and timed
// out silently 24h later.
//
// The candidate search and the ordering rule that fixed it now live in
// lead-identity-service, which searches EVERY lead source rather than only the
// chat leads table. That narrowness was invisible while chat was the only thing
// that created leads. It stopped being invisible when a phone call could create
// one: someone who called first and messages later has no chat lead to find, so
// a chat-only search made them a brand-new stranger and started a second
// history for the same person.
//
// This module is now the WhatsApp-facing shape around that shared resolver.
// -------------------------------------------------------------------------

export type InboundMatchReason = 'only_match' | 'pending_reply' | 'most_recent'

export interface InboundLeadMatch {
  leadId: string
  // For lead_events scoping. A voice lead has no linked chatbot, so its agentId
  // stands in -- the field scopes events, it does not drive Pinecone retrieval.
  botId: string
  leadRef: LeadRef
  // Source-agnostic view for the agent turn, so a matched voice lead can be
  // answered exactly like a matched chat lead.
  journeyLead: JourneyLead
  // >1 means the ordering rule actually decided something, which is what makes
  // it worth logging when a reply lands on the wrong lead.
  candidateCount: number
  reason: InboundMatchReason
}

export async function matchLeadForInboundMessage(
  clientId: string,
  fromPhone: string
): Promise<InboundLeadMatch | null> {
  const identity = await findLeadByPhone(clientId, fromPhone)
  if (!identity) return null

  // The chosen candidate's full record, read through the same source-agnostic
  // path the journey layer uses. A null here means the row vanished between the
  // list and the read, which is a race rather than a miss -- treated as no
  // match so the caller creates a fresh lead instead of acting on a ghost.
  const journeyLead = await readJourneyLead(identity.leadRef, clientId)
  if (!journeyLead) {
    console.error(
      `[inbound-match] lead ${identity.leadId} matched on phone but its record could not be read`
    )
    return null
  }

  return {
    leadId: identity.leadId,
    botId: identity.leadRef.source === 'chat' ? identity.leadRef.botId : identity.leadRef.source === 'voice' ? identity.leadRef.agentId : clientId,
    leadRef: identity.leadRef,
    journeyLead,
    candidateCount: identity.candidateCount,
    reason: identity.reason,
  }
}

export function logInboundMatch(source: string, fromPhone: string, match: InboundLeadMatch): void {
  if (match.candidateCount <= 1) return

  console.log(
    `[${source}] ${fromPhone} matched ${match.candidateCount} leads; chose ${match.leadId} ` +
      `(${match.reason}, ${match.leadRef.source}, scope ${match.botId})`
  )
}
