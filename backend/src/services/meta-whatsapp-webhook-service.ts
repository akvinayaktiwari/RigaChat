import { getConnectedWhatsAppClients } from '../repositories/client-repository.js'
import { recordInboundMessage } from '../repositories/whatsapp-inbound-activity-repository.js'
import { phonesMatch } from '../lib/phone-match.js'
import { getLeadsForClient } from './lead-service.js'
import { handleInboundLeadMessage } from './journey-reply-service.js'

// Meta Cloud API webhook payloads. Only the parts we act on are typed; the
// envelope carries a lot more that we deliberately ignore.
interface MetaStatusError {
  code?: number
  title?: string
  message?: string
  error_data?: { details?: string }
}

interface MetaStatus {
  id?: string
  status?: string
  recipient_id?: string
  errors?: MetaStatusError[]
}

interface MetaInboundMessage {
  from?: string
  type?: string
  text?: { body?: string }
}

interface MetaChangeValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string }
  statuses?: MetaStatus[]
  messages?: MetaInboundMessage[]
}

interface MetaWhatsAppWebhookBody {
  object?: string
  entry?: { id?: string; changes?: { field?: string; value?: MetaChangeValue }[] }[]
}

// A delivery status is the ONLY way to learn that a message Meta accepted was
// later dropped. The send call returns message_status "accepted" and a message
// id even for messages that never arrive, so without this every failure looks
// exactly like a success. Failures are logged with Meta's full error detail
// (code + title + details) because that detail is the whole diagnostic value.
function logStatuses(statuses: MetaStatus[]): void {
  for (const status of statuses) {
    if (status.status === 'failed') {
      const reasons = (status.errors ?? [])
        .map((e) => `code=${e.code} ${e.title ?? ''} ${e.error_data?.details ?? e.message ?? ''}`.trim())
        .join(' | ')
      console.error(
        `[wa-status] FAILED to ${status.recipient_id} (${status.id}): ${reasons || 'no error detail supplied'}`
      )
      continue
    }

    console.log(`[wa-status] ${status.status} to ${status.recipient_id} (${status.id})`)
  }
}

// Mirrors the Gupshup path in webhook-service.ts: find which connected client
// owns the phone number the message arrived on, match the sender to a lead,
// then record the inbound so the 24h session window and any parked await_reply
// step both see it. Never throws -- a processing problem must not turn a
// received message into a 500 that makes Meta redeliver it.
async function recordInbound(phoneNumberId: string | undefined, message: MetaInboundMessage): Promise<void> {
  try {
    if (!phoneNumberId || !message.from) return

    const clients = await getConnectedWhatsAppClients()
    const owner = clients.find((client) => client.metaDirectWhatsAppConnection?.phoneNumberId === phoneNumberId)
    if (!owner) {
      console.error(`[wa-inbound] message on unmapped phone_number_id ${phoneNumberId}`)
      return
    }

    const leads = await getLeadsForClient(owner.clientId)
    const lead = leads.find((candidate) => candidate.phone && phonesMatch(candidate.phone, message.from as string))
    if (!lead) {
      console.log(`[wa-inbound] message from ${message.from} matched no lead for client ${owner.clientId}`)
      return
    }

    await recordInboundMessage(lead.leadId)

    const outcome = await handleInboundLeadMessage(lead.leadId, message.text?.body ?? '')
    if (outcome.handled !== 'no_pending_journey') {
      console.log(`[journey-reply] lead ${lead.leadId}: ${JSON.stringify(outcome)}`)
    }
  } catch (error) {
    console.error('[wa-inbound] failed to record inbound message:', error)
  }
}

export async function processMetaWhatsAppWebhook(body: unknown): Promise<void> {
  const payload = body as MetaWhatsAppWebhookBody
  if (payload?.object !== 'whatsapp_business_account') return

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue

      if (value.statuses?.length) logStatuses(value.statuses)

      for (const message of value.messages ?? []) {
        await recordInbound(value.metadata?.phone_number_id, message)
      }
    }
  }
}
