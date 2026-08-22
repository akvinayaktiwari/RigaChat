import { beforeEach, describe, expect, it, vi } from 'vitest'

const claimWebhookEvent = vi.fn()
const releaseWebhookEventClaim = vi.fn()
vi.mock('../repositories/webhook-event-repository.js', () => ({
  claimWebhookEvent: (...a: unknown[]) => claimWebhookEvent(...a),
  releaseWebhookEventClaim: (...a: unknown[]) => releaseWebhookEventClaim(...a),
}))

const getByAccountId = vi.fn()
const updatePartial = vi.fn()
vi.mock('../repositories/subscription-repository.js', () => ({
  getByAccountId: (...a: unknown[]) => getByAccountId(...a),
  updatePartial: (...a: unknown[]) => updatePartial(...a),
}))

const logPayment = vi.fn()
vi.mock('../repositories/payment-history-repository.js', () => ({
  logPayment: (...a: unknown[]) => logPayment(...a),
}))

const verifyWebhookSignature = vi.fn()
const fetchInvoiceShortUrl = vi.fn()
vi.mock('../providers/razorpay-provider.js', () => ({
  razorpayProvider: {
    verifyWebhookSignature: (...a: unknown[]) => verifyWebhookSignature(...a),
    fetchInvoiceShortUrl: (...a: unknown[]) => fetchInvoiceShortUrl(...a),
  },
}))

vi.mock('./entitlement-service.js', () => ({ invalidateEntitlementsCache: vi.fn() }))

const { processRazorpayWebhook } = await import('./webhook-service.js')

const CLIENT = 'client-1'
const SUB_ID = 'sub_live1'
const EVENT_ID = 'evt_1'

function payload(event: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event,
    payload: {
      subscription: {
        entity: {
          id: SUB_ID,
          notes: { clientId: CLIENT, tier: 'growth' },
          current_end: 1790000000,
        },
      },
      ...extra,
    },
  })
}

const chargedPayload = payload('subscription.charged', {
  payment: { entity: { id: 'pay_1', amount: 549900, currency: 'INR', status: 'captured', invoice_id: 'inv_1' } },
})

beforeEach(() => {
  claimWebhookEvent.mockReset().mockResolvedValue(true)
  releaseWebhookEventClaim.mockReset().mockResolvedValue(undefined)
  getByAccountId.mockReset().mockResolvedValue({
    accountId: CLIENT,
    providerSubscriptionId: SUB_ID,
    plan: 'free',
  })
  updatePartial.mockReset().mockResolvedValue(undefined)
  logPayment.mockReset().mockResolvedValue(undefined)
  verifyWebhookSignature.mockReset().mockReturnValue(true)
  fetchInvoiceShortUrl.mockReset().mockResolvedValue('https://rzp.io/i/x')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('rejections happen before anything is claimed', () => {
  it('rejects a bad signature without claiming', async () => {
    verifyWebhookSignature.mockReturnValue(false)

    const result = await processRazorpayWebhook(chargedPayload, 'sig', EVENT_ID)

    expect(result).toEqual({ status: 400, message: 'Invalid signature' })
    expect(claimWebhookEvent).not.toHaveBeenCalled()
  })

  it('rejects a missing event id without claiming', async () => {
    const result = await processRazorpayWebhook(chargedPayload, 'sig', undefined)

    expect(result.status).toBe(400)
    expect(claimWebhookEvent).not.toHaveBeenCalled()
  })

  it('rejects an unparseable body without claiming', async () => {
    const result = await processRazorpayWebhook('not json', 'sig', EVENT_ID)

    expect(result).toEqual({ status: 400, message: 'Invalid JSON body' })
    expect(claimWebhookEvent).not.toHaveBeenCalled()
  })
})

// THE BUG THIS REPLACED.
//
// hasProcessed() + markProcessed() was a read then an unconditional write, so
// two concurrent deliveries of one event both passed the read before either
// wrote and both proceeded. For subscription.charged that is two logPayment()
// calls -- the same charge recorded twice in a customer's payment history.
describe('duplicate delivery', () => {
  it('does no work when another caller already holds the claim', async () => {
    claimWebhookEvent.mockResolvedValue(false)

    const result = await processRazorpayWebhook(chargedPayload, 'sig', EVENT_ID)

    expect(result).toEqual({ status: 200, message: 'Already processed' })
    expect(logPayment).not.toHaveBeenCalled()
    expect(updatePartial).not.toHaveBeenCalled()
  })

  it('records the payment exactly once across two concurrent deliveries', async () => {
    // Only the first caller wins the conditional write.
    claimWebhookEvent.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await Promise.all([
      processRazorpayWebhook(chargedPayload, 'sig', EVENT_ID),
      processRazorpayWebhook(chargedPayload, 'sig', EVENT_ID),
    ])

    expect(logPayment).toHaveBeenCalledTimes(1)
  })

  it('claims under the real event id and type', async () => {
    await processRazorpayWebhook(chargedPayload, 'sig', EVENT_ID)

    expect(claimWebhookEvent).toHaveBeenCalledWith(EVENT_ID, 'razorpay', 'subscription.charged')
  })
})

describe('the winning caller processes the event', () => {
  it('activates the subscription and sets the plan from notes.tier', async () => {
    await processRazorpayWebhook(payload('subscription.activated'), 'sig', EVENT_ID)

    expect(updatePartial).toHaveBeenCalledWith(CLIENT, expect.objectContaining({ status: 'active', plan: 'growth' }))
  })

  it('records the payment on subscription.charged', async () => {
    await processRazorpayWebhook(chargedPayload, 'sig', EVENT_ID)

    expect(logPayment).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: CLIENT, paymentId: 'pay_1', amount: 549900, status: 'captured' })
    )
  })

  it('does not release a claim it processed successfully', async () => {
    await processRazorpayWebhook(chargedPayload, 'sig', EVENT_ID)

    expect(releaseWebhookEventClaim).not.toHaveBeenCalled()
  })
})

