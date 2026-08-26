import { describe, expect, it } from 'vitest'
import { packLeadRef, unpackLeadRef, leadRefScopeId } from './lead-link.js'
import type { LeadRef } from '../types/index.js'

// These exact vectors are asserted again in frontend/src/lib/lead-ref.test.ts.
// The two implementations are mirrors across a package boundary, and the only
// thing that can catch them drifting is the same input producing the same
// token on both sides.
const VECTORS: { ref: LeadRef; token: string }[] = [
  { ref: { source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, token: 'Y2hhdHxib3QtMXxsZWFkLTE' },
  { ref: { source: 'form', formId: 'form-9', leadId: 'lead-2' }, token: 'Zm9ybXxmb3JtLTl8bGVhZC0y' },
  { ref: { source: 'meta', pageId: '102938', leadId: 'lead-3' }, token: 'bWV0YXwxMDI5Mzh8bGVhZC0z' },
]

describe('packLeadRef', () => {
  it('produces the shared vectors', () => {
    for (const { ref, token } of VECTORS) {
      expect(packLeadRef(ref), `${ref.source} ref`).toBe(token)
    }
  })

  // The whole reason this encoding exists: Meta appends a URL button's variable
  // as a trailing path suffix and percent-encodes it, so anything outside the
  // unreserved base64url alphabet would arrive mangled.
  it('emits only characters that survive a URL path segment', () => {
    const token = packLeadRef({
      source: 'chat',
      botId: 'ef67914c-18be-44f7-9761-7c1bc0d543cb',
      leadId: '5383cb15-1f28-4eda-9914-834a90c0facd',
    })

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(token)).toBe(token)
  })
})

describe('unpackLeadRef', () => {
  it('round-trips every source', () => {
    for (const { ref } of VECTORS) {
      expect(unpackLeadRef(packLeadRef(ref))).toEqual(ref)
    }
  })

  // A pageId is NOT a botId (see the LeadRef comment in types/index.ts).
  // Collapsing the three discriminators is what makes a Meta lead unopenable,
  // so the round trip has to preserve WHICH key the scope id was.
  it('restores the discriminator, not just the ids', () => {
    const packed = packLeadRef({ source: 'meta', pageId: '102938', leadId: 'lead-3' })

    expect(unpackLeadRef(packed)).toEqual({ source: 'meta', pageId: '102938', leadId: 'lead-3' })
  })

  // Reached from a link in a WhatsApp message, where truncation by the client
  // app and hand-editing are ordinary inputs rather than exceptional ones.
  it('returns null for anything malformed instead of throwing', () => {
    expect(unpackLeadRef('')).toBeNull()
    expect(unpackLeadRef('not base64 !!')).toBeNull()
    // Valid base64url, but not three fields.
    expect(unpackLeadRef(Buffer.from('chat|bot-1', 'utf8').toString('base64url'))).toBeNull()
    // Three fields, but an unknown source.
    expect(unpackLeadRef(Buffer.from('voice|a|b', 'utf8').toString('base64url'))).toBeNull()
    // Three fields, but an empty scope id.
    expect(unpackLeadRef(Buffer.from('chat||lead-1', 'utf8').toString('base64url'))).toBeNull()
  })

  // Documents a REAL limit rather than asserting a guarantee this encoding does
  // not give: a token cut short mid-leadId still decodes, because base64url
  // carries no length or checksum. The result is a well-formed ref pointing at
  // an id that does not exist, so the person lands on "lead not found" instead
  // of "this link is not valid".
  //
  // Accepted rather than fixed with a checksum: the token now travels inside a
  // BUTTON, where there is no copy-paste and no line-wrap to truncate it. The
  // raw link in the message body was the shape that could be cut short, and it
  // is exactly what lead_handoff_alert_3 removes. Revisit if this token ever
  // gets pasted somewhere a human can edit it.
  it('cannot detect a token cut short mid-id', () => {
    const full = packLeadRef({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' })

    expect(unpackLeadRef(full.slice(0, full.length - 4))).toEqual({
      source: 'chat',
      botId: 'bot-1',
      leadId: 'lea',
    })
  })
})

describe('leadRefScopeId', () => {
  it('reads the right key per source', () => {
    expect(leadRefScopeId({ source: 'chat', botId: 'bot-1', leadId: 'l' })).toBe('bot-1')
    expect(leadRefScopeId({ source: 'form', formId: 'form-9', leadId: 'l' })).toBe('form-9')
    expect(leadRefScopeId({ source: 'meta', pageId: '102938', leadId: 'l' })).toBe('102938')
  })
})
