import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateToken, validateToken } from './voice-token.js'

const SECRET = 'test-voice-auth-secret'
const AGENT_ID = 'agent_123'

afterEach(() => {
  vi.useRealTimers()
})

describe('generateToken / validateToken, unscoped (the widget path)', () => {
  it('round-trips a token and returns its agentId', () => {
    const token = generateToken(AGENT_ID, SECRET)

    expect(validateToken(token, SECRET)).toEqual({ valid: true, agentId: AGENT_ID })
  })

  it('round-trips an agentId containing the payload separators', () => {
    const awkward = 'agent:with.dots:and:colons'
    const token = generateToken(awkward, SECRET)

    expect(validateToken(token, SECRET)).toEqual({ valid: true, agentId: awkward })
  })

  it('rejects a token signed with a different secret', () => {
    const token = generateToken(AGENT_ID, SECRET)

    expect(validateToken(token, 'a-different-secret')).toEqual({ valid: false })
  })

  it('rejects a tampered payload', () => {
    const token = generateToken(AGENT_ID, SECRET)
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const forged = decoded.replace(AGENT_ID, 'agent_other')

    expect(validateToken(Buffer.from(forged).toString('base64url'), SECRET)).toEqual({ valid: false })
  })

  it('rejects a token with no signature separator', () => {
    expect(validateToken(Buffer.from('no-separator-here').toString('base64url'), SECRET)).toEqual({
      valid: false,
    })
  })

  it('rejects a signature that is not the expected length', () => {
    const token = generateToken(AGENT_ID, SECRET)
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const truncated = decoded.slice(0, decoded.lastIndexOf('.') + 5)

    expect(validateToken(Buffer.from(truncated).toString('base64url'), SECRET)).toEqual({ valid: false })
  })

  it('rejects a token whose timestamp is not a number', () => {
    // Signed correctly, so this can only fail on the timestamp check.
    const payload = `${AGENT_ID}:not-a-timestamp`
    const signature = createHmac('sha256', SECRET).update(payload).digest('hex')
    const token = Buffer.from(`${payload}.${signature}`).toString('base64url')

    expect(validateToken(token, SECRET)).toEqual({ valid: false })
  })

  it('rejects a token older than five minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-11T10:00:00Z'))
    const token = generateToken(AGENT_ID, SECRET)

    vi.setSystemTime(new Date('2026-09-11T10:04:59Z'))
    expect(validateToken(token, SECRET)).toEqual({ valid: true, agentId: AGENT_ID })

    vi.setSystemTime(new Date('2026-09-11T10:05:01Z'))
    expect(validateToken(token, SECRET)).toEqual({ valid: false })
  })
})

describe('the signature scope (the transfer path)', () => {
  const DESTINATION = '+919876543210'

  it('round-trips a token scoped to its destination', () => {
    const token = generateToken(AGENT_ID, SECRET, DESTINATION)

    expect(validateToken(token, SECRET, DESTINATION)).toEqual({ valid: true, agentId: AGENT_ID })
  })

  it('refuses a token minted for one number against a different number', () => {
    const token = generateToken(AGENT_ID, SECRET, DESTINATION)

    expect(validateToken(token, SECRET, '+919999999999')).toEqual({ valid: false })
  })

  // The reason the scope exists. GET /api/voice-agents/token is public and
  // agent ids are pasted into a client's embed snippet, so anyone can mint a
  // widget token for any agent. If that token authorised a transfer, the dial
  // endpoint would be a standing instruction to call any number at our expense.
  it('does not let a widget token (no scope) authorise a transfer', () => {
    const widgetToken = generateToken(AGENT_ID, SECRET)

    expect(validateToken(widgetToken, SECRET, DESTINATION)).toEqual({ valid: false })
  })

  // The converse: a transfer token must not be usable to open a voice socket,
  // which validates unscoped.
  it('does not let a scoped token pass an unscoped check', () => {
    const transferToken = generateToken(AGENT_ID, SECRET, DESTINATION)

    expect(validateToken(transferToken, SECRET)).toEqual({ valid: false })
  })

  it('treats an empty scope as unscoped on both halves', () => {
    const token = generateToken(AGENT_ID, SECRET, '')

    expect(validateToken(token, SECRET, '')).toEqual({ valid: true, agentId: AGENT_ID })
    expect(validateToken(token, SECRET)).toEqual({ valid: true, agentId: AGENT_ID })
  })
})