// The claim row is written up front, so a crash mid-processing would otherwise
// leave the event permanently marked done and Razorpay's retry ignored --
// losing a real payment.
describe('when processing fails after the claim', () => {
  const boom = new Error('DynamoDB unavailable')

  beforeEach(() => {
    updatePartial.mockImplementation(() => {
      throw boom
    })
  })

  it('hands the claim back so the retry can be processed', async () => {
    await processRazorpayWebhook(payload('subscription.activated'), 'sig', EVENT_ID).catch(() => undefined)

    expect(releaseWebhookEventClaim).toHaveBeenCalledWith(EVENT_ID)
  })

  it('rethrows, so the route 500s and Razorpay retries', async () => {
    let thrown: unknown = null
    try {
      await processRazorpayWebhook(payload('subscription.activated'), 'sig', EVENT_ID)
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBe(boom)
  })
})

// These conditions are permanent: a retry would repeat the same no-op forever,
// so they return 200 and keep the claim rather than releasing it.
describe('events that are handled by being ignored', () => {
  it('ignores an unmapped event type without touching the account', async () => {
    const result = await processRazorpayWebhook(payload('subscription.some_future_type'), 'sig', EVENT_ID)

    expect(result.status).toBe(200)
    expect(updatePartial).not.toHaveBeenCalled()
    expect(releaseWebhookEventClaim).not.toHaveBeenCalled()
  })

  it('ignores a payload whose subscription id does not match the local row', async () => {
    getByAccountId.mockResolvedValue({ accountId: CLIENT, providerSubscriptionId: 'sub_someone_else', plan: 'free' })

    const result = await processRazorpayWebhook(payload('subscription.activated'), 'sig', EVENT_ID)

    expect(result.status).toBe(200)
    expect(updatePartial).not.toHaveBeenCalled()
  })

  it('ignores an event whose notes carry no clientId', async () => {
    const noNotes = JSON.stringify({
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: SUB_ID, notes: {} } } },
    })

    const result = await processRazorpayWebhook(noNotes, 'sig', EVENT_ID)

    expect(result.status).toBe(200)
    expect(updatePartial).not.toHaveBeenCalled()
  })
})
