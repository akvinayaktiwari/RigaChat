import crypto from 'crypto'
import { getWebhookType, isGupshupDeliveryEvent, isGupshupIncomingMessage } from '../lib/gupshup-webhook.js'
import { razorpayProvider } from '../providers/razorpay-provider.js'
import { getByAccountId, updatePartial } from '../repositories/subscription-repository.js'
import { hasProcessed, markProcessed } from '../repositories/webhook-event-repository.js'
import { logPayment } from '../repositories/payment-history-repository.js'
import { invalidateEntitlementsCache } from './entitlement-service.js'
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

export function logGupshupWebhookEvent(body: unknown): void {
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
    // Feature 2 (WhatsApp chatbot) backlog — do not process further yet.
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

  if (await hasProcessed(eventId)) {
    return { status: 200, message: 'Already processed' }
  }

  let parsed: RazorpayWebhookPayload
  try {
    parsed = JSON.parse(rawBody) as RazorpayWebhookPayload
  } catch {
    console.error('Razorpay webhook rejected: body is not valid JSON')
    return { status: 400, message: 'Invalid JSON body' }
  }

  const eventType = parsed.event
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
    await markProcessed(eventId, 'razorpay', eventType)
    return { status: 200, message: 'Payment failure logged' }
  }

  if (!subscriptionEntity) {
    console.error(`Razorpay webhook ${eventType} has no payload.subscription.entity`, { eventId })
    await markProcessed(eventId, 'razorpay', eventType)
    return { status: 200, message: 'No subscription entity, ignored' }
  }

  const mappedStatus = RAZORPAY_STATUS_MAP[eventType]
  if (!mappedStatus) {
    console.log(`Razorpay webhook ${eventType} is unmapped, ignoring`, { eventId })
    await markProcessed(eventId, 'razorpay', eventType)
    return { status: 200, message: 'Unmapped event type, ignored' }
  }

  const clientId = subscriptionEntity.notes?.clientId
  if (!clientId) {
    console.error(`Razorpay webhook ${eventType} subscription notes missing clientId`, {
      eventId,
      subscriptionId: subscriptionEntity.id,
    })
    await markProcessed(eventId, 'razorpay', eventType)
    return { status: 200, message: 'Missing clientId in notes, ignored' }
  }

  const subscription = await getByAccountId(clientId)
  if (!subscription) {
    console.error(`Razorpay webhook ${eventType} clientId ${clientId} has no local subscription row`, { eventId })
    await markProcessed(eventId, 'razorpay', eventType)
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
    await markProcessed(eventId, 'razorpay', eventType)
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
  await markProcessed(eventId, 'razorpay', eventType)

  return { status: 200, message: 'Processed' }
}
