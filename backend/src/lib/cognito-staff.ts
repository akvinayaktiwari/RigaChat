import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { createMiddleware } from 'hono/factory'

// Deliberately a separate verifier instance from cognito.ts's `verifier`,
// pointed at the staff pool — never shares state with the customer-pool
// verifier, so a bug in customer auth can never grant admin access.
const staffUserPoolId = process.env.STAFF_COGNITO_USER_POOL_ID
const staffClientId = process.env.STAFF_COGNITO_CLIENT_ID

if (!staffUserPoolId || !staffClientId) {
  throw new Error(
    'Missing required environment variables STAFF_COGNITO_USER_POOL_ID and/or STAFF_COGNITO_CLIENT_ID. Set them in your .env file before starting the server.'
  )
}

const staffVerifier = CognitoJwtVerifier.create({
  userPoolId: staffUserPoolId,
  tokenUse: 'id',
  clientId: staffClientId,
})

declare module 'hono' {
  interface ContextVariableMap {
    staffUser: {
      sub: string
      email: string
      name: string
    }
  }
}

async function authenticateStaff(token: string | undefined): Promise<{ sub: string; email: string; name: string } | null> {
  if (!token) return null

  try {
    const payload = await staffVerifier.verify(token)
    return {
      sub: payload.sub,
      email: payload.email as string,
      name: (payload.name ?? payload.email) as string,
    }
  } catch {
    return null
  }
}

export const requireStaffAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined

  const staffUser = await authenticateStaff(token)
  if (!staffUser) {
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }

  c.set('staffUser', staffUser)
  await next()
})
