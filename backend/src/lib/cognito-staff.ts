import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { createMiddleware } from 'hono/factory'

// Deliberately a separate verifier instance from cognito.ts's `verifier`,
// pointed at the staff pool — never shares state with the customer-pool
// verifier, so a bug in customer auth can never grant admin access.
//
// Built on first use and memoized, NOT at module load. backend/index.ts imports
// the whole route tree into one Lambda, so throwing here on import took down
// every route — including /api/chat on every client's live site — because the
// STAFF pool happened to be unconfigured. Now only the admin console breaks.
//
// This still fails CLOSED: a missing staff pool makes the verifier throw inside
// authenticateStaff, which is caught below and returns null, so requireStaffAuth
// rejects with 401. Misconfiguration can never grant admin access.
type StaffVerifier = ReturnType<typeof CognitoJwtVerifier.create>

let cachedStaffVerifier: StaffVerifier | null = null

function staffVerifier(): StaffVerifier {
  if (cachedStaffVerifier) return cachedStaffVerifier

  const staffUserPoolId = process.env.STAFF_COGNITO_USER_POOL_ID
  const staffClientId = process.env.STAFF_COGNITO_CLIENT_ID

  if (!staffUserPoolId || !staffClientId) {
    throw new Error(
      'Missing required environment variables STAFF_COGNITO_USER_POOL_ID and/or STAFF_COGNITO_CLIENT_ID. Set them in your .env file before starting the server.'
    )
  }

  cachedStaffVerifier = CognitoJwtVerifier.create({
    userPoolId: staffUserPoolId,
    tokenUse: 'id',
    clientId: staffClientId,
  })
  return cachedStaffVerifier
}

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
    const payload = await staffVerifier().verify(token)
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
