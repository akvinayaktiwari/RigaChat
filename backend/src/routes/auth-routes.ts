import { Hono } from 'hono'
import type { Context } from 'hono'
import { getConnInfo as getLambdaConnInfo } from 'hono/aws-lambda'
import { getConnInfo as getNodeConnInfo } from '@hono/node-server/conninfo'
import {
  confirmForgotPassword,
  ConfirmForgotPasswordError,
  confirmSignupWithCode,
  ConfirmSignupError,
  forgotPassword,
  ForgotPasswordError,
  quickSignup,
  QuickSignupError,
  resendConfirmationCode,
  ResendConfirmationCodeError,
} from '../services/auth-service.js'
import type {
  ConfirmForgotPasswordErrorCode,
  ConfirmSignupErrorCode,
  QuickSignupErrorCode,
  QuickSignupResult,
} from '../services/auth-service.js'
import type {
  ApiResponse,
  ConfirmForgotPasswordInput,
  ConfirmSignupInput,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  ResendConfirmationCodeInput,
  ResendConfirmationCodeResponse,
} from '../types/index.js'

export const authRoutes = new Hono()

interface QuickSignupBody {
  email?: string
  password?: string
}

interface QuickSignupErrorResponse extends ApiResponse<null> {
  code: QuickSignupErrorCode
}

interface ConfirmForgotPasswordErrorResponse extends ApiResponse<null> {
  code: ConfirmForgotPasswordErrorCode
}

interface ConfirmSignupErrorResponse extends ApiResponse<null> {
  code: ConfirmSignupErrorCode
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

function confirmForgotPasswordErrorStatus(code: ConfirmForgotPasswordErrorCode): 400 | 500 {
  switch (code) {
    case 'INVALID_CODE':
    case 'CODE_EXPIRED':
    case 'INVALID_PASSWORD':
      return 400
    case 'PROVIDER_ERROR':
      return 500
  }
}

function confirmSignupErrorStatus(code: ConfirmSignupErrorCode): 400 | 500 {
  switch (code) {
    case 'INVALID_CODE':
    case 'CODE_EXPIRED':
    case 'ALREADY_CONFIRMED':
      return 400
    case 'PROVIDER_ERROR':
      return 500
  }
}

authRoutes.post('/confirm-signup', async (c) => {
  const body = await c.req.json<ConfirmSignupInput>()

  if (!body.email || !body.code) {
    return c.json<ApiResponse<null>>({ success: false, error: 'email and code are required' }, 400)
  }

  try {
    await confirmSignupWithCode(body.email, body.code)
    return c.json<ApiResponse<null>>({ success: true }, 200)
  } catch (error) {
    if (error instanceof ConfirmSignupError) {
      return c.json<ConfirmSignupErrorResponse>(
        { success: false, error: error.message, code: error.code },
        confirmSignupErrorStatus(error.code)
      )
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

authRoutes.post('/resend-confirmation-code', async (c) => {
  const body = await c.req.json<ResendConfirmationCodeInput>()

  if (!body.email) {
    return c.json<ApiResponse<null>>({ success: false, error: 'email is required' }, 400)
  }

  try {
    await resendConfirmationCode(body.email)
  } catch (error) {
    if (error instanceof ResendConfirmationCodeError) {
      return c.json<ResendConfirmationCodeResponse>({ message: error.message }, 429)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }

  return c.json<ResendConfirmationCodeResponse>(
    { message: 'If that email is registered and unverified, a new code has been sent.' },
    200
  )
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

authRoutes.post('/forgot-password', async (c) => {
  const body = await c.req.json<ForgotPasswordInput>()

  if (!body.email) {
    return c.json<ApiResponse<null>>({ success: false, error: 'email is required' }, 400)
  }

  try {
    await forgotPassword(body.email)
  } catch (error) {
    if (error instanceof ForgotPasswordError) {
      return c.json<ForgotPasswordResponse>({ message: error.message }, 429)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }

  return c.json<ForgotPasswordResponse>({ message: 'If that email is registered, a code has been sent.' }, 200)
})

authRoutes.post('/confirm-forgot-password', async (c) => {
  const body = await c.req.json<ConfirmForgotPasswordInput>()

  if (!body.email || !body.code || !body.newPassword) {
    return c.json<ApiResponse<null>>({ success: false, error: 'email, code, and newPassword are required' }, 400)
  }

  try {
    await confirmForgotPassword(body.email, body.code, body.newPassword)
    return c.json<ApiResponse<null>>({ success: true }, 200)
  } catch (error) {
    if (error instanceof ConfirmForgotPasswordError) {
      return c.json<ConfirmForgotPasswordErrorResponse>(
        { success: false, error: error.message, code: error.code },
        confirmForgotPasswordErrorStatus(error.code)
      )
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
