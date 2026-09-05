import http from 'node:http'
import { createHmac } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../repositories/voice-repository.js', () => ({
  getVoiceAgentById: vi.fn(),
}))

vi.mock('../repositories/voice-phone-lookup-repository.js', () => ({
  getAgentForPhoneNumber: vi.fn(),
}))

vi.mock('../providers/plivo-call-provider.js', () => ({
  transferCall: vi.fn(),
}))

// Constructing the real one opens a socket to OpenAI. Only its constructor
// arguments matter here -- what it does with them is session.test.ts's job.
const sessionMock = vi.hoisted(() => {
  const constructed: Array<{ transport: unknown; config: Record<string, unknown> }> = []
  class FakeVoiceSession {
    cleanup = vi.fn()
    constructor(transport: unknown, config: Record<string, unknown>) {
      constructed.push({ transport, config })
    }
  }
  return { FakeVoiceSession, constructed }
})

vi.mock('./session.js', () => ({ VoiceSession: sessionMock.FakeVoiceSession }))

const adapterMock = vi.hoisted(() => {
  const constructed: unknown[] = []
  class FakePlivoAudioAdapter {
    constructor(socket: unknown) {
      constructed.push(socket)
    }
  }
  return { FakePlivoAudioAdapter, constructed }
})

vi.mock('./transports/plivo-audio-adapter.js', () => ({
  PlivoAudioAdapter: adapterMock.FakePlivoAudioAdapter,
}))

import {
  SessionRegistry,
  buildInstructions,
  buildTransferCapability,
  createRequestHandler,
  handleConnection,
  isTelephonyEnabled,
  type RelayConfig,
  type RelayContext,
  type TelephonyConfig,
} from './relay.js'
import { generateToken } from './auth.js'
import { getVoiceAgentById } from '../repositories/voice-repository.js'
import { getAgentForPhoneNumber } from '../repositories/voice-phone-lookup-repository.js'
import { transferCall } from '../providers/plivo-call-provider.js'
import type { BusinessHours, VoiceAgent, VoicePhoneLookup } from '../types/index.js'

const AUTH_SECRET = 'test-voice-secret'
const PLIVO_AUTH_TOKEN = 'test-plivo-token'
const PUBLIC_HOST = 'relay.example.com'

const TELEPHONY_CONFIG: TelephonyConfig = {
  authSecret: AUTH_SECRET,
  publicHost: PUBLIC_HOST,
  plivoAuthToken: PLIVO_AUTH_TOKEN,
  plivoAuthId: 'test-plivo-auth-id',
  maxConcurrentCalls: 10,
}

const PHONE_LOOKUP: VoicePhoneLookup = {
  phoneNumber: '+912240000000',
  agentId: 'agent-1',
  clientId: 'client-1',
  assignedAt: '2026-09-01T00:00:00.000Z',
}

