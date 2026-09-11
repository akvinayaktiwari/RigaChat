// The ONE voice token implementation. It lives in lib/ rather than voice-relay/
// because both builds need it and neither owns it: the Lambda bundle mints
// tokens on GET /api/voice-agents/token and validates them on POST
// /api/voice-agents/rag, while the relay's separate EC2 bundle mints and
// validates them on the socket and transfer paths.
//
// It had been two implementations -- this one, and a copy in voice-routes.ts
// that predated the signature scope below and so could not express it. They
// agreed only because an omitted scope is byte-compatible; the next change to
// the token format would have split them silently, on the half that guards
// "dial this number".
//
// KEEP THIS FILE DEPENDENCY-FREE. node:crypto and nothing else. It is imported
// by the relay bundle, which is 244K precisely because it does not reach into
// the services layer, and one convenience import here would undo that.

import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_MAX_AGE_MS = 5 * 60 * 1000

// Extra context folded into the signature but NOT into the payload, so the
// token's shape and parsing are unchanged and an omitted scope stays
// byte-compatible with the tokens the browser widget already uses.
//
// It exists because binding only the agentId is weaker than the transfer
// endpoint's comment claims. Agent ids are not secret -- they are pasted into
// the embed snippet on a client's public website -- and GET /api/voice-agents/token
// is deliberately public, so a token for any agent is obtainable by anyone. That
// is fine for opening a voice socket, which is all it was built for. It is not
// fine as the only thing standing in front of an endpoint whose answer is "dial
// this number". Scoping the signature to the destination means a token minted
// for one number cannot authorise another, and a widget token (no scope)
// authorises no transfer at all.
function sign(payload: string, secret: string, scope: string): string {
  return createHmac('sha256', secret)
    .update(scope ? `${payload}|${scope}` : payload)
    .digest('hex')
}

export function generateToken(agentId: string, secret: string, scope = ''): string {
  const payload = `${agentId}:${Date.now()}`
  const signature = sign(payload, secret, scope)
  const token = `${payload}.${signature}`
  return Buffer.from(token).toString('base64url')
}

export function validateToken(
  token: string,
  secret: string,
  scope = ''
): { valid: boolean; agentId?: string } {
  let decoded: string
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return { valid: false }
  }

  const separatorIndex = decoded.lastIndexOf('.')
  if (separatorIndex === -1) {
    return { valid: false }
  }

  const payload = decoded.slice(0, separatorIndex)
  const signature = decoded.slice(separatorIndex + 1)

  const expectedSignature = sign(payload, secret, scope)

  const signatureBuffer = Buffer.from(signature, 'hex')
  const expectedBuffer = Buffer.from(expectedSignature, 'hex')

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false }
  }

  const timestampIndex = payload.lastIndexOf(':')
  if (timestampIndex === -1) {
    return { valid: false }
  }

  const agentId = payload.slice(0, timestampIndex)
  const timestamp = Number(payload.slice(timestampIndex + 1))

  if (!Number.isFinite(timestamp) || Date.now() - timestamp > TOKEN_MAX_AGE_MS) {
    return { valid: false }
  }

  return { valid: true, agentId }
}
