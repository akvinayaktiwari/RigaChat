import { Hono } from 'hono'
import { confirmSignup } from '../services/auth-service.js'
import type { ApiResponse } from '../types/index.js'

export const authRoutes = new Hono()

interface ConfirmSignupBody {
  username?: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
