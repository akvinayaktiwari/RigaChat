import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { createMiddleware } from 'hono/factory'

const userPoolId = process.env.COGNITO_USER_POOL_ID
const clientId = process.env.COGNITO_CLIENT_ID

if (!userPoolId || !clientId) {
  throw new Error(
    'Missing required environment variables COGNITO_USER_POOL_ID and/or COGNITO_CLIENT_ID. Set them in your .env file before starting the server.'
  )
}

const verifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: 'id',
  clientId,
})

declare module 'hono' {
  interface ContextVariableMap {
    user: {
      sub: string
      email: string
      name: string
    }
  }
}

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined

  if (!token) {
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }

  try {
    const payload = await verifier.verify(token)
    c.set('user', {
      sub: payload.sub,
      email: payload.email as string,
      name: (payload.name ?? payload.email) as string,
    })
    await next()
  } catch {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401)
  }
})
