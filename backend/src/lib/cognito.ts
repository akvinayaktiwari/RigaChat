import { CognitoJwtVerifier } from 'aws-jwt-verify'
import type { MiddlewareHandler } from 'hono'

const userPoolId = process.env.COGNITO_USER_POOL_ID
const clientId = process.env.COGNITO_CLIENT_ID

if (!userPoolId || !clientId) {
  throw new Error(
    'Missing required environment variables COGNITO_USER_POOL_ID and/or COGNITO_CLIENT_ID. Set them in your .env file before starting the server.'
  )
}

const verifier = CognitoJwtVerifier.create({
  userPoolId,
  clientId,
  tokenUse: 'access',
})

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined

  if (!token) {
    return c.json({ success: false, error: 'Missing Authorization header' }, 401)
  }

  try {
    const payload = await verifier.verify(token)
    c.set('user', payload)
    await next()
  } catch {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401)
  }
}
