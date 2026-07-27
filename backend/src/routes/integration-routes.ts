import crypto from 'node:crypto'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { requireAuth, requireAuthFromQuery } from '../lib/cognito.js'
import { zohoProvider } from '../providers/zoho-provider.js'
import { metaProvider } from '../providers/meta-provider.js'
import { connectZohoCRM, disconnectCRM, getCRMStatus } from '../services/crm-service.js'
import {
  connectGupshup,
  connectMetaWhatsApp,
  disconnectMetaWhatsApp,
  disconnectWhatsApp,
  getMetaWhatsAppStatus,
  getWhatsAppStatus,
} from '../services/whatsapp-service.js'
import {
  connectMetaAds,
  disconnectMetaAds,
  getMetaLeadsForClient,
  getMetaStatus,
  MetaPageAlreadyConnectedError,
} from '../services/meta-lead-service.js'
import type {
  ApiResponse,
  CRMConnection,
  MetaConnection,
  MetaDirectWhatsAppConnection,
  MetaLead,
  WhatsAppConnection,
} from '../types/index.js'

interface AuthEnv {
  Variables: {
    user: { sub: string; [key: string]: unknown }
  }
}

export const integrationRoutes = new Hono<AuthEnv>()

const STATE_COOKIE = 'zoho_oauth_state'
const META_STATE_COOKIE = 'meta_oauth_state'
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
    return c.json<ApiResponse<(Omit<WhatsAppConnection, 'apiKeyEncrypted'> & { active: boolean }) | null>>(
      { success: true, data: status },
      200
    )
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

interface ConnectMetaWhatsAppBody {
  code: string
  wabaId: string
  phoneNumberId: string
  notificationNumber: string
}

// Meta's WhatsApp Embedded Signup is a JS SDK popup flow, not a redirect -
// the frontend gets the code via a postMessage event and POSTs it here with
// a normal Authorization header, unlike /meta/callback above which is a GET
// redirect route reading code+state from query params (see design doc
// Architecture Issue 1).
integrationRoutes.post('/meta-whatsapp/callback', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<ConnectMetaWhatsAppBody>()

  if (!body.code?.trim() || !body.wabaId?.trim() || !body.phoneNumberId?.trim() || !body.notificationNumber?.trim()) {
    return c.json<ApiResponse<null>>({ success: false, error: 'Missing required Embedded Signup fields' }, 400)
  }

  try {
    await connectMetaWhatsApp(clientId, body)
    return c.json<ApiResponse<{ success: boolean }>>({ success: true, data: { success: true } }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.delete('/meta-whatsapp/disconnect', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    await disconnectMetaWhatsApp(clientId)
    return c.json<ApiResponse<{ success: boolean }>>({ success: true, data: { success: true } }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.get('/meta-whatsapp/status', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const status = await getMetaWhatsAppStatus(clientId)
    return c.json<ApiResponse<(Omit<MetaDirectWhatsAppConnection, 'accessTokenEncrypted'> & { active: boolean }) | null>>(
      { success: true, data: status },
      200
    )
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.get('/meta/connect', requireAuthFromQuery, (c) => {
  const clientId = c.get('user').sub
  const random = crypto.randomBytes(16).toString('hex')
  const state = `${clientId}:${random}`

  setCookie(c, META_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 600,
    path: '/',
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return c.redirect(metaProvider.getOAuthUrl(state))
})

integrationRoutes.get('/meta/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, META_STATE_COOKIE)

  setCookie(c, META_STATE_COOKIE, '', { path: '/', maxAge: 0 })

  if (!code || !state || !storedState || state !== storedState) {
    return c.redirect(`${FRONTEND_URL}/dashboard/meta-ads?meta=error&reason=invalid_state`)
  }

  const clientId = state.split(':')[0]

  try {
    await connectMetaAds(clientId, code)
    return c.redirect(`${FRONTEND_URL}/dashboard/meta-ads?meta=connected`)
  } catch (error) {
    console.error('Meta connect error:', errorMessage(error))
    const reason = error instanceof MetaPageAlreadyConnectedError ? 'page_already_connected' : 'auth_failed'
    return c.redirect(`${FRONTEND_URL}/dashboard/meta-ads?meta=error&reason=${reason}`)
  }
})

integrationRoutes.delete('/meta/disconnect', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    await disconnectMetaAds(clientId)
    return c.json<ApiResponse<{ success: boolean }>>({ success: true, data: { success: true } }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.get('/meta/status', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const status = await getMetaStatus(clientId)
    return c.json<ApiResponse<Omit<MetaConnection, 'pageAccessTokenEncrypted'> | null>>(
      { success: true, data: status },
      200
    )
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.get('/meta/leads', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const leads = await getMetaLeadsForClient(clientId)
    return c.json<ApiResponse<MetaLead[]>>({ success: true, data: leads }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
