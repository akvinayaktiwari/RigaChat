import { describe, expect, it } from 'vitest'
import { leadDetailPath, leadRefToQuery, leadRefToSearch, parseLeadRef } from './lead-ref'
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
