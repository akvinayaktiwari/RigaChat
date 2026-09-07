import crypto from 'crypto'
import {
  getWebhookType,
  isGupshupDeliveryEvent,
  isGupshupIncomingMessage,
  type GupshupIncomingMessage,
} from '../lib/gupshup-webhook.js'
import { logInboundMatch, matchLeadForInboundMessage } from './inbound-lead-match-service.js'
import { razorpayProvider } from '../providers/razorpay-provider.js'
import { getByAccountId, updatePartial } from '../repositories/subscription-repository.js'
import { claimWebhookEvent, releaseWebhookEventClaim } from '../repositories/webhook-event-repository.js'
import { logPayment } from '../repositories/payment-history-repository.js'
import { getClientIdForGupshupApp } from '../repositories/gupshup-app-lookup-repository.js'
import { appendLeadEvent } from '../repositories/lead-event-repository.js'
import { extractGupshupInboundText } from '../lib/whatsapp-inbound.js'
import { recordInboundMessage } from '../repositories/whatsapp-inbound-activity-repository.js'
import { invalidateEntitlementsCache } from './entitlement-service.js'
import { handleInboundLeadMessage } from './journey-reply-service.js'
import type { PlanTier, Subscription, SubscriptionStatus } from '../types/index.js'

const BILLABLE_TIERS: ReadonlySet<PlanTier> = new Set(['starter', 'growth', 'agency'])

// Unlike Razorpay (X-Razorpay-Signature) and Meta (X-Hub-Signature-256),
// Gupshup does not sign webhook payloads at all -- confirmed against their
// own docs (docs.gupshup.io/docs/what-is-a-webhook): the only documented
// security mechanism is IP whitelisting, which needs Gupshup support to
// hand over their inbound IP ranges (external dependency, tracked
// separately as optional hardening in TODOS.md) and isn't something their
// dashboard lets you pair with a custom header anyway -- the only
// configurable surface is the callback URL itself. An unguessable token as
// a query param on that URL is the practical alternative fully within our
// control: it's not a cryptographic signature over the payload, but it
// does mean a request without the token (i.e. anyone who hasn't seen the
// URL we registered) gets rejected before its body is ever trusted.
// timingSafeEqual mirrors meta-provider.ts's verifyWebhookSignature --  a
// plain === comparison here would be a timing side-channel on this
// endpoint's only authenticity check.
export function verifyGupshupWebhookToken(token: string | undefined): boolean {
  const expected = process.env.GUPSHUP_WEBHOOK_TOKEN
  if (!expected) {
    throw new Error(
      'Missing required environment variable GUPSHUP_WEBHOOK_TOKEN. Set it in your .env file before starting the server.'
    )
  }
  if (!token) return false

  const expectedBuffer = Buffer.from(expected, 'utf-8')
  const providedBuffer = Buffer.from(token, 'utf-8')
  if (expectedBuffer.length !== providedBuffer.length) return false

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
}

