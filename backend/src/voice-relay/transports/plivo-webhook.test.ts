import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildRejectXml,
  buildStreamXml,
  extractDialledNumber,
  parseFormBody,
  verifyPlivoSignature,
} from './plivo-webhook.js'

const AUTH_TOKEN = 'test-auth-token'
const URL_UNDER_TEST = 'https://voice.example.com/plivo/answer'
const NONCE = '12345'

function sign(url: string, nonce: string, token = AUTH_TOKEN): string {
  return createHmac('sha256', token).update(`${url}${nonce}`).digest('base64')
}

describe('verifyPlivoSignature', () => {
  it('accepts a correctly signed request', () => {
    expect(verifyPlivoSignature(URL_UNDER_TEST, NONCE, sign(URL_UNDER_TEST, NONCE), AUTH_TOKEN)).toBe(true)
  })

  it('accepts when any one of several rotated signatures matches', () => {
    const header = `${sign(URL_UNDER_TEST, NONCE, 'old-token')}, ${sign(URL_UNDER_TEST, NONCE)}`
    expect(verifyPlivoSignature(URL_UNDER_TEST, NONCE, header, AUTH_TOKEN)).toBe(true)
  })

  it('rejects a signature computed for a different URL', () => {
    // The URL is inside the signed material precisely so a signature captured
    // from one endpoint cannot be replayed against another.
    const otherUrl = sign('https://voice.example.com/plivo/other', NONCE)
    expect(verifyPlivoSignature(URL_UNDER_TEST, NONCE, otherUrl, AUTH_TOKEN)).toBe(false)
  })

  it('rejects a signature computed with a different nonce', () => {
    expect(verifyPlivoSignature(URL_UNDER_TEST, NONCE, sign(URL_UNDER_TEST, '99999'), AUTH_TOKEN)).toBe(false)
  })

  it('rejects a signature computed with the wrong auth token', () => {
    expect(
      verifyPlivoSignature(URL_UNDER_TEST, NONCE, sign(URL_UNDER_TEST, NONCE, 'wrong-token'), AUTH_TOKEN)
    ).toBe(false)
  })

  // Every one of these is a request that must NOT be treated as authentic. The
  // endpoint is public and everything downstream of it costs money, so absent
  // input has to fail closed rather than fall through to a truthy default.
  it.each([
    ['missing signature', URL_UNDER_TEST, NONCE, '', AUTH_TOKEN],
    ['missing nonce', URL_UNDER_TEST, '', sign(URL_UNDER_TEST, NONCE), AUTH_TOKEN],
    ['missing url', '', NONCE, sign(URL_UNDER_TEST, NONCE), AUTH_TOKEN],
    ['missing auth token', URL_UNDER_TEST, NONCE, sign(URL_UNDER_TEST, NONCE), ''],
    ['garbage signature', URL_UNDER_TEST, NONCE, 'not-a-signature', AUTH_TOKEN],
    ['empty header segments', URL_UNDER_TEST, NONCE, ' , , ', AUTH_TOKEN],
  ])('fails closed on %s', (_label, url, nonce, signature, token) => {
    expect(verifyPlivoSignature(url, nonce, signature, token)).toBe(false)
  })

  it('does not throw on a signature of a different length', () => {
    // timingSafeEqual throws on length mismatch; the length guard must come
    // first or a short signature crashes the webhook instead of failing it.
    expect(() => verifyPlivoSignature(URL_UNDER_TEST, NONCE, 'abc', AUTH_TOKEN)).not.toThrow()
  })
})

describe('buildStreamXml', () => {
  it('marks the stream bidirectional, which is what makes the agent audible', () => {
    const xml = buildStreamXml({ streamUrl: 'wss://voice.example.com/plivo/stream?token=abc' })

    expect(xml).toContain('bidirectional="true"')
    expect(xml).toContain('keepCallAlive="true"')
    expect(xml).toContain('wss://voice.example.com/plivo/stream?token=abc')
  })

  it('states the content type explicitly rather than relying on a default', () => {
    expect(buildStreamXml({ streamUrl: 'wss://x/y' })).toContain('contentType="audio/x-mulaw;rate=8000"')
  })

  it('escapes the stream URL so a token cannot break out of the attribute', () => {
    // Tokens are base64url and will not contain these, but the XML is built by
    // string concatenation and an unescaped & in a query string is malformed
    // XML that Plivo rejects -- a call that fails for a reason nobody can see.
    const xml = buildStreamXml({ streamUrl: 'wss://x/y?a=1&b=2' })

    expect(xml).toContain('a=1&amp;b=2')
    expect(xml).not.toContain('a=1&b=2')
  })
})

describe('buildRejectXml', () => {
  it('speaks a reason and hangs up, rather than connecting to silence', () => {
    const xml = buildRejectXml('This number is not in service.')

    expect(xml).toContain('<Speak>This number is not in service.</Speak>')
    expect(xml).toContain('<Hangup/>')
  })

  it('escapes the spoken message', () => {
    expect(buildRejectXml('Tom & Jerry <test>')).toContain('Tom &amp; Jerry &lt;test&gt;')
  })
})

describe('parseFormBody', () => {
  it('parses the form encoding Plivo posts', () => {
    expect(parseFormBody('To=%2B919876543210&From=%2B919999999999&CallUUID=abc-123')).toEqual({
      To: '+919876543210',
      From: '+919999999999',
      CallUUID: 'abc-123',
    })
  })

  it('returns an empty object for an empty body', () => {
    expect(parseFormBody('')).toEqual({})
  })
})

describe('extractDialledNumber', () => {
  it('reads the documented To field', () => {
    expect(extractDialledNumber({ To: '+919876543210', From: '+919999999999' })).toBe('+919876543210')
  })

  // Defensive fallbacks: if the destination ever arrives under another key,
  // the symptom would be "every call is to an unclaimed number", which is a
  // miserable thing to diagnose during a first launch.
  it.each([
    [{ CalledNumber: '+919876543210' }],
    [{ Called: '+919876543210' }],
  ])('falls back to alternative destination keys', (params) => {
    expect(extractDialledNumber(params)).toBe('+919876543210')
  })

  it('returns null when no destination is present, so the caller is rejected not misrouted', () => {
    expect(extractDialledNumber({ From: '+919999999999' })).toBeNull()
  })
})
