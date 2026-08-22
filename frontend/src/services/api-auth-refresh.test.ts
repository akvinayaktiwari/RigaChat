import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, setAuthToken, setTokenRefreshHandler } from './api'

// Cognito issues a 60-minute ID token and a 5-day refresh token. The refresh
// token was discarded at sign-in and the ID token never renewed, so a tab left
// open past the hour kept sending a dead token forever: every request 401'd,
// the user was never signed out or redirected, and the UI showed unexplained
// failures. Seen live on 2026-08-22 with a token eight hours past expiry.

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// A Response body can only be read once, so a mock that resolves the SAME
// object for every call throws "Body is unusable" on the second read. Each
// call has to get a fresh Response.
function alwaysReplies(status: number, body: unknown): void {
  fetchMock.mockImplementation(async () => jsonResponse(status, body))
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setAuthToken('expired-token')
  setTokenRefreshHandler(null)
})

afterEach(() => {
  setAuthToken(null)
  setTokenRefreshHandler(null)
  vi.unstubAllGlobals()
})

function authHeaderOf(call: unknown[]): string | undefined {
  const init = call[1] as { headers?: Record<string, string> }
  return init.headers?.Authorization
}

describe('when a token expires mid-session', () => {
  it('renews it and replays the request', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: 'Authentication required' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true, data: 'ok' }))
    setTokenRefreshHandler(async () => 'fresh-token')

    const result = await apiClient<string>('/api/thing')

    expect(result).toEqual({ success: true, data: 'ok' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('replays with the NEW token, not the dead one', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { success: false, error: 'Authentication required' }))
      .mockResolvedValueOnce(jsonResponse(200, { success: true }))
    setTokenRefreshHandler(async () => 'fresh-token')

    await apiClient('/api/thing')

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer expired-token')
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe('Bearer fresh-token')
  })

  // Only one refresh, however many requests are in flight. A page fires several
  // at once; without single-flighting, the first expiry triggers a burst of
  // parallel refreshes that invalidate each other.
  it('refreshes once for concurrent requests, not once each', async () => {
    fetchMock.mockImplementation(async (_url: string, init: { headers?: Record<string, string> }) =>
      init.headers?.Authorization === 'Bearer fresh-token'
        ? jsonResponse(200, { success: true })
        : jsonResponse(401, { success: false, error: 'Authentication required' })
    )
    const refresh = vi.fn(async () => 'fresh-token')
    setTokenRefreshHandler(refresh)

    await Promise.all([apiClient('/api/a'), apiClient('/api/b'), apiClient('/api/c')])

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('allows a later refresh once the first has settled', async () => {
    alwaysReplies(401, { success: false, error: 'Authentication required' })
    const refresh = vi.fn(async () => null)
    setTokenRefreshHandler(refresh)

    await apiClient('/api/a')
    await apiClient('/api/b')

    expect(refresh).toHaveBeenCalledTimes(2)
  })
})

describe('when the session is genuinely over', () => {
  it('surfaces the 401 instead of retrying forever', async () => {
    alwaysReplies(401, { success: false, error: 'Authentication required' })
    setTokenRefreshHandler(async () => null)

    const result = await apiClient('/api/thing')

    expect(result).toEqual({ success: false, error: 'Authentication required' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries at most once even if the replay also 401s', async () => {
    alwaysReplies(401, { success: false, error: 'Authentication required' })
    setTokenRefreshHandler(async () => 'still-no-good')

    await apiClient('/api/thing')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('requests that were never authenticated', () => {
  // A 401 without a token is a genuinely anonymous request, not an expiry --
  // refreshing would be pointless and could bounce a signed-out visitor.
  it('does not attempt a refresh when no token was sent', async () => {
    setAuthToken(null)
    alwaysReplies(401, { success: false, error: 'Authentication required' })
    const refresh = vi.fn(async () => 'fresh-token')
    setTokenRefreshHandler(refresh)

    await apiClient('/api/thing')

    expect(refresh).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('everything else is untouched', () => {
  it('leaves a successful request alone', async () => {
    alwaysReplies(200, { success: true, data: 42 })
    setTokenRefreshHandler(vi.fn(async () => 'fresh-token'))

    await expect(apiClient<number>('/api/thing')).resolves.toEqual({ success: true, data: 42 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not refresh on a non-401 failure', async () => {
    alwaysReplies(500, { success: false, error: 'boom' })
    const refresh = vi.fn(async () => 'fresh-token')
    setTokenRefreshHandler(refresh)

    await apiClient('/api/thing')

    expect(refresh).not.toHaveBeenCalled()
  })

  it('still handles 204 with no body', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))

    await expect(apiClient('/api/thing', 'DELETE')).resolves.toEqual({ success: true })
  })
})