// Resolves an inbound message to a lead (app -> clientId via
// gupshup-app-lookup-repository.ts, then phone match across that client's
// leads) and records the timestamp real-inbound-tracking depends on
// (whatsapp-service.ts's hasActiveWhatsAppSession()). Deliberately never
// throws: this is best-effort enrichment on top of an otherwise-successful
// webhook delivery, not something that should turn "we got your event"
// into a 500 that makes Gupshup retry a message that was actually received
// fine. Every miss (no app field, unknown app, no matching lead) is logged,
// not silent -- distinguishable from a real bug in this function itself.
async function resolveAndRecordInboundMessage(event: GupshupIncomingMessage): Promise<void> {
  try {
    if (!event.app) {
      console.error('Gupshup incoming message missing top-level "app" field, cannot resolve client')
      return
    }

    const clientId = await getClientIdForGupshupApp(event.app)
    if (!clientId) {
      console.error(`Gupshup incoming message for unmapped app "${event.app}"`)
      return
    }

    const match = await matchLeadForInboundMessage(clientId, event.payload.source)
    if (!match) {
      console.log(`Gupshup incoming message from ${event.payload.source} (client ${clientId}) matched no lead`)
      return
    }
    logInboundMatch('gupshup-inbound', event.payload.source, match)

    await recordInboundMessage(match.leadId)

    // Same reason as the Meta path: Gupshup delivers a quick-reply tap with the
    // label under `title`, not `text`, so reading `text` alone turns a real
    // reply into an empty string.
    const inbound = extractGupshupInboundText(event.payload.payload)

    // The agent turn deliberately does not run on this provider (see #11), but
    // the timeline should not have a hole for the one client still on Gupshup.
    await appendLeadEvent({
      leadId: match.leadId,
      clientId,
      botId: match.botId,
      type: 'message_in',
      channel: 'whatsapp',
      body: inbound.text,
    })

    // The message is now more than a timestamp: if a journey is parked on this
    // lead's await_reply step, this is what advances it, and an opt-out is what
    // stops it. Still best-effort -- handleInboundLeadMessage never throws --
    // so a journey-layer problem cannot turn a received message into a 500 and
    // make Gupshup redeliver it.
    const outcome = await handleInboundLeadMessage(match.leadId, inbound.text)
    if (outcome.handled !== 'no_pending_journey') {
      console.log(`[journey-reply] lead ${match.leadId}: ${JSON.stringify(outcome)}`)
    } else if (match.candidateCount > 1) {
      // See the same branch in meta-whatsapp-webhook-service.ts: "several
      // leads matched AND nothing was waiting" is the signature of choosing
      // the wrong one, so that pair is worth a line even though the common
      // no-journey case is not.
      console.log(
        `[gupshup-inbound] chose lead ${match.leadId} from ${match.candidateCount} matches and it had no parked journey`
      )
    }
  } catch (error) {
    console.error('Failed to resolve/record Gupshup incoming message:', error)
  }
}

export async function logGupshupWebhookEvent(body: unknown): Promise<void> {
  if (isGupshupDeliveryEvent(body)) {
    console.log('WhatsApp delivery event:', {
      messageId: body.payload.id,
      destination: body.payload.destination,
      status: body.payload.payload.type,
      error: body.payload.payload.error ?? null,
      timestamp: new Date(body.timestamp).toISOString(),
    })
    return
  }

  if (isGupshupIncomingMessage(body)) {
    console.log('WhatsApp incoming message:', {
      from: body.payload.source,
      text: body.payload.payload.text,
      messageId: body.payload.id,
    })
    // Feature 2 (WhatsApp chatbot conversational handling) is still
    // backlog -- this only records the inbound-activity timestamp real
    // session-window checks need, it doesn't respond to or act on the
    // message content.
    await resolveAndRecordInboundMessage(body)
    return
  }

  console.log('WhatsApp webhook unknown type:', getWebhookType(body))
}

interface RazorpaySubscriptionEntity {
  id: string
  status: string
  current_start: number | null
  current_end: number | null
  notes: Record<string, string>
}

interface RazorpayPaymentEntity {
  id: string
  amount: number
  currency: string
  status: string
  // Only present on a failed payment. Razorpay's payment entity carries
  // these directly, not nested under a generic "error" object.
  error_code?: string
  error_description?: string
  // Set when this charge has an associated Razorpay Invoice (subscription
  // charges get one automatically when the account's Razorpay settings have
  // GST/invoicing configured). Absent otherwise.
  invoice_id?: string
}

interface RazorpayWebhookPayload {
  entity: string
  account_id: string
  event: string
  contains: string[]
  payload: {
    subscription?: { entity: RazorpaySubscriptionEntity }
    payment?: { entity: RazorpayPaymentEntity }
  }
  created_at: number
}

// Per Razorpay's subscription lifecycle event table. subscription.charged
// keeps the subscription active — its distinct handling (payment log +
// currentPeriodEnd bump) happens separately below, not via this map.
const RAZORPAY_STATUS_MAP: Record<string, SubscriptionStatus> = {
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.pending': 'past_due',
  'subscription.halted': 'suspended',
  'subscription.paused': 'suspended',
  'subscription.resumed': 'active',
  'subscription.cancelled': 'cancelled',
  'subscription.authenticated': 'pending_activation',
}

