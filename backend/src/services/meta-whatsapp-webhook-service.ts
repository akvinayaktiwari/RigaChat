import { metaProvider } from '../providers/meta-provider.js'
import { getConnectedWhatsAppClients } from '../repositories/client-repository.js'
import { recordInboundMessage } from '../repositories/whatsapp-inbound-activity-repository.js'
import { logInboundMatch, matchLeadForInboundMessage } from './inbound-lead-match-service.js'
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

    const match = await matchLeadForInboundMessage(owner.clientId, message.from)
    if (!match) {
      console.log(`[wa-inbound] message from ${message.from} matched no lead for client ${owner.clientId}`)
      return
    }
    logInboundMatch('wa-inbound', message.from, match)

    const lead = match.lead
    await recordInboundMessage(lead.leadId)

    const outcome = await handleInboundLeadMessage(lead.leadId, message.text?.body ?? '')
    if (outcome.handled !== 'no_pending_journey') {
      console.log(`[journey-reply] lead ${lead.leadId}: ${JSON.stringify(outcome)}`)
    } else if (match.candidateCount > 1) {
      // Normally silent -- most inbound messages have no journey waiting and
      // logging every one would be noise. But when several leads shared the
      // phone number, "nothing was waiting" is exactly the symptom of having
      // picked the wrong one, and that combination went unnoticed for a day.
      console.log(
        `[wa-inbound] chose lead ${lead.leadId} from ${match.candidateCount} matches and it had no parked journey`
      )
    }
  } catch (error) {
    console.error('[wa-inbound] failed to record inbound message:', error)
  }
}

export interface MetaWhatsAppWebhookResult {
  status: 200 | 400 | 500
}

// Takes the RAW body, not a parsed object: the signature is an HMAC over the
// exact bytes Meta sent, so parsing first and re-serialising would compare
// against something Meta never signed.
//
// Until 2026-08-16 this endpoint parsed and trusted whatever arrived, while the
// Lead Ads endpoint 34 lines above it in routes/webhooks.ts verified properly.
// The gap was survivable only because resuming a journey needs a callback token
// this system stored for that specific lead (see journey-reply-service.ts), so a
// forged message could not start a journey or skip a step. Inbound-created leads
// remove that bound entirely, which is why this landed before that work.
//
// On status codes. The rule this endpoint has always followed is "always 200,
// because Meta retries non-2xx and disables a webhook that keeps failing". That
// rule protects DELIVERIES FROM META, and it still applies below: a signed but
// unparseable body returns 200 rather than inviting an infinite retry loop.
// It does not apply to an unsigned request, because Meta did not send it, so
// there is nothing to retry and nothing to disable. A misconfigured
// META_APP_SECRET is the one case that could reject genuine Meta traffic, so it
// is 500 (our fault, retry) and never 400 (your request is bad) -- the same
// split meta-lead-service.ts:496-507 makes. That verification block is
// deliberately duplicated rather than shared: extracting it would mean editing
// the Lead Ads path while it is pending App Review, which is not a change to
// bundle into a security fix.
export async function processMetaWhatsAppWebhook(
  rawBody: string,
  signatureHeader: string | undefined
): Promise<MetaWhatsAppWebhookResult> {
  let signatureValid: boolean
  try {
    signatureValid = metaProvider.verifyWebhookSignature(rawBody, signatureHeader)
  } catch (error) {
    console.error('[wa-webhook] signature verification misconfigured:', error)
    return { status: 500 }
  }

  if (!signatureValid) {
    // Missing and mismatched are logged differently on purpose. If inbound goes
    // quiet after this ships, that one word is the difference between "Meta is
    // not signing these at all, revert" and "our META_APP_SECRET is wrong for
    // this app, fix the config" -- a distinction that cost most of a day the
    // last time inbound broke without instrumentation to explain it.
    const reason = signatureHeader === undefined ? 'header absent' : 'signature mismatch'
    console.error(`[wa-webhook] rejected: ${reason}`)
    return { status: 400 }
  }

  let payload: MetaWhatsAppWebhookBody
  try {
    payload = JSON.parse(rawBody) as MetaWhatsAppWebhookBody
  } catch {
    console.error('[wa-webhook] signed request had a body that is not valid JSON')
    return { status: 200 }
  }

  if (payload?.object !== 'whatsapp_business_account') return { status: 200 }

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

  return { status: 200 }
}
