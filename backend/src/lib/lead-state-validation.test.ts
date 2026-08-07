import { describe, expect, it } from 'vitest'
import { LeadStateValidationError, parseLeadRef, parseStatePatch } from './lead-state-validation.js'

// This module parses request bodies straight off the wire, so every test here
// is an untrusted-input test: the question is never "does the happy path work"
// but "what does a hostile or malformed body do".

describe('parseLeadRef', () => {
  it('accepts each source with its own parent key', () => {
    expect(parseLeadRef({ source: 'chat', botId: 'b1', leadId: 'l1' })).toEqual({
      source: 'chat',
      botId: 'b1',
      leadId: 'l1',
    })
    expect(parseLeadRef({ source: 'form', formId: 'f1', leadId: 'l1' })).toEqual({
      source: 'form',
      formId: 'f1',
      leadId: 'l1',
    })
    expect(parseLeadRef({ source: 'meta', pageId: 'p1', leadId: 'l1' })).toEqual({
      source: 'meta',
      pageId: 'p1',
      leadId: 'l1',
    })
  })

  it('rejects a source paired with the wrong parent key', () => {
    // A chat ref carrying a formId would read the wrong table entirely.
    expect(parseLeadRef({ source: 'chat', formId: 'f1', leadId: 'l1' })).toBeNull()
    expect(parseLeadRef({ source: 'meta', botId: 'b1', leadId: 'l1' })).toBeNull()
  })

  it('rejects missing, empty and non-string leadIds', () => {
    expect(parseLeadRef({ source: 'chat', botId: 'b1' })).toBeNull()
    expect(parseLeadRef({ source: 'chat', botId: 'b1', leadId: '' })).toBeNull()
    expect(parseLeadRef({ source: 'chat', botId: 'b1', leadId: 42 })).toBeNull()
  })

  it('rejects unknown sources and non-object bodies', () => {
    expect(parseLeadRef({ source: 'voice', botId: 'b1', leadId: 'l1' })).toBeNull()
    expect(parseLeadRef(null)).toBeNull()
    expect(parseLeadRef('chat')).toBeNull()
    expect(parseLeadRef(undefined)).toBeNull()
  })
})

describe('parseStatePatch', () => {
  it('accepts a valid status', () => {
    expect(parseStatePatch({ status: 'qualified' })).toMatchObject({ status: 'qualified' })
  })

  it('rejects a status outside the enum', () => {
    expect(() => parseStatePatch({ status: 'archived' })).toThrow(LeadStateValidationError)
  })

  it('rejects an empty patch rather than writing nothing', () => {
    expect(() => parseStatePatch({})).toThrow(LeadStateValidationError)
    expect(() => parseStatePatch({ leadRef: { source: 'chat' } })).toThrow(LeadStateValidationError)
  })

  // null clears a field, absent leaves it alone. The repository distinguishes
  // the two by key PRESENCE, so a cleared field must survive as an explicit
  // undefined -- if it were dropped, "clear my follow-up" would silently no-op.
  it('turns null into a present-but-undefined field so the repository REMOVEs it', () => {
    const patch = parseStatePatch({ nextActionAt: null })
    expect('nextActionAt' in patch).toBe(true)
    expect(patch.nextActionAt).toBeUndefined()
  })

  it('leaves untouched fields absent entirely', () => {
    const patch = parseStatePatch({ status: 'contacted' })
    expect('ownerId' in patch).toBe(false)
    expect('nextActionAt' in patch).toBe(false)
  })

  it('rejects a nextActionAt that is not a real timestamp', () => {
    expect(() => parseStatePatch({ nextActionAt: 'next tuesday' })).toThrow(LeadStateValidationError)
    expect(() => parseStatePatch({ nextActionAt: 12345 })).toThrow(LeadStateValidationError)
  })

  it('accepts an ISO-8601 nextActionAt', () => {
    expect(parseStatePatch({ nextActionAt: '2026-08-09T10:00:00.000Z' })).toMatchObject({
      nextActionAt: '2026-08-09T10:00:00.000Z',
    })
  })

  it('bounds leadScore to 0-100 and rejects non-finite values', () => {
    expect(parseStatePatch({ leadScore: 0 })).toMatchObject({ leadScore: 0 })
    expect(parseStatePatch({ leadScore: 100 })).toMatchObject({ leadScore: 100 })
    expect(() => parseStatePatch({ leadScore: -1 })).toThrow(LeadStateValidationError)
    expect(() => parseStatePatch({ leadScore: 101 })).toThrow(LeadStateValidationError)
    expect(() => parseStatePatch({ leadScore: Number.NaN })).toThrow(LeadStateValidationError)
    expect(() => parseStatePatch({ leadScore: '80' })).toThrow(LeadStateValidationError)
  })

  // A lead reopened from 'closed' must not keep a stale 'lost' hanging off it.
  it('clears the outcome when a lead moves off closed', () => {
    const patch = parseStatePatch({ status: 'contacted' })
    expect('outcome' in patch).toBe(true)
    expect(patch.outcome).toBeUndefined()
  })

  it('keeps an explicitly supplied outcome even while changing status', () => {
    expect(parseStatePatch({ status: 'contacted', outcome: 'won' })).toMatchObject({
      status: 'contacted',
      outcome: 'won',
    })
  })

  it('does not clear the outcome when the lead is being closed', () => {
    const patch = parseStatePatch({ status: 'closed' })
    expect('outcome' in patch).toBe(false)
  })

  it('rejects an outcome outside the enum', () => {
    expect(() => parseStatePatch({ outcome: 'maybe' })).toThrow(LeadStateValidationError)
  })

  // replied and appointmentBooked are journey-observed facts. Accepting them
  // here would let the dashboard fake the conditions a recheck step branches on.
  it('ignores journey-owned fields even when a client sends them', () => {
    expect(() => parseStatePatch({ replied: true })).toThrow(LeadStateValidationError)
    expect(() => parseStatePatch({ appointmentBooked: true })).toThrow(LeadStateValidationError)
    const patch = parseStatePatch({ status: 'contacted', replied: true })
    expect('replied' in patch).toBe(false)
  })
})
