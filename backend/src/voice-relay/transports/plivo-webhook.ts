import { createHmac, timingSafeEqual } from 'node:crypto'

// The HTTP half of Plivo telephony: the answer webhook Plivo POSTs when a call
// arrives, and the XML we answer with that tells it where to stream the audio.
// Pure functions, so every branch here is testable without a phone number, a
// Plivo account, or a socket -- the same reason audio-codec.ts is pure.
//
// PLIVO CONTRACT SHAPES ARE UNVERIFIED AGAINST LIVE TRAFFIC (no account yet).
// The signature scheme and the <Stream> element below follow Plivo's published
// docs. Both must be checked against the first real request. Failure modes
// differ, and that matters: a wrong <Stream> element is loud (the call fails
// or no audio flows), while a wrong signature scheme is loud in the safe
// direction -- every request is rejected -- because verification fails closed.

// Plivo signature V3: base64(HMAC-SHA256(authToken, url + nonce)). The header
// may carry several comma-separated signatures; any one matching is a pass,
// which is how Plivo rolls credentials without dropping requests mid-rotation.
export function verifyPlivoSignature(
  url: string,
  nonce: string,
  signatureHeader: string,
  authToken: string
): boolean {
  if (!url || !nonce || !signatureHeader || !authToken) return false

  const expected = createHmac('sha256', authToken).update(`${url}${nonce}`).digest('base64')
  const expectedBuffer = Buffer.from(expected)

  return signatureHeader.split(',').some((candidate) => {
    const trimmed = candidate.trim()
    if (!trimmed) return false
    const candidateBuffer = Buffer.from(trimmed)
    // timingSafeEqual throws on a length mismatch, so the length check has to
    // come first -- and a mismatched length is already a failed comparison.
    return (
      candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer)
    )
  })
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface StreamXmlOptions {
  streamUrl: string
  // Mirrors what audio-codec.ts converts to and from. Stated explicitly in the
  // XML rather than left to Plivo's default, so the format is a decision in
  // one place instead of an assumption in two.
  contentType?: string
}

// The answer XML. `bidirectional` is what makes the agent audible -- without it
// Plivo streams the caller to us and plays nothing back, which presents as a
// call that connects to silence.
export function buildStreamXml({ streamUrl, contentType = 'audio/x-mulaw;rate=8000' }: StreamXmlOptions): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `  <Stream bidirectional="true" keepCallAlive="true" contentType="${escapeXml(contentType)}">${escapeXml(streamUrl)}</Stream>`,
    '</Response>',
  ].join('\n')
}

// Plivo hangs up politely instead of dropping the caller into silence. Used for
// an unclaimed number and for the concurrency ceiling, which are different
// causes with the same correct outcome: do not connect, do not leave them
// hanging.
export function buildRejectXml(message: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `  <Speak>${escapeXml(message)}</Speak>`,
    '  <Hangup/>',
    '</Response>',
  ].join('\n')
}

// Plivo posts application/x-www-form-urlencoded. Parsed here rather than with a
// body parser dependency: this relay has no HTTP framework and does not need
// one for a single endpoint.
export function parseFormBody(body: string): Record<string, string> {
  const params = new URLSearchParams(body)
  const result: Record<string, string> = {}
  for (const [key, value] of params.entries()) {
    result[key] = value
  }
  return result
}

// The number Plivo reports as the call's destination -- our DID, which is the
// voice_phone_lookup key. `To` is the documented field; the others are
// defensive, because a webhook that silently reports the destination under a
// different key would present as "every call is to an unclaimed number", and
// that is a miserable thing to debug at 2am on a first launch.
export function extractDialledNumber(params: Record<string, string>): string | null {
  return params.To || params.CalledNumber || params.Called || null
}
