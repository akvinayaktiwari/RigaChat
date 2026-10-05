import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

const subscribeToTier = vi.fn()

vi.mock('../services/billing-service.js', () => ({
  BILLING_CURRENCY: 'USD',
  BillingError: class BillingError extends Error {},
  getPaymentHistory: vi.fn(),
  subscribeToTier,
}))

// See voice-phone-routes.test.ts for why this is replaced wholesale.
vi.mock('../lib/cognito.js', async () => {
  const { createMiddleware } = await import('hono/factory')
  return {
    requireAuth: createMiddleware(async (c, next) => {
      c.set('user', { sub: 'client-1', email: 'owner@example.com', name: 'Owner' })
      await next()
    }),
  }
})

const { billingRoutes } = await import('./billing-routes.js')

const app = new Hono().route('/api/billing', billingRoutes)

function subscribe(body: unknown) {
  return app.request('/api/billing/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  subscribeToTier.mockResolvedValue({ subscriptionId: 'sub_1', razorpayKeyId: 'rzp_live_x' })
})

describe('POST /subscribe', () => {
  it('starts a checkout from the tier alone', async () => {
    const res = await subscribe({ tier: 'growth' })

    expect(res.status).toBe(200)
    expect(subscribeToTier).toHaveBeenCalledWith('client-1', 'growth')
  })

  it('still accepts a caller that names USD', async () => {
    const res = await subscribe({ tier: 'growth', currency: 'USD' })

    expect(res.status).toBe(200)
  })

  // A tab opened before the rupee list was retired still shows ₹ and still
  // sends INR. Charging it in dollars would bill a different currency than the
  // one on that person's screen, so it is refused and nothing is created.
  it('refuses a request for the retired rupee plans rather than charging dollars', async () => {
    const res = await subscribe({ tier: 'growth', currency: 'INR' })

    expect(res.status).toBe(400)
    expect(subscribeToTier).not.toHaveBeenCalled()
  })
})
