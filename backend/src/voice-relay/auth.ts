import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_MAX_AGE_MS = 5 * 60 * 1000

export function generateToken(agentId: string, secret: string): string {
  const payload = `${agentId}:${Date.now()}`
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  const token = `${payload}.${signature}`
  return Buffer.from(token).toString('base64url')
}

export function validateToken(token: string, secret: string): { valid: boolean; agentId?: string } {
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

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex')

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
