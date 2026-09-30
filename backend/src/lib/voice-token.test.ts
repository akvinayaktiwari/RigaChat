import { describe, it, expect, vi, afterEach } from 'vitest'
import { generateToken, validateToken } from './voice-token.js'

const SECRET = 'test-secret'

describe('voice token', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('validates a widget token and returns its agentId', () => {
    const token = generateToken('agent-1', SECRET)

    expect(validateToken(token, SECRET)).toEqual({ valid: true, agentId: 'agent-1' })
  })

  // The Lambda's RAG route validates without a scope. A transfer token is
  // scoped to its destination number, so it must not double as a widget token.
  it('rejects a scoped token when validated without its scope', () => {
    const token = generateToken('agent-1', SECRET, '+919000000000')

    expect(validateToken(token, SECRET).valid).toBe(false)
  })

  it('rejects a token signed with a different secret', () => {
    const token = generateToken('agent-1', 'other-secret')

    expect(validateToken(token, SECRET).valid).toBe(false)
  })

  it('rejects a token older than five minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'))
    const token = generateToken('agent-1', SECRET)

    vi.setSystemTime(new Date('2026-09-24T10:05:01Z'))

    expect(validateToken(token, SECRET).valid).toBe(false)
  })

  it('rejects malformed input', () => {
    expect(validateToken('', SECRET).valid).toBe(false)
    expect(validateToken('not-a-token', SECRET).valid).toBe(false)
  })
})
