import { metaProvider } from '../providers/meta-provider.js'
import { getConnectedWhatsAppClients } from '../repositories/client-repository.js'
import {
  appendLeadEvent,
  countInboundLeadsSince,
  getEventByWamid,
} from '../repositories/lead-event-repository.js'
import { createLead } from '../repositories/lead-repository.js'
import { resolveAgentForInboundMessage } from './inbound-agent-resolution-service.js'
import { recordInboundMessage } from '../repositories/whatsapp-inbound-activity-repository.js'
import { logInboundMatch, matchLeadForInboundMessage } from './inbound-lead-match-service.js'
import { handleInboundLeadMessage } from './journey-reply-service.js'
import type { ClientRecord, Lead, MessageDeliveryStatus } from '../types/index.js'

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
const DELIVERY_STATUSES: MessageDeliveryStatus[] = ['sent', 'delivered', 'read', 'failed']

function toDeliveryStatus(value: string | undefined): MessageDeliveryStatus | undefined {
  return DELIVERY_STATUSES.find((candidate) => candidate === value)
}

async function logStatuses(statuses: MetaStatus[]): Promise<void> {
  for (const status of statuses) {
    const reasons = (status.errors ?? [])
      .map((e) => `code=${e.code} ${e.title ?? ''} ${e.error_data?.details ?? e.message ?? ''}`.trim())
      .join(' | ')

    if (status.status === 'failed') {
      console.error(
        `[wa-status] FAILED to ${status.recipient_id} (${status.id}): ${reasons || 'no error detail supplied'}`
      )
    } else {
      console.log(`[wa-status] ${status.status} to ${status.recipient_id} (${status.id})`)
    }

    // A status payload carries a wamid and a recipient and NO leadId, so the
    // only way to attach it to a conversation is to look the wamid back up to
    // the message_out row that produced it. A miss is normal, not an error:
    // statuses also arrive for the client-notification template and for manual
    // smoke tests, neither of which belongs to a lead.
    if (!status.id || !status.status) continue

    // Meta's status vocabulary is open-ended (it has added values over time),
    // so anything outside the four we model is logged above and then dropped
    // rather than written as a status we cannot render.
    const delivery = toDeliveryStatus(status.status)
    if (!delivery) continue

    const origin = await getEventByWamid(status.id)
    if (!origin) continue

    await appendLeadEvent({
      leadId: origin.leadId,
      clientId: origin.clientId,
      botId: origin.botId,
      type: 'message_status',
      channel: 'whatsapp',
      wamid: status.id,
      status: delivery,
      ...(reasons ? { errorDetail: reasons } : {}),
    })
  }
}

// Mirrors the Gupshup path in webhook-service.ts: find which connected client
// owns the phone number the message arrived on, match the sender to a lead,
// then record the inbound so the 24h session window and any parked await_reply
// step both see it. Never throws -- a processing problem must not turn a
// received message into a 500 that makes Meta redeliver it.

// How many leads one client may have created from unknown numbers in an hour.
// Leads cannot be deleted anywhere in this product, so an unauthenticated public
// surface that writes permanent CRM rows needs a ceiling. Sized to be far above
// any real inbound rate and far below what a script could do.
const MAX_INBOUND_LEADS_PER_HOUR = 60
const INBOUND_LEAD_WINDOW_MS = 60 * 60 * 1000

// Creates a lead for a number we have never seen, or returns null and explains
// why it refused.
//
// Over the cap this creates NOTHING and answers NOTHING. An earlier draft of
// this rule said "still answer, just do not store", which cannot work: leadId is
// the key for opt-out, for the 24h session window, and for lead_events. Replying
// to someone you keep no record of means they cannot opt out of the replies you
// are sending them, which is worse than staying quiet.
async function createInboundLead(
  owner: ClientRecord,
  phoneNumberId: string,
  message: MetaInboundMessage
): Promise<Lead | null> {
  const from = message.from
  const body = message.text?.body?.trim()

  // Reactions, system notices and status-only payloads are not a person
  // introducing themselves, and must not mint a permanent CRM row.
  if (!from || message.type !== 'text' || !body) {
    console.log(`[wa-inbound] ignoring non-text inbound from ${from ?? 'unknown'} (type=${message.type ?? 'none'})`)
    return null
  }

  const since = new Date(Date.now() - INBOUND_LEAD_WINDOW_MS).toISOString()
  const recent = await countInboundLeadsSince(owner.clientId, since)
  if (recent >= MAX_INBOUND_LEADS_PER_HOUR) {
    console.error(
      `[wa-inbound] client ${owner.clientId} hit the inbound lead cap ` +
        `(${recent}/${MAX_INBOUND_LEADS_PER_HOUR} in the last hour); dropping message from ${from}`
    )
    return null
  }

  const resolution = await resolveAgentForInboundMessage(phoneNumberId, owner.clientId, body)
  if (!resolution) {
    console.error(
      `[wa-inbound] no Agent resolves for phone_number_id ${phoneNumberId} (client ${owner.clientId}); cannot create a lead`
    )
    return null
  }

  // Stored in the leads table under the Agent's bound botId, which makes this a
  // 'chat' lead as far as LeadRef is concerned. That is not a mislabel: 'chat'
  // means "lives in the leads table, keyed by botId", and the botId is what
  // scopes Pinecone (rule 5) and partitions the row. The CHANNEL is whatsapp,
  // and that is recorded on the lead_events rows, which is where channel belongs.
  const lead = await createLead({
    botId: resolution.botId,
    clientId: owner.clientId,
    phone: from,
    // The first thing they said is the start of the conversation, and makes the
    // CRM row readable on its own rather than an anonymous phone number.
    chatTranscript: `Lead: ${body}`,
    sourceUrl: `whatsapp:${owner.metaDirectWhatsAppConnection?.displayPhoneNumber ?? phoneNumberId}`,
  })

  console.log(
    `[wa-inbound] created lead ${lead.leadId} from ${from} via ${resolution.strategy} (bot ${resolution.botId})`
  )

  await appendLeadEvent({
    leadId: lead.leadId,
    clientId: owner.clientId,
    botId: resolution.botId,
    type: 'lead_captured',
    channel: 'whatsapp',
    body: lead.sourceUrl,
  })

  return lead
}

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

    // Nobody by that number yet. Before #10 the message was dropped here, which
    // made the whole click-to-WhatsApp flow a no-op: a visitor taps the button on
    // a client's site, messages the number, and nothing exists to answer them.
    const lead = match
      ? match.lead
      : await createInboundLead(owner, phoneNumberId, message)

    if (!lead) return
    if (match) logInboundMatch('wa-inbound', message.from, match)
    await recordInboundMessage(lead.leadId)

    await appendLeadEvent({
      leadId: lead.leadId,
      clientId: owner.clientId,
      botId: lead.botId,
      type: 'message_in',
      channel: 'whatsapp',
      body: message.text?.body ?? '',
    })

    const outcome = await handleInboundLeadMessage(lead.leadId, message.text?.body ?? '')
    if (outcome.handled !== 'no_pending_journey') {
      console.log(`[journey-reply] lead ${lead.leadId}: ${JSON.stringify(outcome)}`)
    } else if (match && match.candidateCount > 1) {
      // `match` is null for a lead created moments ago by createInboundLead, and
      // a brand-new lead cannot have several candidates by definition, so this
      // ambiguity warning only applies to a lead we matched rather than made.
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

      if (value.statuses?.length) await logStatuses(value.statuses)

      for (const message of value.messages ?? []) {
        await recordInbound(value.metadata?.phone_number_id, message)
      }
    }
  }

  return { status: 200 }
}
