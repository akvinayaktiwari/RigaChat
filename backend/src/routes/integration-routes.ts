import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { requireAuth, requireAuthFromQuery } from '../lib/cognito.js'
import { zohoProvider } from '../providers/zoho-provider.js'
import { connectZohoCRM, disconnectCRM, getCRMStatus } from '../services/crm-service.js'
import { connectGupshup, disconnectWhatsApp, getWhatsAppStatus } from '../services/whatsapp-service.js'
import type { ApiResponse, CRMConnection, WhatsAppConnection } from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const integrationRoutes = new Hono<AuthEnv>()

const STATE_COOKIE = 'zoho_oauth_state'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

integrationRoutes.get('/zoho/connect', requireAuthFromQuery, (c) => {
  const clientId = c.get('user').sub
  const random = Math.random().toString(36).substring(2)
  const state = `${clientId}:${random}`

  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 600,
    path: '/',
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return c.redirect(zohoProvider.getOAuthUrl(state))
})

integrationRoutes.get('/zoho/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, STATE_COOKIE)

  setCookie(c, STATE_COOKIE, '', { path: '/', maxAge: 0 })

  if (!code || !state || !storedState || state !== storedState) {
    return c.redirect(`${FRONTEND_URL}/dashboard/settings?zoho=error&reason=invalid_state`)
  }

  const clientId = state.split(':')[0]

  try {
    await connectZohoCRM(clientId, code)
    return c.redirect(`${FRONTEND_URL}/dashboard/settings?zoho=connected`)
  } catch (error) {
    console.error('Zoho connect error:', errorMessage(error))
    return c.redirect(`${FRONTEND_URL}/dashboard/settings?zoho=error&reason=auth_failed`)
  }
})

integrationRoutes.delete('/disconnect', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    await disconnectCRM(clientId)
    return c.json<ApiResponse<{ success: boolean }>>({ success: true, data: { success: true } }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.get('/status', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const status = await getCRMStatus(clientId)
    return c.json<ApiResponse<CRMConnection | null>>({ success: true, data: status }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

interface ConnectWhatsAppBody {
  apiKey: string
  appName: string
  sourceNumber: string
  notificationNumber: string
}

integrationRoutes.post('/whatsapp/connect', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<ConnectWhatsAppBody>()

  if (!body.apiKey?.trim() || !body.appName?.trim() || !body.sourceNumber?.trim() || !body.notificationNumber?.trim()) {
    return c.json<ApiResponse<null>>({ success: false, error: 'All WhatsApp fields are required' }, 400)
  }

  try {
    await connectGupshup(clientId, body)
    return c.json<ApiResponse<{ success: boolean }>>({ success: true, data: { success: true } }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.delete('/whatsapp/disconnect', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    await disconnectWhatsApp(clientId)
    return c.json<ApiResponse<{ success: boolean }>>({ success: true, data: { success: true } }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.get('/whatsapp/status', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const status = await getWhatsAppStatus(clientId)
    return c.json<ApiResponse<Omit<WhatsAppConnection, 'apiKeyEncrypted'> | null>>({ success: true, data: status }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
