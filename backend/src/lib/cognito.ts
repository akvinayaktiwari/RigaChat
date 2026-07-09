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

async function authenticate(token: string | undefined): Promise<{ sub: string; email: string; name: string } | null> {
  if (!token) return null

  try {
    const payload = await verifier.verify(token)
    return {
      sub: payload.sub,
      email: payload.email as string,
      name: (payload.name ?? payload.email) as string,
    }
  } catch {
    return null
  }
}

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined

  const user = await authenticate(token)
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }

  c.set('user', user)
  await next()
})

// For routes reached via top-level browser navigation (redirects) rather than
// fetch() calls, an Authorization header can't be attached — the token travels
// as a query param instead. Only use this where the alternative is a redirect flow.
export const requireAuthFromQuery = createMiddleware(async (c, next) => {
  const token = c.req.query('token')

  const user = await authenticate(token)
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }

  c.set('user', user)
  await next()
})
