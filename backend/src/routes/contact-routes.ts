import { Hono } from 'hono'
import { getClientIp } from '../lib/client-ip.js'
import type { Context } from 'hono'
import { ContactError, submitContactMessage } from '../services/contact-service.js'
import type { ApiResponse, SubmitContactMessageInput, SubmitContactMessageResult } from '../types/index.js'

export const contactRoutes = new Hono()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}


function contactErrorStatus(code: ContactError['code']): 400 | 429 {
  switch (code) {
    case 'VALIDATION':
      return 400
    case 'RATE_LIMITED':
      return 429
  }
}

// Public and unauthenticated: this is the marketing site's "Get in touch"
// form, submitted by visitors who have no account. Abuse controls are the
// honeypot field and per-ip+email rate limit inside contact-service.ts.
contactRoutes.post('/', async (c) => {
  const body = await c.req.json<SubmitContactMessageInput>()

  try {
    const result = await submitContactMessage(body, getClientIp(c))
    return c.json<ApiResponse<SubmitContactMessageResult>>({ success: true, data: result }, 201)
  } catch (error) {
    if (error instanceof ContactError) {
      return c.json<ApiResponse<null>>(
        { success: false, error: error.message },
        contactErrorStatus(error.code)
      )
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
