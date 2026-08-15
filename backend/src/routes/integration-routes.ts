import { failureReasonOf } from '../lib/meta-connect-errors.js'
import { Hono, type Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { requireAuth, requireAuthFromQuery } from '../lib/cognito.js'
import {
  buildLeadAdsOAuthState,
  buildWhatsAppOAuthState,
  clientIdFromState,
  isWhatsAppOAuthState,
} from '../lib/meta-oauth-state.js'
import { zohoProvider } from '../providers/zoho-provider.js'
import { metaProvider } from '../providers/meta-provider.js'
import { metaWhatsAppProvider } from '../providers/meta-whatsapp-provider.js'
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
  sendWhatsAppTestMessage,
  connectMetaWhatsAppViaOAuth,
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

interface TestMessageBody {
  toNumber: string
}

// Sends the smoke-test template to an arbitrary number so a client can prove
// their WhatsApp connection works without waiting for a real lead. Returns the
// provider's failure reason verbatim on a failed send rather than a generic
// message -- an unapproved template, a number missing from the allow-list and
// an expired token are three different problems with three different fixes,
// and collapsing them is what made this flow undebuggable before.
integrationRoutes.post('/meta-whatsapp/test-message', requireAuth, async (c) => {
  const clientId = c.get('user').sub
  const body = await c.req.json<TestMessageBody>()
  const toNumber = body.toNumber?.trim()

  if (!toNumber) {
    return c.json<ApiResponse<null>>({ success: false, error: 'A recipient number is required' }, 400)
  }

  try {
    const result = await sendWhatsAppTestMessage(clientId, toNumber)

    if (!result.success) {
      return c.json<ApiResponse<null>>({ success: false, error: result.error ?? 'Send failed' }, 502)
    }

    return c.json<ApiResponse<{ messageId?: string }>>({ success: true, data: { messageId: result.messageId } }, 200)
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

const META_WA_STATE_COOKIE = 'meta_wa_oauth_state'
const META_WA_NOTIFY_COOKIE = 'meta_wa_notify'

// WhatsApp deliberately reuses the LEAD ADS redirect URI rather than having
// one of its own. Meta only accepts redirect URIs that are explicitly
// allowlisted in the App Dashboard, and META_REDIRECT_URI is already
// allowlisted and proven working. A new path would need a dashboard change
// before it could ever succeed, and would fail with Meta's "URL Blocked"
// page -- indistinguishable, from the user's side, from the flow just being
// broken.
//
// The two flows are told apart by a marker on the OAuth `state` instead; see
// lib/meta-oauth-state.ts and the branch at the top of /meta/callback.
function metaWhatsAppRedirectUri(): string {
  const uri = process.env.META_REDIRECT_URI
  if (!uri) throw new Error('Missing META_REDIRECT_URI')
  return uri
}

// The redirect-based WhatsApp connect: same mechanism as /meta/connect below,
// which is proven working, rather than the FB.login() popup used by Embedded
// Signup. The notification number cannot survive an OAuth round trip on its
// own, so it rides in a short-lived host-only cookie next to the state.
integrationRoutes.get('/meta-whatsapp/connect', requireAuthFromQuery, (c) => {
  const clientId = c.get('user').sub
  const notificationNumber = c.req.query('notificationNumber')?.trim()

  if (!notificationNumber) {
    return c.redirect(`${FRONTEND_URL}/dashboard/whatsapp?metaWa=error&reason=missing_notification_number`)
  }

  const state = buildWhatsAppOAuthState(clientId)
  const cookieOptions = {
    httpOnly: true,
    maxAge: 600,
    path: '/',
    sameSite: 'Lax' as const,
    secure: process.env.NODE_ENV === 'production',
  }

  setCookie(c, META_WA_STATE_COOKIE, state, cookieOptions)
  setCookie(c, META_WA_NOTIFY_COOKIE, notificationNumber, cookieOptions)

  try {
    return c.redirect(metaWhatsAppProvider.getOAuthUrl(state, metaWhatsAppRedirectUri()))
  } catch (error) {
    console.error('Meta WhatsApp connect setup error:', errorMessage(error))
    return c.redirect(`${FRONTEND_URL}/dashboard/whatsapp?metaWa=error&reason=not_configured`)
  }
})

integrationRoutes.get('/meta/connect', requireAuthFromQuery, (c) => {
  const clientId = c.get('user').sub
  const state = buildLeadAdsOAuthState(clientId)

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

// Handles the WhatsApp half of the shared callback. Split into its own
// function so the Lead Ads path below reads exactly as it did before -- that
// flow is working and verified, and the cost of breaking it is far higher
// than the cost of a little duplication here.
async function handleWhatsAppOAuthCallback(c: Context<AuthEnv>, code: string | undefined, state: string): Promise<Response> {
  const expectedState = getCookie(c, META_WA_STATE_COOKIE)
  const notificationNumber = getCookie(c, META_WA_NOTIFY_COOKIE)

  deleteCookie(c, META_WA_STATE_COOKIE, { path: '/' })
  deleteCookie(c, META_WA_NOTIFY_COOKIE, { path: '/' })

  if (c.req.query('error')) {
    return c.redirect(`${FRONTEND_URL}/dashboard/whatsapp?metaWa=error&reason=permission_declined`)
  }
  if (!code || !expectedState || state !== expectedState || !notificationNumber) {
    return c.redirect(`${FRONTEND_URL}/dashboard/whatsapp?metaWa=error&reason=invalid_state`)
  }

  try {
    await connectMetaWhatsAppViaOAuth(clientIdFromState(state), code, metaWhatsAppRedirectUri(), notificationNumber)
    return c.redirect(`${FRONTEND_URL}/dashboard/whatsapp?metaWa=connected`)
  } catch (error) {
    // Carried to the UI verbatim rather than flattened to a reason code: the
    // useful failures here ("no WhatsApp account was shared with this app",
    // "account has no phone number") are exactly the ones a code destroys.
    console.error('Meta WhatsApp OAuth callback error:', errorMessage(error))
    return c.redirect(
      `${FRONTEND_URL}/dashboard/whatsapp?metaWa=error&message=${encodeURIComponent(errorMessage(error).slice(0, 300))}`
    )
  }
}

integrationRoutes.get('/meta/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')

  // Checked FIRST and returned early: WhatsApp and Lead Ads share this one
  // callback because only this redirect URI is allowlisted with Meta. The
  // marker is put on the state by /meta-whatsapp/connect, so a Lead Ads
  // callback can never take this branch.
  if (state && isWhatsAppOAuthState(state)) {
    return handleWhatsAppOAuthCallback(c, code, state)
  }

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
