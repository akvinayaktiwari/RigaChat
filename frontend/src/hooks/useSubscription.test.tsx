import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import type { SubscriptionSummary } from '../types'

const getMySubscription = vi.fn()
vi.mock('../services/api', () => ({ getMySubscription }))

const useAuth = vi.fn()
vi.mock('./useAuth', () => ({ useAuth }))

const { SubscriptionProvider, useSubscription } = await import('./useSubscription')

const CLIENT_ID = 'client-1'
const KEY = `bb_subscription:${CLIENT_ID}`

function summary(plan: string, voiceEnabled: boolean): SubscriptionSummary {
  return {
    plan,
    status: 'active',
    trialEndsAt: null,
    features: {
      agents: { limits: { max: null } },
      voice: { enabled: voiceEnabled },
      kbFileSize: { limits: { maxBytes: 1 } },
    },
    usage: { chatConversations: 0 },
  } as unknown as SubscriptionSummary
}

// Renders the hook's observable state as text so assertions read like what a
// page would actually branch on.
function Probe(): React.ReactElement {
  const { subscription, isLoading, error } = useSubscription()
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="plan">{subscription?.plan ?? 'none'}</span>
      <span data-testid="error">{error ?? 'none'}</span>
    </div>
  )
}

function renderProvider() {
  return render(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>
  )
}

// Not using vitest globals, so Testing Library's automatic per-test cleanup
// never registers itself. Without this every render stacks in the same
// document and queries find multiple matches.
afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  useAuth.mockReturnValue({ isAuthenticated: true, user: { clientId: CLIENT_ID } })
  getMySubscription.mockResolvedValue({ success: true, data: summary('agency', true) })
})

describe('first load', () => {
  it('fetches and paints when nothing is cached', async () => {
    renderProvider()

    await waitFor(() => expect(screen.getByTestId('plan').textContent).toBe('agency'))
    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(getMySubscription).toHaveBeenCalledTimes(1)
  })

  it('writes what it fetched to the cache', async () => {
    renderProvider()

    await waitFor(() => expect(sessionStorage.getItem(KEY)).not.toBeNull())
  })

  // The whole point of the change: a reload with a warm cache must not gate
  // the page on a network round trip.
  it('paints from cache without ever showing a loading state', async () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now(), data: summary('starter', false) })
    )

    renderProvider()

    expect(screen.getByTestId('loading').textContent).toBe('false')
    expect(screen.getByTestId('plan').textContent).toBe('starter')
  })

  it('revalidates behind a cache hit and adopts the newer value', async () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now(), data: summary('starter', false) })
    )

    renderProvider()

    // Painted from cache first, corrected once the request lands. This is what
    // makes a plan change show up without anyone forcing a refresh.
    expect(screen.getByTestId('plan').textContent).toBe('starter')
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toBe('agency'))
  })
})

describe('signed out', () => {
  it('holds no subscription and never calls the API', async () => {
    useAuth.mockReturnValue({ isAuthenticated: false, user: null })

    renderProvider()

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('plan').textContent).toBe('none')
    expect(getMySubscription).not.toHaveBeenCalled()
  })
})

describe('failures', () => {
  it('surfaces an error when the request rejects and nothing is painted', async () => {
    getMySubscription.mockRejectedValue(new Error('network down'))

    renderProvider()

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('Failed to load subscription')
    )
  })

  it('surfaces the API error message when the response is unsuccessful', async () => {
    getMySubscription.mockResolvedValue({ success: false, error: 'Subscription unavailable' })

    renderProvider()

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('Subscription unavailable')
    )
  })

  // A failed revalidation must never blank a working page. This is the
  // backend-down case: the cached plan keeps driving the gated UI.
  it('keeps the cached value painted when revalidation fails', async () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now(), data: summary('agency', true) })
    )
    getMySubscription.mockRejectedValue(new Error('network down'))

    renderProvider()

    await waitFor(() => expect(getMySubscription).toHaveBeenCalled())
    expect(screen.getByTestId('plan').textContent).toBe('agency')
  })
})

describe('focus revalidation', () => {
  it('skips the refetch when the cache was written moments ago', async () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now(), data: summary('agency', true) })
    )

    renderProvider()
    await waitFor(() => expect(getMySubscription).toHaveBeenCalledTimes(1))

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    // Still 1: alt-tabbing must not turn into a request per focus.
    expect(getMySubscription).toHaveBeenCalledTimes(1)
  })

  it('refetches on focus once the cache is older than the throttle', async () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now() - 60_000, data: summary('agency', true) })
    )

    renderProvider()
    await waitFor(() => expect(getMySubscription).toHaveBeenCalledTimes(1))

    // The mount fetch rewrote the cache with a fresh timestamp, so age it back
    // out to represent a tab that has been sitting idle.
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now() - 60_000, data: summary('agency', true) })
    )

    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => expect(getMySubscription).toHaveBeenCalledTimes(2))
  })
})

describe('useSubscription outside a provider', () => {
  it('throws a named error rather than returning undefined', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => render(<Probe />)).toThrow(/must be used within a SubscriptionProvider/)

    consoleError.mockRestore()
  })
})

describe('out-of-order responses', () => {
  // The case that matters is right after a checkout: refresh() bypasses the
  // focus throttle, so it can overlap an in-flight mount fetch. If the older
  // response were allowed to land last, the user would be put back on their
  // pre-upgrade plan until the next navigation.
  it('keeps the newest request even when an older response resolves last', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    getMySubscription
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce({ success: true, data: summary('agency', true) })

    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now() - 60_000, data: summary('starter', false) })
    )

    renderProvider()
    await waitFor(() => expect(getMySubscription).toHaveBeenCalledTimes(1))

    // Second request (the "refresh after upgrade") starts and finishes first.
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ fetchedAt: Date.now() - 60_000, data: summary('starter', false) })
    )
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(screen.getByTestId('plan').textContent).toBe('agency'))

    // Now the stale first response finally lands carrying the old plan.
    await act(async () => {
      resolveFirst?.({ success: true, data: summary('starter', false) })
    })

    expect(screen.getByTestId('plan').textContent).toBe('agency')
  })
})
