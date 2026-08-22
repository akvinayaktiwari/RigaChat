import { beforeEach, describe, expect, it, vi } from 'vitest'

const updatePartial = vi.fn()
vi.mock('../repositories/subscription-repository.js', () => ({
  updatePartial: (...a: unknown[]) => updatePartial(...a),
}))
vi.mock('../repositories/payment-history-repository.js', () => ({
  getPaymentHistory: vi.fn(),
}))

const ensureTrialSubscription = vi.fn()
vi.mock('./client-service.js', () => ({
  ensureTrialSubscription: (...a: unknown[]) => ensureTrialSubscription(...a),
}))

const fetchSubscription = vi.fn()
const cancelSubscription = vi.fn()
const createSubscription = vi.fn()
vi.mock('../providers/razorpay-provider.js', () => ({
  razorpayProvider: {
    fetchSubscription: (...a: unknown[]) => fetchSubscription(...a),
    cancelSubscription: (...a: unknown[]) => cancelSubscription(...a),
    createSubscription: (...a: unknown[]) => createSubscription(...a),
  },
}))

const { subscribeToTier, BillingError } = await import('./billing-service.js')

const CLIENT = 'client-1'
const SUB_ID = 'sub_abandoned'
const GRACE_MS = 30 * 60 * 1000

function pendingRow(heldMinutesAgo: number) {
  return {
    accountId: CLIENT,
    status: 'pending_activation',
    plan: 'free',
    isInternal: false,
    paymentProvider: 'razorpay',
    providerSubscriptionId: SUB_ID,
    updatedAt: new Date(Date.now() - heldMinutesAgo * 60 * 1000).toISOString(),
  }
}

// Sync throw rather than a rejected promise: the code awaits inside try/catch
// so both behave identically, and Vitest's tracking of a mock's returned
// promise otherwise strands a derived rejection as a phantom failure.
function throws(mock: ReturnType<typeof vi.fn>, error: Error): void {
  mock.mockImplementation(() => {
    throw error
  })
}

async function errorFrom(tier: 'starter' | 'growth' | 'agency' = 'growth'): Promise<unknown> {
  try {
    await subscribeToTier(CLIENT, tier)
  } catch (error) {
    return error
  }
  throw new Error('expected subscribeToTier to throw')
}

beforeEach(() => {
  updatePartial.mockReset().mockResolvedValue(undefined)
  ensureTrialSubscription.mockReset()
  fetchSubscription.mockReset()
  cancelSubscription.mockReset().mockResolvedValue({ id: SUB_ID, status: 'cancelled' })
  createSubscription.mockReset().mockResolvedValue({ id: 'sub_new', status: 'created' })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
  process.env.RAZORPAY_PLAN_ID_GROWTH = 'plan_growth'
})

describe('a checkout still in progress', () => {
  it('keeps the hold and does not call Razorpay at all', async () => {
    ensureTrialSubscription.mockResolvedValue(pendingRow(5))

    const error = (await errorFrom()) as InstanceType<typeof BillingError>

    expect(error.code).toBe('ALREADY_SUBSCRIBED')
    expect(fetchSubscription).not.toHaveBeenCalled()
    expect(cancelSubscription).not.toHaveBeenCalled()
  })

  it('stays resumable, so the caller can reopen the same checkout', async () => {
    ensureTrialSubscription.mockResolvedValue(pendingRow(GRACE_MS / 60000 - 1))

    const error = (await errorFrom()) as InstanceType<typeof BillingError>

    expect(error.details?.providerSubscriptionId).toBe(SUB_ID)
    expect(error.details?.razorpayKeyId).toBe('rzp_test_key')
  })
})

// THE LOCKOUT THIS FIXES.
//
// Four accounts sat pending_activation from 21-26 July with auth_attempts=0 --
// checkout opened, nobody paid -- and every subscribe attempt afterwards
// returned 409 until they were cleared by hand on 2026-08-22. Nothing expired
// the hold.
describe('an abandoned checkout, past the grace window', () => {
  beforeEach(() => {
    ensureTrialSubscription.mockResolvedValue(pendingRow(45))
    fetchSubscription.mockResolvedValue({ id: SUB_ID, status: 'created', paid_count: 0 })
  })

  it('releases the hold and creates a new subscription instead of 409ing', async () => {
    await expect(subscribeToTier(CLIENT, 'growth')).resolves.toEqual({
      subscriptionId: 'sub_new',
      razorpayKeyId: 'rzp_test_key',
    })
  })

  it('cancels the abandoned subscription so its checkout link cannot still be paid', async () => {
    await subscribeToTier(CLIENT, 'growth')

    expect(cancelSubscription).toHaveBeenCalledWith(SUB_ID)
  })

  it('clears the provider fields on the local row', async () => {
    await subscribeToTier(CLIENT, 'growth')

    expect(updatePartial).toHaveBeenCalledWith(
      CLIENT,
      expect.objectContaining({ status: 'trialing', providerSubscriptionId: null, paymentProvider: null })
    )
  })

  it('honours the newly requested tier rather than resuming the old one', async () => {
    await subscribeToTier(CLIENT, 'growth')

    expect(createSubscription).toHaveBeenCalledWith('plan_growth', { clientId: CLIENT, tier: 'growth' })
  })

  it('skips the cancel call when Razorpay already cancelled it', async () => {
    fetchSubscription.mockResolvedValue({ id: SUB_ID, status: 'cancelled', paid_count: 0 })

    await subscribeToTier(CLIENT, 'growth')

    expect(cancelSubscription).not.toHaveBeenCalled()
  })
})

