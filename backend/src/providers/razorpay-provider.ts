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
}

export const razorpayProvider = new RazorpayProvider()
