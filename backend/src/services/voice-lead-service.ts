import { appendLeadEvent } from '../repositories/lead-event-repository.js'
import { createVoiceLead } from '../repositories/voice-lead-repository.js'
import { findLeadByPhone } from './lead-identity-service.js'
import type { LeadRef } from '../types/index.js'

// -------------------------------------------------------------------------
// Turns a phone call into something the CRM and the journey layer can see.
//
// Before this, a voice call wrote exactly one row: a VoiceCallLog, which is a
// billing record (tokens, duration) and nothing else. The call did not appear
// in the inbox, produced no lead, ignited no journey, and left no trace in the
// history any other channel reads. A client could take fifty calls and see
// nothing but a minutes counter.
//
// Two jobs:
//   resolveCallLead()  -- whose call is this? (attach to a known lead, or make
//                         a new one)
//   recordCallTurn()   -- write the conversation into lead_events, the stream
//                         WhatsApp and web chat already share
// -------------------------------------------------------------------------

export interface CallIdentity {
  leadRef: LeadRef
  leadId: string
  // botId for the lead_events rows. A voice agent may have no linked chatbot
  // (kb_only), in which case its own agentId stands in -- lead_events.botId is
  // required and is used for scoping, not for Pinecone retrieval, so an agentId
  // there is honest rather than a fake bot reference.
  botId: string
  isNewLead: boolean
  // Present when this call attached to someone already known. Worth logging:
  // it is how you find out the identity join put a call on the wrong lead.
  matchReason?: string
  candidateCount?: number
}

export interface ResolveCallLeadInput {
  clientId: string
  agentId: string
  callerPhone: string
  dialledNumber: string
  callId: string
  linkedBotId?: string
}

export async function resolveCallLead(input: ResolveCallLeadInput): Promise<CallIdentity> {
  const botId = input.linkedBotId ?? input.agentId

  // Withheld caller ID is a real thing on inbound calls. There is no identity
  // to resolve and no lead worth creating from a number nobody can call back,
  // so the call still runs and is still logged -- it simply cannot join anyone.
  if (!input.callerPhone) {
    const anonymous = await createVoiceLead({
      agentId: input.agentId,
      clientId: input.clientId,
      phone: '',
      dialledNumber: input.dialledNumber,
      callId: input.callId,
    })
    return {
      leadRef: { source: 'voice', agentId: input.agentId, leadId: anonymous.leadId },
      leadId: anonymous.leadId,
      botId,
      isNewLead: true,
    }
  }

  const existing = await findLeadByPhone(input.clientId, input.callerPhone)

  if (existing) {
    // The unification: no new lead. This call joins the history the caller
    // already has, whatever channel built it.
    console.log(
      `[voice-lead] Call ${input.callId} attached to existing lead ${existing.leadId} ` +
        `(${existing.reason}, ${existing.candidateCount} candidate(s))`
    )
    return {
      leadRef: existing.leadRef,
      leadId: existing.leadId,
      botId,
      isNewLead: false,
      matchReason: existing.reason,
      candidateCount: existing.candidateCount,
    }
  }

  const created = await createVoiceLead({
    agentId: input.agentId,
    clientId: input.clientId,
    phone: input.callerPhone,
    dialledNumber: input.dialledNumber,
    callId: input.callId,
  })

  console.log(`[voice-lead] Call ${input.callId} created new voice lead ${created.leadId}`)

  return {
    leadRef: { source: 'voice', agentId: input.agentId, leadId: created.leadId },
    leadId: created.leadId,
    botId,
    isNewLead: true,
  }
}

export interface RecordCallTurnInput {
  identity: CallIdentity
  clientId: string
  role: 'caller' | 'agent'
  text: string
}

// One conversational turn, written to the same stream WhatsApp and web chat
// use. message_in / message_out rather than a voice-specific type on purpose:
// anything that reads a lead's history (journey conditions, the CRM detail
// view, notification-service's transcript summariser) then sees a phone call as
// part of the conversation without being taught about voice at all.
export async function recordCallTurn(input: RecordCallTurnInput): Promise<void> {
  const trimmed = input.text.trim()
  if (!trimmed) return

  await appendLeadEvent({
    leadId: input.identity.leadId,
    clientId: input.clientId,
    botId: input.identity.botId,
    type: input.role === 'caller' ? 'message_in' : 'message_out',
    channel: 'voice',
    body: trimmed,
  })
}

export interface RecordCallLifecycleInput {
  identity: CallIdentity
  clientId: string
  body: string
}

// Call start/end and the identity decision itself, so a call is legible in the
// timeline even when nothing was said worth transcribing.
export async function recordCallLifecycle(input: RecordCallLifecycleInput): Promise<void> {
  await appendLeadEvent({
    leadId: input.identity.leadId,
    clientId: input.clientId,
    botId: input.identity.botId,
    type: input.identity.isNewLead ? 'lead_captured' : 'state_change',
    channel: 'voice',
    body: input.body,
  })
}

export interface RecordCallToolUseInput {
  identity: CallIdentity
  clientId: string
  query: string
  resultCount: number
}

// The agent looking something up mid-call. Already recorded for other channels;
// without it a transcript shows the agent stating a price with no trace of
// where it came from, which is the first thing anyone asks when it is wrong.
export async function recordCallToolUse(input: RecordCallToolUseInput): Promise<void> {
  await appendLeadEvent({
    leadId: input.identity.leadId,
    clientId: input.clientId,
    botId: input.identity.botId,
    type: 'tool_call',
    channel: 'voice',
    body: `search_knowledge_base(${input.query}) -> ${input.resultCount} result(s)`,
  })
}
