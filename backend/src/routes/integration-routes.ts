import { failureReasonOf } from '../lib/meta-connect-errors.js'
import crypto from 'node:crypto'
import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { requireAuth, requireAuthFromQuery } from '../lib/cognito.js'
import { zohoProvider } from '../providers/zoho-provider.js'
import { metaProvider } from '../providers/meta-provider.js'
import { connectZohoCRM, disconnectCRM, getCRMStatus } from '../services/crm-service.js'
import {
  connectCalCom,
  disconnectCalCom,
  getCalComEventTypes,
  getCalComStatus,
  getOAuthUrl as getCalComOAuthUrl,
  setCalComDefaultEventType,
} from '../services/cal-com-service.js'
import type { CalComEventType } from '../lib/cal-com.js'
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
} from '../services/meta-lead-service.js'
import type {
  ApiResponse,
  CalComConnection,
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
const CAL_COM_STATE_COOKIE = 'cal_com_oauth_state'
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

  // getOAuthUrl throws on missing env vars and on a localhost redirect in
  // production. This is a top-level browser navigation, so an uncaught throw
  // renders a raw 500 page with the dashboard nowhere in sight; redirecting
  // back with a reason keeps the client inside the app.
  try {
    return c.redirect(metaProvider.getOAuthUrl(state))
  } catch (error) {
    console.error('Meta connect setup error:', errorMessage(error))
    return c.redirect(`${FRONTEND_URL}/dashboard/meta-ads?meta=error&reason=${failureReasonOf(error)}`)
  }
})

integrationRoutes.get('/meta/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, META_STATE_COOKIE)

  setCookie(c, META_STATE_COOKIE, '', { path: '/', maxAge: 0 })

  // Meta reports a declined consent screen as query params on the redirect, not
  // as a missing code. Checked BEFORE the state comparison so "I clicked
  // Cancel" stops reading as "something is broken" -- previously both fell
  // through to the same generic failure.
  if (c.req.query('error')) {
    return c.redirect(`${FRONTEND_URL}/dashboard/meta-ads?meta=error&reason=permission_declined`)
  }

  if (!code || !state || !storedState || state !== storedState) {
    return c.redirect(`${FRONTEND_URL}/dashboard/meta-ads?meta=error&reason=invalid_state`)
  }

  const clientId = state.split(':')[0]

  try {
    await connectMetaAds(clientId, code)
    return c.redirect(`${FRONTEND_URL}/dashboard/meta-ads?meta=connected`)
  } catch (error) {
    // The real message still goes to the logs; the client gets a reason code
    // the dashboard turns into something they can act on.
    console.error('Meta connect error:', errorMessage(error))
    return c.redirect(`${FRONTEND_URL}/dashboard/meta-ads?meta=error&reason=${failureReasonOf(error)}`)
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

// Same shape as /zoho/connect and /meta/connect above: requireAuthFromQuery
// (JWT as query param, since this is a browser GET redirect, not a fetch()
// with an Authorization header), state cookie for CSRF, clientId embedded in
// state so the callback knows who's completing the flow.
integrationRoutes.get('/cal-com/connect', requireAuthFromQuery, (c) => {
  const clientId = c.get('user').sub
  const random = Math.random().toString(36).substring(2)
  const state = `${clientId}:${random}`

  setCookie(c, CAL_COM_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 600,
    path: '/',
    sameSite: 'Lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return c.redirect(getCalComOAuthUrl(state))
})

integrationRoutes.get('/cal-com/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const storedState = getCookie(c, CAL_COM_STATE_COOKIE)

  setCookie(c, CAL_COM_STATE_COOKIE, '', { path: '/', maxAge: 0 })

  if (!code || !state || !storedState || state !== storedState) {
    return c.redirect(`${FRONTEND_URL}/dashboard/settings?cal_com=error&reason=invalid_state`)
  }

  const clientId = state.split(':')[0]

  try {
    await connectCalCom(clientId, code)
    return c.redirect(`${FRONTEND_URL}/dashboard/settings?cal_com=connected`)
  } catch (error) {
    console.error('Cal.com connect error:', errorMessage(error))
    return c.redirect(`${FRONTEND_URL}/dashboard/settings?cal_com=error&reason=auth_failed`)
  }
})

integrationRoutes.delete('/cal-com/disconnect', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    await disconnectCalCom(clientId)
    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Cal.com disconnected' } }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.get('/cal-com/status', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const status = await getCalComStatus(clientId)
    return c.json<ApiResponse<Omit<CalComConnection, 'accessTokenEncrypted' | 'refreshTokenEncrypted'> | null>>(
      { success: true, data: status },
      200
    )
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

integrationRoutes.get('/cal-com/event-types', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const eventTypes = await getCalComEventTypes(clientId)
    return c.json<ApiResponse<CalComEventType[]>>({ success: true, data: eventTypes }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

interface SetDefaultEventTypeBody {
  eventTypeId?: number
}

integrationRoutes.post('/cal-com/default-event-type', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<SetDefaultEventTypeBody>()

  if (typeof body.eventTypeId !== 'number') {
    return c.json<ApiResponse<null>>({ success: false, error: 'eventTypeId is required' }, 400)
  }

  try {
    await setCalComDefaultEventType(clientId, body.eventTypeId)
    return c.json<ApiResponse<{ message: string }>>({ success: true, data: { message: 'Default event type set' } }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