export interface WebhookProcessResult {
  status: 200 | 400 | 500
  message: string
}

// Every early-return path that has already consumed a valid, signed,
// not-yet-processed event marks it processed and returns 200 — Razorpay
// retries on any non-200, and none of these conditions (unmapped event type,
// missing notes.clientId, no local row, subscription id mismatch) are
// fixable by a retry, so retrying would just repeat the same no-op forever.
export async function processRazorpayWebhook(
  rawBody: string,
  signature: string | undefined,
  eventId: string | undefined
): Promise<WebhookProcessResult> {
  let signatureValid: boolean
  try {
    signatureValid = signature !== undefined && razorpayProvider.verifyWebhookSignature(rawBody, signature)
  } catch (error) {
    console.error('Razorpay webhook signature verification misconfigured:', error)
    return { status: 500, message: 'Signature verification misconfigured' }
  }

  if (!signatureValid) {
    console.error('Razorpay webhook rejected: invalid or missing signature')
    return { status: 400, message: 'Invalid signature' }
  }

  // Razorpay's actual dedup key is the x-razorpay-event-id HTTP header, not
  // a field in the JSON body — there is no event_id (or similar) in the
  // payload itself. Confirmed against Razorpay's webhook docs.
  if (!eventId) {
    console.error('Razorpay webhook rejected: missing x-razorpay-event-id header')
    return { status: 400, message: 'Missing event id' }
  }

  let parsed: RazorpayWebhookPayload
  try {
    parsed = JSON.parse(rawBody) as RazorpayWebhookPayload
  } catch {
    console.error('Razorpay webhook rejected: body is not valid JSON')
    return { status: 400, message: 'Invalid JSON body' }
  }

  const eventType = parsed.event

  // Atomic claim, not hasProcessed() + markProcessed(). That pair was a read
  // followed by an unconditional write, so two concurrent deliveries of the
  // same event BOTH passed the read before either wrote, and both proceeded.
  // For subscription.charged that means two logPayment() calls: the same
  // charge recorded twice in a customer's payment history. Razorpay does retry
  // on non-2xx and webhook delivery can double-fire, so this is not
  // hypothetical -- it was simply low-stakes while no real money moved.
  //
  // claimWebhookEvent() writes the row up front under
  // attribute_not_exists(eventId), so exactly one caller proceeds.
  if (!(await claimWebhookEvent(eventId, 'razorpay', eventType))) {
    return { status: 200, message: 'Already processed' }
  }

  try {
    return await processClaimedRazorpayEvent(eventId, eventType, parsed)
  } catch (error) {
    // Hand the claim back before failing. The row is written at claim time, so
    // without this a crash mid-processing would leave the event permanently
    // marked done and Razorpay's retry would be silently ignored -- losing a
    // real payment. Rethrown so the route 500s and Razorpay does retry.
    await releaseWebhookEventClaim(eventId)
    throw error
  }
}

