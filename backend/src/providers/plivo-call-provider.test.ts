import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { transferCall } from './plivo-call-provider.js'

const CREDENTIALS = { authId: 'MA123', authToken: 'secret-token' }
const INPUT = {
  credentials: CREDENTIALS,
  callUuid: 'call-uuid-1',
  transferUrl: 'https://voice.example.com/plivo/transfer?token=t&to=%2B919876543210',
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('transferCall', () => {
  it('moves the caller leg to the transfer URL', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    await expect(transferCall(INPUT)).resolves.toBe(true)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.plivo.com/v1/Account/MA123/Call/call-uuid-1/')
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body)
    // 'aleg' is the caller. Transferring the b-leg would move the wrong party
    // and leave the caller on a dead stream.
    expect(body.legs).toBe('aleg')
    expect(body.aleg_url).toBe(INPUT.transferUrl)
  })

  it('authenticates with the account credentials', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    await transferCall(INPUT)

    const expected = Buffer.from('MA123:secret-token').toString('base64')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Basic ${expected}`)
  })

  it('url-encodes a call uuid rather than splicing it into the path raw', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    await transferCall({ ...INPUT, callUuid: 'weird/uuid?x=1' })

    expect(fetchMock.mock.calls[0][0]).toContain('weird%2Fuuid%3Fx%3D1')
  })

  // Every failure below must return false rather than throw. The caller is on
  // the line: a thrown error here would end their call instead of degrading to
  // "someone will ring you back".
  it('returns false on a rejected request', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'call not found' })

    await expect(transferCall(INPUT)).resolves.toBe(false)
  })

  it('returns false when the network throws', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))

    await expect(transferCall(INPUT)).resolves.toBe(false)
  })

  it('returns false rather than hanging when Plivo does not answer', async () => {
    // A slow transfer is worse than a failed one: on failure the agent can
    // still offer a callback, but only while the call is still up.
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    vi.useFakeTimers()
    const pending = transferCall(INPUT)
    await vi.advanceTimersByTimeAsync(6000)
    await expect(pending).resolves.toBe(false)
    vi.useRealTimers()
  })

  it('does not leak the auth token into the failure log', async () => {
    const consoleError = vi.spyOn(console, 'error')
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })

    await transferCall(INPUT)

    for (const call of consoleError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('secret-token')
    }
  })
})
