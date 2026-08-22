import crypto from 'node:crypto'
import { razorpayClient } from '../lib/razorpay.js'

// The Razorpay SDK does NOT reject with an Error. normalizeError() in
// razorpay/dist/api.js does, literally:
//
//   throw { statusCode: err.response.status, error: err.response.data.error }
//
// a plain object literal. So `error instanceof Error` is false for every
// failure this SDK produces, and any `String(error)` fallback upstream
// renders "[object Object]" -- discarding the `code` and `description`
// Razorpay actually sent, which are the only fields that say WHY the call
// failed. Normalising at this boundary is the provider's job: the SDK's
// quirks stop here rather than leaking into billing-service.
export interface RazorpayErrorBody {
  code?: string
  description?: string
  reason?: string
  step?: string
  field?: string
  source?: string
}

interface RazorpaySdkRejection {
  statusCode?: number
  error?: RazorpayErrorBody
}

export class RazorpayApiError extends Error {
  readonly statusCode: number | null
  readonly code: string | null
  readonly description: string | null
  readonly field: string | null

  constructor(operation: string, rejection: RazorpaySdkRejection) {
    const body = rejection.error ?? {}
    const parts = [body.description ?? 'no description returned by Razorpay']
    if (body.code) parts.push(`code=${body.code}`)
    if (body.field) parts.push(`field=${body.field}`)
    if (body.reason && body.reason !== 'NA') parts.push(`reason=${body.reason}`)
    if (rejection.statusCode) parts.push(`http=${rejection.statusCode}`)

    super(`${operation}: ${parts.join(' ')}`)
    this.name = 'RazorpayApiError'
    this.statusCode = rejection.statusCode ?? null
    this.code = body.code ?? null
    this.description = body.description ?? null
    this.field = body.field ?? null
  }
}

function isSdkRejection(value: unknown): value is RazorpaySdkRejection {
  return typeof value === 'object' && value !== null && ('error' in value || 'statusCode' in value)
}

// Anything that is already an Error (a network failure, or normalizeError
// itself throwing a TypeError when err.response is undefined) is rethrown
// untouched -- only the SDK's plain-object rejections need rebuilding.
export function asRazorpayError(operation: string, error: unknown): Error {
  if (error instanceof Error) return error
  if (isSdkRejection(error)) return new RazorpayApiError(operation, error)
  return new Error(`${operation}: ${String(error)}`)
}

export interface RazorpaySubscription {
  id: string
  status: string
  paid_count: number
  current_end: number | null
  notes?: Record<string, string>
}

export interface RazorpayInvoice {
  id: string
  status: string
  payment_id: string | null
  short_url: string | null
}

export interface RazorpayPayment {
  id: string
  status: string
  amount: number
  currency: string
  invoice_id: string | null
}

export class RazorpayProvider {
  async createSubscription(
    planId: string,
    notes: Record<string, string>
  ): Promise<{ id: string; status: string }> {
    try {
      const subscription = await razorpayClient.subscriptions.create({
        plan_id: planId,
        total_count: 1200,
        quantity: 1,
        customer_notify: 1,
        notes,
      })

      return { id: subscription.id, status: subscription.status }
    } catch (error) {
      throw asRazorpayError(`Razorpay createSubscription(plan_id=${planId}) failed`, error)
    }
  }

  // Deliberately not using the Razorpay SDK's own Razorpay.validateWebhookSignature
  // (razorpay-utils.js) — it compares digests with plain `===`, a timing
  // side-channel on a payment-webhook auth check. crypto.timingSafeEqual closes
  // that. RAZORPAY_WEBHOOK_SECRET is validated lazily here (not at module load
  // like lib/razorpay.ts's key/secret) since only this one method needs it —
  // /api/billing/subscribe shouldn't fail to start over a webhook-only var.
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET
    if (!secret) {
      throw new Error(
        'Missing required environment variable RAZORPAY_WEBHOOK_SECRET. Set it in your .env file before starting the server.'
      )
    }

    const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    const expectedBuffer = Buffer.from(expectedHex, 'hex')

    let signatureBuffer: Buffer
    try {
      signatureBuffer = Buffer.from(signature, 'hex')
    } catch {
      return false
    }

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer)
  }

  // Read-only lookups used by scripts/reconcile-razorpay-subscription.ts to
  // repair accounts whose webhook never arrived. Razorpay is the source of
  // truth for what was actually paid, so reconciliation reads from here rather
  // than trusting local state. These throw (unlike fetchInvoiceShortUrl below):
  // a reconciliation that cannot read the real state must stop, not guess.
  async fetchSubscription(subscriptionId: string): Promise<RazorpaySubscription> {
    try {
      return (await razorpayClient.subscriptions.fetch(subscriptionId)) as unknown as RazorpaySubscription
    } catch (error) {
      throw asRazorpayError(`Razorpay fetchSubscription(${subscriptionId}) failed`, error)
    }
  }

  async fetchInvoicesForSubscription(subscriptionId: string): Promise<RazorpayInvoice[]> {
    try {
      const result = await razorpayClient.invoices.all({ subscription_id: subscriptionId })
      return (result.items ?? []) as unknown as RazorpayInvoice[]
    } catch (error) {
      throw asRazorpayError(`Razorpay fetchInvoicesForSubscription(${subscriptionId}) failed`, error)
    }
  }

  // Cancels immediately (cancel_at_cycle_end = false). Used when releasing a
  // stale pending_activation hold: the abandoned subscription's hosted
  // checkout link (short_url) stays payable until the subscription is
  // cancelled, so releasing the local lock without this would leave a second
  // payable link alive alongside the new subscription -- a double-billing
  // route, which is exactly what the lock was there to prevent.
  async cancelSubscription(subscriptionId: string): Promise<{ id: string; status: string }> {
    try {
      const cancelled = (await razorpayClient.subscriptions.cancel(subscriptionId, false)) as unknown as {
        id: string
        status: string
      }
      return { id: cancelled.id, status: cancelled.status }
    } catch (error) {
      throw asRazorpayError(`Razorpay cancelSubscription(${subscriptionId}) failed`, error)
    }
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    try {
      return (await razorpayClient.payments.fetch(paymentId)) as unknown as RazorpayPayment
    } catch (error) {
      throw asRazorpayError(`Razorpay fetchPayment(${paymentId}) failed`, error)
    }
  }

  // Returns null (never throws) on any lookup failure - this is called from
  // webhook processing, where a broken invoice-URL lookup must not block
  // recording the payment itself. short_url is Razorpay's hosted invoice
  // page; whether it carries GST/tax details depends on the account's
  // Razorpay settings, not on anything this app controls.
  async fetchInvoiceShortUrl(invoiceId: string): Promise<string | null> {
    try {
      const invoice = await razorpayClient.invoices.fetch(invoiceId)
      return invoice.short_url ?? null
    } catch (error) {
      console.error(`Failed to fetch Razorpay invoice ${invoiceId}:`, error)
      return null
    }
  }
}

export const razorpayProvider = new RazorpayProvider()
