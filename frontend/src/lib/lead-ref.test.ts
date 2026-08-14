import { describe, expect, it } from 'vitest'
import { leadDetailPath, leadRefToSearch, parseLeadRef } from './lead-ref'
import type { LeadRef } from '../types/index'

const CHAT: LeadRef = { source: 'chat', botId: 'bot-1', leadId: 'lead-1' }
const FORM: LeadRef = { source: 'form', formId: 'form-1', leadId: 'lead-2' }
const META: LeadRef = { source: 'meta', pageId: 'page-1', leadId: 'lead-3' }

function roundTrip(ref: LeadRef): LeadRef | null {
  return parseLeadRef(ref.leadId, new URLSearchParams(leadRefToSearch(ref)))
}

describe('leadRefToSearch', () => {
  it('carries the parent key for each source', () => {
    expect(leadRefToSearch(CHAT)).toBe('source=chat&botId=bot-1')
    expect(leadRefToSearch(FORM)).toBe('source=form&formId=form-1')
    expect(leadRefToSearch(META)).toBe('source=meta&pageId=page-1')
  })

  it('never emits another source\'s key', () => {
    expect(leadRefToSearch(FORM)).not.toContain('botId')
    expect(leadRefToSearch(META)).not.toContain('formId')
  })
})

describe('leadDetailPath', () => {
  it('puts the leadId in the path and the rest of the ref in the query', () => {
    expect(leadDetailPath(FORM)).toBe('/dashboard/leads/lead-2?source=form&formId=form-1')
  })
})

// The whole point of serializing the ref into the URL: a lead is only
// addressable by source plus parent key, never by leadId alone.
describe('round-tripping', () => {
  it('survives serialize -> parse for every source', () => {
    expect(roundTrip(CHAT)).toEqual(CHAT)
    expect(roundTrip(FORM)).toEqual(FORM)
    expect(roundTrip(META)).toEqual(META)
  })
})

describe('parseLeadRef', () => {
  it('reads each source back with its own parent key', () => {
    expect(parseLeadRef('lead-1', new URLSearchParams('source=chat&botId=bot-1'))).toEqual(CHAT)
    expect(parseLeadRef('lead-2', new URLSearchParams('source=form&formId=form-1'))).toEqual(FORM)
    expect(parseLeadRef('lead-3', new URLSearchParams('source=meta&pageId=page-1'))).toEqual(META)
  })

  // Documented fallback: links minted before the unified inbox existed carried
  // only ?botId=, and a bookmarked one must still open.
  it('treats a legacy botId-only link as a chat lead', () => {
    expect(parseLeadRef('lead-1', new URLSearchParams('botId=bot-1'))).toEqual(CHAT)
  })

  it('does not apply the legacy fallback when a source is present', () => {
    // An explicit source that disagrees with the key present is malformed, not
    // a legacy link, so it must not silently resolve as chat.
    expect(parseLeadRef('lead-1', new URLSearchParams('source=form&botId=bot-1'))).toBeNull()
  })

  it('returns null when the parent key for the stated source is missing', () => {
    expect(parseLeadRef('lead-1', new URLSearchParams('source=chat'))).toBeNull()
    expect(parseLeadRef('lead-2', new URLSearchParams('source=form'))).toBeNull()
    expect(parseLeadRef('lead-3', new URLSearchParams('source=meta'))).toBeNull()
  })

  it('returns null for an unknown source', () => {
    expect(parseLeadRef('lead-1', new URLSearchParams('source=voice&botId=bot-1'))).toBeNull()
  })

  it('returns null without a leadId, whatever the query says', () => {
    expect(parseLeadRef(undefined, new URLSearchParams('source=chat&botId=bot-1'))).toBeNull()
  })

  it('returns null for an empty query', () => {
    expect(parseLeadRef('lead-1', new URLSearchParams(''))).toBeNull()
  })
})
