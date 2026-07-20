import crypto from 'node:crypto'
import { razorpayClient } from '../lib/razorpay.js'

export class RazorpayProvider {
  async createSubscription(
    planId: string,
    notes: Record<string, string>
  ): Promise<{ id: string; status: string }> {
    const subscription = await razorpayClient.subscriptions.create({
      plan_id: planId,
      total_count: 1200,
      quantity: 1,
      customer_notify: 1,
      notes,
    })

    return { id: subscription.id, status: subscription.status }
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
}

export const razorpayProvider = new RazorpayProvider()
