import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import { getAppointmentRequests } from '../services/appointment-service.js'
import type { ApiResponse, AppointmentRequest } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const appointmentRoutes = new Hono<AuthEnv>()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

appointmentRoutes.get('/:botId', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const botId = c.req.param('botId')

  try {
    const requests = await getAppointmentRequests(botId, clientId)
    return c.json<ApiResponse<AppointmentRequest[]>>({ success: true, data: requests }, 200)
  } catch (error) {
    if (error instanceof Error && error.message === 'Bot not found') {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
