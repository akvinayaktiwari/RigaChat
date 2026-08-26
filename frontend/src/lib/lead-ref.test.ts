import { describe, expect, it } from 'vitest'
import { leadDetailPath, leadRefToQuery, leadRefToSearch, packLeadRef, parseLeadRef, unpackLeadRef } from './lead-ref'
import type { LeadRef } from '../types/index'

const chatRef: LeadRef = { source: 'chat', botId: 'bot-1', leadId: 'lead-1' }

// The two serializers differ by exactly one field, and the difference is
// invisible at the call site because both return a string. /api/leads/events
// shipped using the path-shaped one and returned 400 for every lead, so the
// Activity card never loaded. These assert the difference directly.
describe('leadRefToQuery', () => {
  it('carries leadId, which every /api/leads/* endpoint requires', () => {
    const params = new URLSearchParams(leadRefToQuery(chatRef))

    expect(params.get('leadId')).toBe('lead-1')
    expect(params.get('source')).toBe('chat')
    expect(params.get('botId')).toBe('bot-1')
  })

  it('carries the right discriminator for form and Meta leads', () => {
    expect(new URLSearchParams(leadRefToQuery({ source: 'form', formId: 'f-1', leadId: 'l-2' })).get('formId')).toBe(
      'f-1'
    )
    expect(new URLSearchParams(leadRefToQuery({ source: 'meta', pageId: 'p-1', leadId: 'l-3' })).get('pageId')).toBe(
      'p-1'
    )
  })

  // A round trip through the backend's own rule: a ref that survives
  // serialization has to parse back to the same ref.
  it('round-trips back through parseLeadRef', () => {
    const params = new URLSearchParams(leadRefToQuery(chatRef))

    expect(parseLeadRef(params.get('leadId') ?? undefined, params)).toEqual(chatRef)
  })
})

describe('leadRefToSearch', () => {
  // Not an oversight: leadDetailPath puts leadId in the path segment, and
  // repeating it in the query would be two sources of truth in one URL.
  it('omits leadId because the detail path carries it', () => {
    expect(new URLSearchParams(leadRefToSearch(chatRef)).get('leadId')).toBeNull()
  })

  it('still produces a path that parseLeadRef can read back', () => {
    const path = leadDetailPath(chatRef)
    expect(path).toBe('/dashboard/leads/lead-1?source=chat&botId=bot-1')

    const [, search] = path.split('?')
    expect(parseLeadRef('lead-1', new URLSearchParams(search))).toEqual(chatRef)
  })
})

// The SAME vectors asserted in backend/src/lib/lead-link.test.ts. These two
// files are the only thing standing between the packer and the unpacker, which
// live in different packages and cannot import each other -- a drift in either
// implementation breaks every "Open this lead" button silently, because a bad
// token looks exactly like a valid one until it fails to resolve.
const PACKED_VECTORS: { ref: LeadRef; token: string }[] = [
  { ref: { source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, token: 'Y2hhdHxib3QtMXxsZWFkLTE' },
  { ref: { source: 'form', formId: 'form-9', leadId: 'lead-2' }, token: 'Zm9ybXxmb3JtLTl8bGVhZC0y' },
  { ref: { source: 'meta', pageId: '102938', leadId: 'lead-3' }, token: 'bWV0YXwxMDI5Mzh8bGVhZC0z' },
]

describe('packLeadRef', () => {
  it('agrees with the backend packer on every vector', () => {
    for (const { ref, token } of PACKED_VECTORS) {
      expect(packLeadRef(ref), `${ref.source} ref`).toBe(token)
    }
  })

  it('emits only characters that survive a URL path segment', () => {
    const token = packLeadRef({
      source: 'chat',
      botId: 'ef67914c-18be-44f7-9761-7c1bc0d543cb',
      leadId: '5383cb15-1f28-4eda-9914-834a90c0facd',
    })

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('unpackLeadRef', () => {
  it('reads every vector the backend produces', () => {
    for (const { ref, token } of PACKED_VECTORS) {
      expect(unpackLeadRef(token)).toEqual(ref)
    }
  })

  it('round-trips through leadDetailPath, which is what the route does', () => {
    const ref: LeadRef = { source: 'meta', pageId: '102938', leadId: 'lead-3' }

    const unpacked = unpackLeadRef(packLeadRef(ref))
    expect(unpacked).not.toBeNull()
    expect(leadDetailPath(unpacked as LeadRef)).toBe('/dashboard/leads/lead-3?source=meta&pageId=102938')
  })

  // atob throws on a character outside its alphabet, so the charset screen has
  // to come first -- otherwise a hand-edited token is an uncaught exception in
  // a render rather than the "link could not be read" card.
  it('returns null for anything malformed instead of throwing', () => {
    expect(unpackLeadRef('')).toBeNull()
    expect(unpackLeadRef('not base64 !!')).toBeNull()
    expect(unpackLeadRef('!!!!')).toBeNull()
    expect(unpackLeadRef(packLeadRef({ source: 'chat', botId: 'b', leadId: 'l' }).slice(0, 2))).toBeNull()
  })
})
