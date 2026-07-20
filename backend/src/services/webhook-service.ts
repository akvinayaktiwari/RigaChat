import { getWebhookType, isGupshupDeliveryEvent, isGupshupIncomingMessage } from '../lib/gupshup-webhook.js'
import { razorpayProvider } from '../providers/razorpay-provider.js'
import { getByAccountId, updatePartial } from '../repositories/subscription-repository.js'
import { hasProcessed, markProcessed } from '../repositories/webhook-event-repository.js'
import { logPayment } from '../repositories/payment-history-repository.js'
import { invalidateEntitlementsCache } from './entitlement-service.js'
import type { Subscription, SubscriptionStatus } from '../types/index.js'

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

  if (eventType === 'subscription.charged') {
    if (subscriptionEntity.current_end) {
      updates.currentPeriodEnd = new Date(subscriptionEntity.current_end * 1000).toISOString()
    }

    const paymentEntity = parsed.payload.payment?.entity
    if (paymentEntity) {
      await logPayment({
        accountId: clientId,
        paidAt: new Date().toISOString(),
        paymentId: paymentEntity.id,
        subscriptionId: subscriptionEntity.id,
        amount: paymentEntity.amount,
        currency: paymentEntity.currency,
        status: paymentEntity.status,
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
