import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RazorpayCheckoutOptions, RazorpayPaymentFailure } from '../lib/razorpay-checkout'

const subscribeToTier = vi.fn()
const getMySubscription = vi.fn()
const refresh = vi.fn()

vi.mock('../services/api', () => ({
  subscribeToTier: (...args: unknown[]) => subscribeToTier(...args),
  getMySubscription: () => getMySubscription(),
}))
vi.mock('../lib/razorpay-checkout', () => ({ loadRazorpayScript: () => Promise.resolve() }))
vi.mock('./useSubscription', () => ({ useSubscription: () => ({ refresh }) }))

const { useTierCheckout } = await import('./useTierCheckout')

/** Stands in for checkout.js: records handlers so a test can fire them. */
let lastCheckout: {
  options: RazorpayCheckoutOptions
  open: ReturnType<typeof vi.fn>
  fail: (failure: RazorpayPaymentFailure) => void
}

beforeEach(() => {
  subscribeToTier.mockReset().mockResolvedValue({
    success: true,
    data: { subscriptionId: 'sub_1', razorpayKeyId: 'rzp_live_x' },
  })
  getMySubscription.mockReset().mockResolvedValue({ success: true, data: { status: 'trialing' } })
  vi.spyOn(console, 'error').mockImplementation(() => {})

  // A class, not vi.fn: checkout.js is used with `new`, and the hook keeps the
  // instance to subscribe to its events.
  window.Razorpay = class {
    constructor(options: RazorpayCheckoutOptions) {
      const handlers: Record<string, (failure: RazorpayPaymentFailure) => void> = {}
      this.open = vi.fn()
      this.on = (event: 'payment.failed', handler: (failure: RazorpayPaymentFailure) => void) => {
        handlers[event] = handler
      }
      lastCheckout = { options, open: this.open, fail: (failure) => handlers['payment.failed']?.(failure) }
    }
    open: ReturnType<typeof vi.fn>
    on: (event: 'payment.failed', handler: (failure: RazorpayPaymentFailure) => void) => void
  } as unknown as typeof window.Razorpay
})

describe('a payment Razorpay rejects', () => {
  // Before this was handled, checkout.js closed its modal and the page looked
  // untouched: no error, no reason, no way to tell a decline from a misclick.
  it('surfaces the reason Razorpay gave, and says nothing was charged', async () => {
    const { result } = renderHook(() => useTierCheckout())

    await act(async () => {
      await result.current.selectTier('starter', 'INR')
    })
    act(() => {
      lastCheckout.fail({
        error: { code: 'BAD_REQUEST_ERROR', description: 'Your bank declined the mandate.', step: 'payment_authorization' },
      })
    })

    await waitFor(() => {
      expect(result.current.errorMessage).toContain('Your bank declined the mandate.')
    })
    expect(result.current.errorMessage).toContain('Nothing was charged')
  })

  it('keeps the hold resumable so the same subscription can be retried', async () => {
    const { result } = renderHook(() => useTierCheckout())

    await act(async () => {
      await result.current.selectTier('starter', 'INR')
    })
    act(() => {
      lastCheckout.fail({ error: { description: 'Payment failed.' } })
    })

    await waitFor(() => {
      expect(result.current.pendingCheckout).toEqual({
        tier: 'starter',
        currency: 'INR',
        subscriptionId: 'sub_1',
        razorpayKeyId: 'rzp_live_x',
      })
    })
  })

  it('still says nothing was charged when Razorpay gives no reason', async () => {
    const { result } = renderHook(() => useTierCheckout())

    await act(async () => {
      await result.current.selectTier('starter', 'USD')
    })
    act(() => {
      lastCheckout.fail({})
    })

    await waitFor(() => {
      expect(result.current.errorMessage).toContain('nothing was charged')
    })
  })
})

describe('the checkout request itself failing', () => {
  it('says the service was unreachable rather than blaming the payment', async () => {
    subscribeToTier.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useTierCheckout())

    await act(async () => {
      await result.current.selectTier('starter', 'USD')
    })

    await waitFor(() => {
      expect(result.current.errorMessage).toContain('could not reach the payment service')
    })
    expect(result.current.errorMessage).toContain('nothing was charged')
  })

  it('tells a customer whose currency has no configured plan what to do', async () => {
    subscribeToTier.mockResolvedValue({ success: false, code: 'CONFIG_ERROR', error: 'Missing env var' })
    const { result } = renderHook(() => useTierCheckout())

    await act(async () => {
      await result.current.selectTier('starter', 'INR')
    })

    await waitFor(() => {
      expect(result.current.errorMessage).toContain('not set up for this currency')
    })
  })
})
