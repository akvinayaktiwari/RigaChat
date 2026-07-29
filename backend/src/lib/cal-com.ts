// Cal.com v2 OAuth + booking API client. Mirrors zoho-provider.ts's shape
// (getOAuthUrl / exchangeCodeForTokens / refreshAccessToken), but as plain
// functions rather than a class implementing a shared provider interface --
// Cal.com isn't a CRMProvider/WhatsAppProvider, it's a new capability with
// no existing interface to conform to.
//
// Requires an OAuth client registered at app.cal.com/settings/developer/oauth
// and approved by a Cal.com admin (external, out-of-our-control turnaround --
// same shape as the Meta WhatsApp Business App Review this project already
// went through). CAL_COM_CLIENT_ID/CAL_COM_CLIENT_SECRET are placeholders
// until that approval lands -- see TODOS.md.

const CAL_COM_AUTHORIZE_URL = 'https://app.cal.com/auth/oauth2/authorize'
const CAL_COM_TOKEN_URL = 'https://api.cal.com/v2/auth/oauth2/token'
const CAL_COM_API_BASE = 'https://api.cal.com/v2'

// Cal.com versions each endpoint independently, not globally -- using the
// wrong value for a given endpoint 404s rather than falling back gracefully.
const EVENT_TYPES_API_VERSION = '2024-06-14'
const BOOKINGS_API_VERSION = '2026-02-25'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

const CAL_COM_CLIENT_ID = requireEnv('CAL_COM_CLIENT_ID')
const CAL_COM_CLIENT_SECRET = requireEnv('CAL_COM_CLIENT_SECRET')
const CAL_COM_REDIRECT_URI = requireEnv('CAL_COM_REDIRECT_URI')

export interface CalComTokens {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

interface CalComTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export function getOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CAL_COM_CLIENT_ID,
    redirect_uri: CAL_COM_REDIRECT_URI,
    response_type: 'code',
    // BOOKING_WRITE to create bookings, EVENT_TYPE_READ so a client can pick
    // which of their event types the booking tool books against (see
    // getEventTypes below) -- the minimum scope set this integration needs.
    scope: 'BOOKING_WRITE EVENT_TYPE_READ',
    state,
  })
  return `${CAL_COM_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<CalComTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CAL_COM_CLIENT_ID,
    client_secret: CAL_COM_CLIENT_SECRET,
    redirect_uri: CAL_COM_REDIRECT_URI,
    code,
  })

  const response = await fetch(CAL_COM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = (await response.json()) as CalComTokenResponse

  if (!data.access_token || !data.refresh_token || !data.expires_in) {
    throw new Error(`Cal.com token exchange failed: ${data.error_description ?? data.error ?? 'Unknown error'}`)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }
}

// Access tokens expire in 30 minutes -- short-lived compared to Zoho/Meta --
// so cal-com-service.ts refreshes proactively before every API call rather
// than reactively on a 401, which is why this is a separate function from
// exchangeCodeForTokens rather than a shared "get tokens" path.
export async function refreshAccessToken(refreshToken: string): Promise<CalComTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CAL_COM_CLIENT_ID,
    client_secret: CAL_COM_CLIENT_SECRET,
    refresh_token: refreshToken,
  })

  const response = await fetch(CAL_COM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = (await response.json()) as CalComTokenResponse

  if (!data.access_token || !data.expires_in) {
    throw new Error(`Cal.com token refresh failed: ${data.error_description ?? data.error ?? 'Unknown error'}`)
  }

  return {
    accessToken: data.access_token,
    // Cal.com may or may not rotate the refresh token on refresh; fall back
    // to the existing one if a new one wasn't issued rather than losing it.
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }
}

export interface CalComEventType {
  id: number
  title: string
  slug: string
  lengthInMinutes: number
}

interface CalComEventTypesResponse {
  data?: { id: number; title: string; slug: string; lengthInMinutes: number }[]
}

export async function getEventTypes(accessToken: string): Promise<CalComEventType[]> {
  const response = await fetch(`${CAL_COM_API_BASE}/event-types`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'cal-api-version': EVENT_TYPES_API_VERSION },
  })

  if (!response.ok) {
    throw new Error(`Cal.com getEventTypes failed with status ${response.status}`)
  }

  const data = (await response.json()) as CalComEventTypesResponse
  return (data.data ?? []).map((et) => ({
    id: et.id,
    title: et.title,
    slug: et.slug,
    lengthInMinutes: et.lengthInMinutes,
  }))
}

export interface CreateBookingInput {
  eventTypeId: number
  start: string
  attendeeName: string
  attendeeEmail?: string
  attendeeTimeZone: string
}

export interface CalComBooking {
  uid: string
  status: string
  start: string
  end: string
}

interface CalComCreateBookingResponse {
  data?: { uid: string; status: string; start: string; end: string }
  error?: { message?: string }
}

export async function createBooking(accessToken: string, input: CreateBookingInput): Promise<CalComBooking> {
  const response = await fetch(`${CAL_COM_API_BASE}/bookings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'cal-api-version': BOOKINGS_API_VERSION,
    },
    body: JSON.stringify({
      eventTypeId: input.eventTypeId,
      start: input.start,
      attendee: {
        name: input.attendeeName,
        email: input.attendeeEmail,
        timeZone: input.attendeeTimeZone,
      },
    }),
  })

  const data = (await response.json()) as CalComCreateBookingResponse

  if (!response.ok || !data.data) {
    throw new Error(`Cal.com createBooking failed: ${data.error?.message ?? `status ${response.status}`}`)
  }

  return { uid: data.data.uid, status: data.data.status, start: data.data.start, end: data.data.end }
}