// Runs only for a caller that won the claim. Every early return here is a 200:
// none of these conditions (unmapped event type, missing notes.clientId, no
// local row, subscription id mismatch) is fixable by a retry, so a non-200
// would just make Razorpay repeat the same no-op forever.
async function processClaimedRazorpayEvent(
  eventId: string,
  eventType: string,
  parsed: RazorpayWebhookPayload
): Promise<WebhookProcessResult> {
  const subscriptionEntity = parsed.payload.subscription?.entity

  // payment.failed isn't in RAZORPAY_STATUS_MAP: a declined recurring charge
  // doesn't change subscription status on its own (Razorpay's own retry
  // schedule does that later via subscription.pending/halted). Without this
  // branch the event either falls into "no subscription entity, ignored" or
  // "unmapped event type, ignored" below and the failure is never logged
  // anywhere — the account keeps showing 'active' with no visible signal
  // that a charge just failed. This branch only logs; it deliberately does
  // not touch subscription status, to avoid racing the later lifecycle event.
  if (eventType === 'payment.failed') {
    const paymentEntity = parsed.payload.payment?.entity
    console.error(`Razorpay payment failed`, {
      eventId,
      subscriptionId: subscriptionEntity?.id ?? null,
      clientId: subscriptionEntity?.notes?.clientId ?? null,
      paymentId: paymentEntity?.id ?? null,
      errorCode: paymentEntity?.error_code ?? null,
      errorDescription: paymentEntity?.error_description ?? null,
    })
    return { status: 200, message: 'Payment failure logged' }
  }

  if (!subscriptionEntity) {
    console.error(`Razorpay webhook ${eventType} has no payload.subscription.entity`, { eventId })
    return { status: 200, message: 'No subscription entity, ignored' }
  }

  const mappedStatus = RAZORPAY_STATUS_MAP[eventType]
  if (!mappedStatus) {
    console.log(`Razorpay webhook ${eventType} is unmapped, ignoring`, { eventId })
    return { status: 200, message: 'Unmapped event type, ignored' }
  }

  const clientId = subscriptionEntity.notes?.clientId
  if (!clientId) {
    console.error(`Razorpay webhook ${eventType} subscription notes missing clientId`, {
      eventId,
      subscriptionId: subscriptionEntity.id,
    })
    return { status: 200, message: 'Missing clientId in notes, ignored' }
  }

  const subscription = await getByAccountId(clientId)
  if (!subscription) {
    console.error(`Razorpay webhook ${eventType} clientId ${clientId} has no local subscription row`, { eventId })
    return { status: 200, message: 'No local subscription row, ignored' }
  }

  // notes.clientId comes from a signature-verified payload, so it's
  // authentically from Razorpay — but it echoes back whatever we sent as
  // notes at subscription-creation time (billing-service.ts), not something
  // Razorpay itself validates against the subscription id. This cross-check
  // guards against a corrupted/stale notes value silently updating the wrong
  // account's row.
  if (subscription.providerSubscriptionId !== subscriptionEntity.id) {
    console.error(`Razorpay webhook ${eventType} subscription id mismatch for clientId ${clientId}`, {
      eventId,
      expectedSubscriptionId: subscription.providerSubscriptionId,
      receivedSubscriptionId: subscriptionEntity.id,
    })
    return { status: 200, message: 'Subscription id mismatch, ignored' }
  }

  const updates: Partial<Omit<Subscription, 'accountId' | 'createdAt'>> = { status: mappedStatus }

  // billing-service.ts's subscribeToTier() sends { clientId, tier } as the
  // Razorpay subscription's notes at creation time, and Razorpay echoes
  // notes back on every webhook for that subscription - so this is the only
  // place `plan` ever gets set post-checkout. Without it, a client's `plan`
  // stays whatever it was before subscribing (e.g. 'free'), so a paying
  // Starter/Growth/Agency customer's entitlements (PLANS[plan] in
  // entitlement-service.ts) never actually upgrade despite status going
  // active and being charged. Found via live E2E testing, not a hypothetical.
  const notedTier = subscriptionEntity.notes?.tier
  if (notedTier && BILLABLE_TIERS.has(notedTier as PlanTier)) {
    updates.plan = notedTier as PlanTier
  }

  if (eventType === 'subscription.charged') {
    if (subscriptionEntity.current_end) {
      updates.currentPeriodEnd = new Date(subscriptionEntity.current_end * 1000).toISOString()
    }

    const paymentEntity = parsed.payload.payment?.entity
    if (paymentEntity) {
      // Best-effort: a failed invoice lookup must not block recording the
      // payment itself, so this never throws (see fetchInvoiceShortUrl).
      const invoiceUrl = paymentEntity.invoice_id
        ? await razorpayProvider.fetchInvoiceShortUrl(paymentEntity.invoice_id)
        : null

      await logPayment({
        accountId: clientId,
        paidAt: new Date().toISOString(),
        paymentId: paymentEntity.id,
        subscriptionId: subscriptionEntity.id,
        amount: paymentEntity.amount,
        currency: paymentEntity.currency,
        status: paymentEntity.status,
        invoiceUrl,
      })
    } else {
      console.error(`Razorpay webhook subscription.charged has no payload.payment.entity`, { eventId })
    }
  }

  await updatePartial(clientId, updates)
  await invalidateEntitlementsCache(clientId)

  return { status: 200, message: 'Processed' }
}