const AGENT: VoiceAgent = {
  agentId: 'agent-1',
  clientId: 'client-1',
  name: 'Ravi',
  voice: 'coral',
  greetingMessage: 'Hello, Acme Estates.',
  brandColor: '#000000',
  widgetPosition: 'bottom-right',
  maxSessionDuration: 10,
  isEnabled: true,
  isIndexed: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

function contextWith(overrides: Partial<RelayConfig> = {}, sessions = new SessionRegistry()): RelayContext {
  return { config: { ...TELEPHONY_CONFIG, ...overrides }, sessions }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionMock.constructed.length = 0
  adapterMock.constructed.length = 0
  vi.mocked(getVoiceAgentById).mockResolvedValue(AGENT)
  vi.mocked(getAgentForPhoneNumber).mockResolvedValue(PHONE_LOOKUP)
  vi.mocked(transferCall).mockResolvedValue(true)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('isTelephonyEnabled', () => {
  it('is off until both the token and the public host are set', () => {
    // Fail-closed: a public phone number is an unauthenticated door to a
    // metered OpenAI session, so half a configuration must not open it.
    expect(isTelephonyEnabled({ ...TELEPHONY_CONFIG, plivoAuthToken: undefined })).toBe(false)
    expect(isTelephonyEnabled({ ...TELEPHONY_CONFIG, publicHost: undefined })).toBe(false)
    expect(isTelephonyEnabled(TELEPHONY_CONFIG)).toBe(true)
  })
})

describe('buildInstructions', () => {
  it('uses the agent system prompt when it has one', () => {
    expect(buildInstructions({ ...AGENT, systemPrompt: '  You are Ravi.  ' })).toBe('You are Ravi.')
  })

  it('builds a greeting persona when the prompt is blank', () => {
    const instructions = buildInstructions({ ...AGENT, systemPrompt: '   ' })
    expect(instructions).toContain('You are Ravi')
    expect(instructions).toContain('Hello, Acme Estates.')
  })
})

// ---------------------------------------------------------------------------
// The HTTP endpoints are driven through a real server on an ephemeral port
// rather than fabricated req/res objects: the body reader, the header names and
// the status codes are the behaviour under test, and a fake would be asserting
// against itself.
// ---------------------------------------------------------------------------

describe('the HTTP endpoints', () => {
  let server: http.Server
  let origin: string
  let context: RelayContext

  function serve(ctx: RelayContext): void {
    context = ctx
    server.removeAllListeners('request')
    server.on('request', createRequestHandler(ctx))
  }

  beforeAll(async () => {
    server = http.createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    // close() alone waits for open connections, and the oversized-body case
    // deliberately leaves a paused, half-read request behind -- on a loaded
    // machine that is a suite that hangs rather than one that fails.
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    )
  })

  beforeEach(() => {
    serve(contextWith())
  })

  // Plivo signature V3: base64(HMAC-SHA256(authToken, url + nonce)), over the
  // URL as the relay reconstructs it -- its own public host, not the test's.
  function sign(path: string, nonce: string, token = PLIVO_AUTH_TOKEN): string {
    return createHmac('sha256', token).update(`https://${PUBLIC_HOST}${path}${nonce}`).digest('base64')
  }

  async function postAnswer(
    params: Record<string, string>,
    options: { path?: string; nonce?: string; signature?: string; body?: string } = {}
  ): Promise<Response> {
    const path = options.path ?? '/plivo/answer'
    const nonce = options.nonce ?? 'nonce-1'
    return fetch(`${origin}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-plivo-signature-v3': options.signature ?? sign(path, nonce),
        'x-plivo-signature-v3-nonce': nonce,
      },
      body: options.body ?? new URLSearchParams(params).toString(),
    })
  }

  it('answers the health check', async () => {
    const response = await fetch(`${origin}/`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('ok')
  })

  it('404s an unknown path', async () => {
    expect((await fetch(`${origin}/nope`)).status).toBe(404)
  })

  it('404s the answer webhook on the wrong method', async () => {
    expect((await fetch(`${origin}/plivo/answer`)).status).toBe(404)
  })

  describe('the answer webhook', () => {
    it('answers a claimed number with stream XML carrying a signed URL', async () => {
      const response = await postAnswer({ To: '+912240000000', From: '+919876543210', CallUUID: 'call-uuid-1' })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('application/xml')
      const xml = await response.text()
      expect(xml).toContain('<Stream bidirectional="true"')

      const streamUrl = new URL(
        xml.match(/>(wss:[^<]+)</)![1].replace(/&amp;/g, '&')
      )
      expect(streamUrl.host).toBe(PUBLIC_HOST)
      expect(streamUrl.pathname).toBe('/plivo/stream')
      expect(streamUrl.searchParams.get('agentId')).toBe('agent-1')
      expect(streamUrl.searchParams.get('from')).toBe('+919876543210')
      expect(streamUrl.searchParams.get('to')).toBe('+912240000000')
      expect(streamUrl.searchParams.get('callUuid')).toBe('call-uuid-1')
      expect(streamUrl.searchParams.get('token')).toBeTruthy()
    })

    it('refuses a request whose signature does not verify', async () => {
      // This endpoint is public and everything downstream of it costs money.
      const response = await postAnswer({ To: '+912240000000' }, { signature: 'not-a-signature' })

      expect(response.status).toBe(403)
      expect(getAgentForPhoneNumber).not.toHaveBeenCalled()
    })

    it('refuses a signature made with the wrong auth token', async () => {
      const nonce = 'nonce-1'
      const response = await postAnswer(
        { To: '+912240000000' },
        { nonce, signature: sign('/plivo/answer', nonce, 'someone-elses-token') }
      )

      expect(response.status).toBe(403)
    })

    it('refuses a valid signature replayed against a different path', async () => {
      const nonce = 'nonce-1'
      const response = await postAnswer(
        { To: '+912240000000' },
        { path: '/plivo/answer?tampered=1', nonce, signature: sign('/plivo/answer', nonce) }
      )

      expect(response.status).toBe(403)
    })

    it('is 503, not a rejection, when telephony is switched off', async () => {
      serve(contextWith({ plivoAuthToken: undefined }))

      const response = await postAnswer({ To: '+912240000000' })

      expect(response.status).toBe(503)
    })

    it('hangs up politely when the webhook carries no destination number', async () => {
      const response = await postAnswer({ From: '+919876543210' })

      expect(await response.text()).toContain('not available right now')
      expect(getAgentForPhoneNumber).not.toHaveBeenCalled()
    })

    it('hangs up politely on an unclaimed number', async () => {
      vi.mocked(getAgentForPhoneNumber).mockResolvedValue(null)

      const response = await postAnswer({ To: '+912240000000' })

      expect(await response.text()).toContain('not in service')
    })

    it('fails closed when the phone lookup itself fails', async () => {
      // Same outcome as unclaimed, but said differently on purpose: this is an
      // infrastructure problem, not a configuration one.
      vi.mocked(getAgentForPhoneNumber).mockRejectedValue(new Error('DynamoDB unavailable'))

      const response = await postAnswer({ To: '+912240000000' })

      expect(await response.text()).toContain('unable to take your call')
      expect(console.error).toHaveBeenCalled()
    })

    it('declines gracefully at the concurrency ceiling', async () => {
      // The last moment a caller can hear a sentence instead of connecting to a
      // process that then drops them.
      const sessions = new SessionRegistry()
      sessions.register({ cleanup: vi.fn() } as never)
      serve(contextWith({ maxConcurrentCalls: 1 }, sessions))

      const response = await postAnswer({ To: '+912240000000' })

      expect(await response.text()).toContain('lines are busy')
      expect(getAgentForPhoneNumber).not.toHaveBeenCalled()
    })

    it('refuses a body too large to be a webhook', async () => {
      const response = await postAnswer({}, { body: 'To=' + 'x'.repeat(70 * 1024) })

      expect(response.status).toBe(413)
    })

  })

  describe('the transfer XML endpoint', () => {
    it('returns dial XML for a valid token', async () => {
      const token = generateToken('agent-1', AUTH_SECRET)
      const response = await fetch(
        `${origin}/plivo/transfer?token=${encodeURIComponent(token)}&to=${encodeURIComponent('+919000000000')}`
      )

      expect(response.status).toBe(200)
      const xml = await response.text()
      expect(xml).toContain('+919000000000')
    })

    it('refuses an unsigned request, which would make this an open relay', async () => {
      // Without the token check anyone could make our number dial any number
      // they like, at our expense.
      const response = await fetch(`${origin}/plivo/transfer?to=${encodeURIComponent('+919000000000')}`)

      expect(response.status).toBe(403)
      expect(await response.text()).not.toContain('+919000000000')
    })

    it('refuses a token signed with the wrong secret', async () => {
      const token = generateToken('agent-1', 'someone-elses-secret')
      const response = await fetch(
        `${origin}/plivo/transfer?token=${encodeURIComponent(token)}&to=${encodeURIComponent('+919000000000')}`
      )

      expect(response.status).toBe(403)
    })

    it('refuses an expired token', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-05T10:00:00.000Z'))
      const token = generateToken('agent-1', AUTH_SECRET)
      vi.setSystemTime(new Date('2026-09-05T10:06:00.000Z'))

      const response = await fetch(
        `${origin}/plivo/transfer?token=${encodeURIComponent(token)}&to=${encodeURIComponent('+919000000000')}`
      )

      expect(response.status).toBe(403)
    })

    it('refuses a valid token with no target number', async () => {
      const token = generateToken('agent-1', AUTH_SECRET)
      const response = await fetch(`${origin}/plivo/transfer?token=${encodeURIComponent(token)}`)

      expect(response.status).toBe(403)
    })

    it('is 503 when telephony is switched off', async () => {
      serve(contextWith({ publicHost: undefined }))
      const token = generateToken('agent-1', AUTH_SECRET)

      const response = await fetch(
        `${origin}/plivo/transfer?token=${encodeURIComponent(token)}&to=${encodeURIComponent('+919000000000')}`
      )

      expect(response.status).toBe(503)
    })
  })
})

// ---------------------------------------------------------------------------
// The WebSocket half. The socket is faked the way plivo-audio-adapter.test.ts
// fakes it -- what matters here is which close code a refused connection gets,
// and what configuration a session is handed.
// ---------------------------------------------------------------------------

class FakeSocket {
  closes: Array<{ code?: number; reason?: string }> = []
  private listeners = new Map<string, Array<(arg: never) => void>>()

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason })
  }

  on(event: string, listener: (arg: never) => void): this {
    const existing = this.listeners.get(event) ?? []
    existing.push(listener)
    this.listeners.set(event, existing)
    return this
  }

  emit(event: string, arg?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      ;(listener as (arg: unknown) => void)(arg)
    }
  }

  get closeCode(): number | undefined {
    return this.closes[0]?.code
  }
}

describe('a connecting socket', () => {
  function connect(
    path: string,
    ctx: RelayContext = contextWith()
  ): { ws: FakeSocket; done: Promise<void>; context: RelayContext } {
    const ws = new FakeSocket()
    const done = handleConnection(ws as never, { url: path, headers: { host: PUBLIC_HOST } }, ctx)
    return { ws, done, context: ctx }
  }

  function streamPath(overrides: Record<string, string> = {}): string {
    const params = new URLSearchParams({
      agentId: 'agent-1',
      token: generateToken('agent-1', AUTH_SECRET),
      from: '+919876543210',
      to: '+912240000000',
      callUuid: 'call-uuid-1',
      ...overrides,
    })
    return `/plivo/stream?${params.toString()}`
  }

  function browserPath(overrides: Record<string, string> = {}): string {
    const params = new URLSearchParams({
      agentId: 'agent-1',
      token: generateToken('agent-1', AUTH_SECRET),
      ...overrides,
    })
    return `/?${params.toString()}`
  }

  it('refuses a stream when telephony is off', async () => {
    const { ws, done } = connect(streamPath(), contextWith({ plivoAuthToken: undefined }))
    await done

    expect(ws.closeCode).toBe(4003)
    expect(sessionMock.constructed).toHaveLength(0)
  })

  it('still serves the browser when telephony is off', async () => {
    const { ws, done } = connect(browserPath(), contextWith({ plivoAuthToken: undefined }))
    await done

    expect(ws.closes).toHaveLength(0)
    expect(sessionMock.constructed).toHaveLength(1)
  })

  it('refuses a connection with no credentials', async () => {
    const { ws, done } = connect('/?agentId=agent-1')
    await done

    expect(ws.closeCode).toBe(4001)
    expect(getVoiceAgentById).not.toHaveBeenCalled()
  })

  it('refuses a token minted for a different agent', async () => {
    // The token binds the agentId, so this is the check that stops one client's
    // token opening another client's agent.
    const { ws, done } = connect(
      `/?agentId=agent-2&token=${encodeURIComponent(generateToken('agent-1', AUTH_SECRET))}`
    )
    await done

    expect(ws.closeCode).toBe(4001)
    expect(getVoiceAgentById).not.toHaveBeenCalled()
  })

  it('refuses an expired token', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T10:00:00.000Z'))
    const path = browserPath()
    vi.setSystemTime(new Date('2026-09-05T10:06:00.000Z'))

    const { ws, done } = connect(path)
    await done

    expect(ws.closeCode).toBe(4001)
  })

  it('refuses a connection at the ceiling before looking anything up', async () => {
    const sessions = new SessionRegistry()
    sessions.register({ cleanup: vi.fn() } as never)

    const { ws, done } = connect(browserPath(), contextWith({ maxConcurrentCalls: 1 }, sessions))
    await done

    expect(ws.closeCode).toBe(4008)
    expect(getVoiceAgentById).not.toHaveBeenCalled()
  })

  it('refuses a connection for an agent that does not exist', async () => {
    vi.mocked(getVoiceAgentById).mockResolvedValue(null)

    const { ws, done } = connect(browserPath())
    await done

    expect(ws.closeCode).toBe(4004)
    expect(sessionMock.constructed).toHaveLength(0)
  })

  it('distinguishes a failed lookup from a missing agent', async () => {
    vi.mocked(getVoiceAgentById).mockRejectedValue(new Error('DynamoDB unavailable'))

    const { ws, done } = connect(browserPath())
    await done

    expect(ws.closeCode).toBe(4005)
    expect(sessionMock.constructed).toHaveLength(0)
  })

  it('gives a browser session no caller identity, so it records no lead', async () => {
    const { done } = connect(browserPath())
    await done

    const { transport, config } = sessionMock.constructed[0]
    expect(config.callerPhone).toBeUndefined()
    expect(config.dialledNumber).toBeUndefined()
    expect(config.transferToHuman).toBeUndefined()
    // The browser talks to the raw socket; only telephony gets the adapter.
    expect(adapterMock.constructed).toHaveLength(0)
    expect(transport).toBeInstanceOf(FakeSocket)
  })

  it('wraps a telephony socket in the Plivo adapter and passes the call details', async () => {
    const { ws, done } = connect(streamPath())
    await done

    const { config } = sessionMock.constructed[0]
    expect(config.callerPhone).toBe('+919876543210')
    expect(config.dialledNumber).toBe('+912240000000')
    expect(config.maxSessionMinutes).toBe(10)
    expect(adapterMock.constructed).toEqual([ws])
  })

  it('passes the linked bot through so voice leads join the chatbot record', async () => {
    vi.mocked(getVoiceAgentById).mockResolvedValue({ ...AGENT, botId: 'bot-1' })

    const { done } = connect(streamPath())
    await done

    expect(sessionMock.constructed[0].config.linkedBotId).toBe('bot-1')
  })

  it('ends the session when the socket closes', async () => {
    const context = contextWith()
    const { ws, done } = connect(browserPath(), context)
    await done
    expect(context.sessions.size).toBe(1)

    ws.emit('close')

    expect(context.sessions.size).toBe(0)
  })

  it('ends the session on a socket error too, so a broken call is not counted forever', async () => {
    const context = contextWith()
    const { ws, done } = connect(browserPath(), context)
    await done

    ws.emit('error', new Error('ECONNRESET'))

    expect(context.sessions.size).toBe(0)
  })
})

describe('buildTransferCapability', () => {
  const CALL_UUID = 'call-uuid-1'

  it('offers no transfer when the agent has no handoff number', () => {
    expect(buildTransferCapability(AGENT, CALL_UUID, TELEPHONY_CONFIG)).toEqual({})
  })

  it('offers no transfer without call-control credentials, and says why', () => {
    // Inbound answering keeps working; only the transfer degrades.
    const result = buildTransferCapability(
      { ...AGENT, handoffNumber: '+919000000000' },
      CALL_UUID,
      { ...TELEPHONY_CONFIG, plivoAuthId: undefined }
    )

    expect(result).toEqual({})
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('PLIVO_AUTH_ID is unset'))
  })

  it('offers no transfer when we do not know which call to move', () => {
    expect(buildTransferCapability({ ...AGENT, handoffNumber: '+919000000000' }, '', TELEPHONY_CONFIG)).toEqual({})
  })

  it('transfers to the handoff number through a signed, short-lived URL', async () => {
    const result = buildTransferCapability(
      { ...AGENT, handoffNumber: '+919000000000' },
      CALL_UUID,
      TELEPHONY_CONFIG
    )

    await expect(result.transferToHuman!()).resolves.toBe(true)

    const call = vi.mocked(transferCall).mock.calls[0][0]
    expect(call.callUuid).toBe(CALL_UUID)
    expect(call.credentials).toEqual({ authId: 'test-plivo-auth-id', authToken: PLIVO_AUTH_TOKEN })
    const transferUrl = new URL(call.transferUrl)
    expect(transferUrl.host).toBe(PUBLIC_HOST)
    expect(transferUrl.searchParams.get('to')).toBe('+919000000000')
    expect(transferUrl.searchParams.get('token')).toBeTruthy()
  })

  it('reports a transfer that Plivo refused rather than claiming success', async () => {
    vi.mocked(transferCall).mockResolvedValue(false)
    const result = buildTransferCapability(
      { ...AGENT, handoffNumber: '+919000000000' },
      CALL_UUID,
      TELEPHONY_CONFIG
    )

    await expect(result.transferToHuman!()).resolves.toBe(false)
  })

  it('mints a fresh token per transfer', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T10:00:00.000Z'))
    const result = buildTransferCapability(
      { ...AGENT, handoffNumber: '+919000000000' },
      CALL_UUID,
      TELEPHONY_CONFIG
    )

    await result.transferToHuman!()
    vi.setSystemTime(new Date('2026-09-05T10:00:05.000Z'))
    await result.transferToHuman!()

    const [first, second] = vi.mocked(transferCall).mock.calls.map(([call]) => call.transferUrl)
    expect(first).not.toBe(second)
  })

  describe('outside business hours', () => {
    // 09:00-18:00 Mon-Fri, Asia/Kolkata.
    const businessHours: BusinessHours = {
      timezone: 'Asia/Kolkata',
      days: {
        mon: [{ open: '09:00', close: '18:00' }],
        tue: [{ open: '09:00', close: '18:00' }],
        wed: [{ open: '09:00', close: '18:00' }],
        thu: [{ open: '09:00', close: '18:00' }],
        fri: [{ open: '09:00', close: '18:00' }],
      },
    }

    it('offers no transfer, but names the reopening time', () => {
      vi.useFakeTimers()
      // Saturday.
      vi.setSystemTime(new Date('2026-09-05T22:00:00.000Z'))

      const result = buildTransferCapability(
        { ...AGENT, handoffNumber: '+919000000000', businessHours },
        CALL_UUID,
        TELEPHONY_CONFIG
      )

      expect(result.transferToHuman).toBeUndefined()
      expect(result.closedUntil).toBeTruthy()
    })

    it('transfers normally inside business hours', () => {
      vi.useFakeTimers()
      // Friday 15:30 IST.
      vi.setSystemTime(new Date('2026-09-04T10:00:00.000Z'))

      const result = buildTransferCapability(
        { ...AGENT, handoffNumber: '+919000000000', businessHours },
        CALL_UUID,
        TELEPHONY_CONFIG
      )

      expect(result.transferToHuman).toBeDefined()
      expect(result.closedUntil).toBeUndefined()
    })
  })
})

describe('SessionRegistry', () => {
  it('cleans a session up exactly once when it ends', () => {
    const registry = new SessionRegistry()
    const session = { cleanup: vi.fn() }
    const id = registry.register(session as never)

    registry.end(id)
    registry.end(id)

    expect(session.cleanup).toHaveBeenCalledTimes(1)
    expect(registry.size).toBe(0)
  })

  it('ignores an unknown connection id', () => {
    const registry = new SessionRegistry()

    expect(() => registry.end('nope')).not.toThrow()
  })

  it('counts each session separately', () => {
    const registry = new SessionRegistry()
    registry.register({ cleanup: vi.fn() } as never)
    registry.register({ cleanup: vi.fn() } as never)

    expect(registry.size).toBe(2)
  })
})
