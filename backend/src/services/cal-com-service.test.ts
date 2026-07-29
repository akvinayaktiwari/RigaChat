import { beforeEach, describe, expect, it, vi } from 'vitest'

const getClientById = vi.fn()
const updateClient = vi.fn()
const encrypt = vi.fn(async (s: string) => `enc:${s}`)
const decrypt = vi.fn(async (s: string) => s.replace(/^enc:/, ''))
const createBooking = vi.fn()
const refreshAccessToken = vi.fn()
const getEventTypes = vi.fn()
const exchangeCodeForTokens = vi.fn()

vi.mock('../repositories/client-repository.js', () => ({
  getClientById,
  updateClient,
  removeClientCalComConnection: vi.fn(),
}))
vi.mock('../lib/kms.js', () => ({ encrypt, decrypt }))
vi.mock('../lib/cal-com.js', () => ({
  createBooking,
  refreshAccessToken,
  getEventTypes,
  exchangeCodeForTokens,
  getOAuthUrl: vi.fn(),
}))

const { bookViaCalCom } = await import('./cal-com-service.js')

const baseConnection = {
  provider: 'cal_com' as const,
  connected: true,
  accessTokenEncrypted: 'enc:token-1',
  refreshTokenEncrypted: 'enc:refresh-1',
  defaultEventTypeId: 42,
  connectedAt: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  getClientById.mockReset()
  updateClient.mockReset()
  encrypt.mockClear()
  decrypt.mockClear()
  createBooking.mockReset()
  refreshAccessToken.mockReset()
})

describe('bookViaCalCom', () => {
  it('returns connected:false when the client has no Cal.com connection', async () => {
    getClientById.mockResolvedValueOnce({ clientId: 'client-1' })

    const result = await bookViaCalCom({
      clientId: 'client-1',
      start: '2026-08-01T10:00:00Z',
      attendeeName: 'Priya',
      attendeeTimeZone: 'Asia/Kolkata',
    })

    expect(result).toEqual({ connected: false })
    expect(createBooking).not.toHaveBeenCalled()
  })

  it('returns connected:false when connected but no default event type is set yet', async () => {
    getClientById.mockResolvedValueOnce({
      clientId: 'client-1',
      calComConnection: { ...baseConnection, defaultEventTypeId: undefined },
    })

    const result = await bookViaCalCom({
      clientId: 'client-1',
      start: '2026-08-01T10:00:00Z',
      attendeeName: 'Priya',
      attendeeTimeZone: 'Asia/Kolkata',
    })

    expect(result).toEqual({ connected: false })
    expect(createBooking).not.toHaveBeenCalled()
  })

  it('books directly with the existing token when it is not expiring soon', async () => {
    getClientById.mockResolvedValueOnce({
      clientId: 'client-1',
      calComConnection: { ...baseConnection, tokenExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString() },
    })
    createBooking.mockResolvedValueOnce({ uid: 'booking-1', status: 'accepted', start: 'x', end: 'y' })

    const result = await bookViaCalCom({
      clientId: 'client-1',
      start: '2026-08-01T10:00:00Z',
      attendeeName: 'Priya',
      attendeeTimeZone: 'Asia/Kolkata',
    })

    expect(refreshAccessToken).not.toHaveBeenCalled()
    expect(createBooking).toHaveBeenCalledWith('token-1', {
      eventTypeId: 42,
      start: '2026-08-01T10:00:00Z',
      attendeeName: 'Priya',
      attendeeEmail: undefined,
      attendeeTimeZone: 'Asia/Kolkata',
    })
    expect(result).toEqual({ connected: true, booking: { uid: 'booking-1', status: 'accepted', start: 'x', end: 'y' } })
  })

  // Regression guard for the exact bug class journey-compiler-service.ts's
  // wait_and_recheck fix addressed elsewhere in this codebase: a token
  // refreshed reactively (only after a 401) is too late for a 30-minute
  // token lifetime under real request latency. This asserts the PROACTIVE
  // path: expiring-soon triggers a refresh BEFORE the booking call, not
  // after a failure.
  it('proactively refreshes the token when it is expiring soon, before booking', async () => {
    getClientById.mockResolvedValueOnce({
      clientId: 'client-1',
      calComConnection: { ...baseConnection, tokenExpiresAt: new Date(Date.now() + 60 * 1000).toISOString() },
    })
    refreshAccessToken.mockResolvedValueOnce({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    createBooking.mockResolvedValueOnce({ uid: 'booking-2', status: 'accepted', start: 'x', end: 'y' })

    await bookViaCalCom({
      clientId: 'client-1',
      start: '2026-08-01T10:00:00Z',
      attendeeName: 'Priya',
      attendeeTimeZone: 'Asia/Kolkata',
    })

    expect(refreshAccessToken).toHaveBeenCalledWith('refresh-1')
    expect(createBooking).toHaveBeenCalledWith('new-token', expect.anything())
    expect(updateClient).toHaveBeenCalledWith(
      'client-1',
      expect.objectContaining({ calComConnection: expect.objectContaining({ accessTokenEncrypted: 'enc:new-token' }) })
    )
  })

  it('propagates a real booking failure from Cal.com rather than swallowing it', async () => {
    getClientById.mockResolvedValueOnce({
      clientId: 'client-1',
      calComConnection: { ...baseConnection, tokenExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString() },
    })
    createBooking.mockRejectedValueOnce(new Error('Cal.com createBooking failed: attendee email is required'))

    await expect(
      bookViaCalCom({
        clientId: 'client-1',
        start: '2026-08-01T10:00:00Z',
        attendeeName: 'Priya',
        attendeeTimeZone: 'Asia/Kolkata',
      })
    ).rejects.toThrow(/attendee email is required/)
  })
})