// THE PART MOST LIKELY TO BE WRONG, so it is pinned hardest. Releasing a hold
// on a subscription that WAS paid would let the account buy a second one and
// be charged twice. Every uncertain path must keep the hold.
describe('when releasing could cause a double charge, it refuses', () => {
  it('keeps the hold when Razorpay reports the subscription active', async () => {
    ensureTrialSubscription.mockResolvedValue(pendingRow(45))
    fetchSubscription.mockResolvedValue({ id: SUB_ID, status: 'active', paid_count: 1 })

    const error = (await errorFrom()) as InstanceType<typeof BillingError>

    expect(error.code).toBe('ALREADY_SUBSCRIBED')
    expect(cancelSubscription).not.toHaveBeenCalled()
    expect(createSubscription).not.toHaveBeenCalled()
  })

  it('treats any paid_count above zero as paid, whatever the status says', async () => {
    ensureTrialSubscription.mockResolvedValue(pendingRow(45))
    fetchSubscription.mockResolvedValue({ id: SUB_ID, status: 'halted', paid_count: 1 })

    expect(((await errorFrom()) as InstanceType<typeof BillingError>).code).toBe('ALREADY_SUBSCRIBED')
    expect(createSubscription).not.toHaveBeenCalled()
  })

  it('corrects the local row to active when the webhook never landed', async () => {
    ensureTrialSubscription.mockResolvedValue(pendingRow(45))
    fetchSubscription.mockResolvedValue({ id: SUB_ID, status: 'active', paid_count: 1 })

    await errorFrom()

    expect(updatePartial).toHaveBeenCalledWith(CLIENT, { status: 'active' })
  })

  it('keeps the hold when Razorpay cannot be reached', async () => {
    ensureTrialSubscription.mockResolvedValue(pendingRow(45))
    throws(fetchSubscription, new Error('network down'))

    expect(((await errorFrom()) as InstanceType<typeof BillingError>).code).toBe('ALREADY_SUBSCRIBED')
    expect(createSubscription).not.toHaveBeenCalled()
  })

  it('keeps the hold when the abandoned subscription cannot be cancelled', async () => {
    ensureTrialSubscription.mockResolvedValue(pendingRow(45))
    fetchSubscription.mockResolvedValue({ id: SUB_ID, status: 'created', paid_count: 0 })
    throws(cancelSubscription, new Error('cancel failed'))

    expect(((await errorFrom()) as InstanceType<typeof BillingError>).code).toBe('ALREADY_SUBSCRIBED')
    expect(createSubscription).not.toHaveBeenCalled()
    // the local row must not be cleared if the old link is still payable
    expect(updatePartial).not.toHaveBeenCalled()
  })

  it('keeps the hold when there is no subscription id to verify', async () => {
    ensureTrialSubscription.mockResolvedValue({ ...pendingRow(45), providerSubscriptionId: null })

    expect(((await errorFrom()) as InstanceType<typeof BillingError>).code).toBe('ALREADY_SUBSCRIBED')
    expect(fetchSubscription).not.toHaveBeenCalled()
  })
})

describe('unrelated guards still apply', () => {
  it('an active subscription is never released, however old', async () => {
    ensureTrialSubscription.mockResolvedValue({ ...pendingRow(60 * 24 * 30), status: 'active' })

    expect(((await errorFrom()) as InstanceType<typeof BillingError>).code).toBe('ALREADY_SUBSCRIBED')
    expect(fetchSubscription).not.toHaveBeenCalled()
  })

  it('internal accounts are refused before any of this runs', async () => {
    ensureTrialSubscription.mockResolvedValue({ ...pendingRow(45), isInternal: true })

    expect(((await errorFrom()) as InstanceType<typeof BillingError>).code).toBe('INTERNAL_ACCOUNT_NO_BILLING')
    expect(fetchSubscription).not.toHaveBeenCalled()
  })
})
