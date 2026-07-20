import { Hono } from 'hono'
import type { Context } from 'hono'
import { getConnInfo as getLambdaConnInfo } from 'hono/aws-lambda'
import { getConnInfo as getNodeConnInfo } from '@hono/node-server/conninfo'
import { confirmSignup, quickSignup, QuickSignupError } from '../services/auth-service.js'
import type { QuickSignupErrorCode, QuickSignupResult } from '../services/auth-service.js'
import type { ApiResponse } from '../types/index.js'

export const authRoutes = new Hono()

interface ConfirmSignupBody {
  username?: string
}

interface QuickSignupBody {
  email?: string
  password?: string
}

interface QuickSignupErrorResponse extends ApiResponse<null> {
  code: QuickSignupErrorCode
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// This app runs under two different runtimes sharing the same Hono `app`
// (index.ts): hono/aws-lambda's handle() in the real deployed Lambda (Function
// URL event, API Gateway v2 shape — c.env.requestContext is populated) and
// @hono/node-server's serve() for local dev (c.env is the raw Node
// req/res, no requestContext at all). hono/aws-lambda's getConnInfo reads
// c.env.requestContext directly and throws if it's absent, so it can't be
// called unconditionally — this picks whichever adapter matches the runtime
// actually in use for this request.
function getClientIp(c: Context): string {
  const hasLambdaEvent = Boolean((c.env as { requestContext?: unknown } | undefined)?.requestContext)
  const address = hasLambdaEvent ? getLambdaConnInfo(c).remote.address : getNodeConnInfo(c).remote.address
  return address ?? 'unknown'
}

function quickSignupErrorStatus(code: QuickSignupErrorCode): 400 | 409 | 429 | 500 {
  switch (code) {
    case 'EMAIL_EXISTS':
      return 409
    case 'RATE_LIMITED':
      return 429
    case 'INVALID_PASSWORD':
      return 400
    case 'PROVIDER_ERROR':
      return 500
  }
}

authRoutes.post('/confirm', async (c) => {
  const body = await c.req.json<ConfirmSignupBody>()

  if (!body.username) {
    return c.json<ApiResponse<null>>({ success: false, error: 'Username required' }, 400)
  }

  try {
    await confirmSignup(body.username)
    return c.json<ApiResponse<null>>({ success: true }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

authRoutes.post('/quick-signup', async (c) => {
  const body = await c.req.json<QuickSignupBody>()

  if (!body.email || !body.password) {
    return c.json<ApiResponse<null>>({ success: false, error: 'email and password are required' }, 400)
  }

  const ip = getClientIp(c)

  try {
    const result = await quickSignup(body.email, body.password, ip)
    return c.json<ApiResponse<QuickSignupResult>>({ success: true, data: result }, 200)
  } catch (error) {
    if (error instanceof QuickSignupError) {
      return c.json<QuickSignupErrorResponse>(
        { success: false, error: error.message, code: error.code },
        quickSignupErrorStatus(error.code)
      )
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
