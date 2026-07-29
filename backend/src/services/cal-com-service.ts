import {
  createBooking as createCalComBooking,
  exchangeCodeForTokens,
  getEventTypes as getCalComEventTypesFromApi,
  getOAuthUrl,
  refreshAccessToken,
} from '../lib/cal-com.js'
import type { CreateBookingInput, CalComBooking, CalComEventType } from '../lib/cal-com.js'
import { decrypt, encrypt } from '../lib/kms.js'
import { getClientById, removeClientCalComConnection, updateClient } from '../repositories/client-repository.js'
import type { CalComConnection } from '../types/index.js'

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

export { getOAuthUrl }

export async function connectCalCom(clientId: string, code: string): Promise<void> {
  const tokens = await exchangeCodeForTokens(code)

  const [accessTokenEncrypted, refreshTokenEncrypted] = await Promise.all([
    encrypt(tokens.accessToken),
    encrypt(tokens.refreshToken),
  ])

  await updateClient(clientId, {
    calComConnection: {
      provider: 'cal_com',
      connected: true,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt: tokens.expiresAt,
      connectedAt: new Date().toISOString(),
    },
  })
}

export async function disconnectCalCom(clientId: string): Promise<void> {
  await removeClientCalComConnection(clientId)
}

export async function getCalComStatus(
  clientId: string
): Promise<(Omit<CalComConnection, 'accessTokenEncrypted' | 'refreshTokenEncrypted'> & { connected: boolean }) | null> {
  const client = await getClientById(clientId)
  if (!client?.calComConnection) return null

  const { accessTokenEncrypted: _a, refreshTokenEncrypted: _r, ...status } = client.calComConnection
  return status
}

function isTokenExpiringSoon(tokenExpiresAt: string): boolean {
  return Date.now() >= new Date(tokenExpiresAt).getTime() - TOKEN_EXPIRY_BUFFER_MS
}

// Proactive refresh (checked before every API call), not reactive on a 401 --
// Cal.com's 30-minute token lifetime is short enough that a request built
// with a token that expires mid-flight is a real, not theoretical, risk.
// Persists the refreshed tokens back to the client record so the next call
// doesn't need to refresh again. Takes an already-fetched connection rather
// than a clientId + its own getClientById() call, so callers that already
// need the connection for another check (e.g. bookViaCalCom checking
// defaultEventTypeId) don't fetch the client record twice.
async function getValidAccessToken(clientId: string, connection: CalComConnection): Promise<string> {
  if (!isTokenExpiringSoon(connection.tokenExpiresAt)) {
    return decrypt(connection.accessTokenEncrypted)
  }

  const refreshToken = await decrypt(connection.refreshTokenEncrypted)
  const refreshed = await refreshAccessToken(refreshToken)

  const [accessTokenEncrypted, refreshTokenEncrypted] = await Promise.all([
    encrypt(refreshed.accessToken),
    encrypt(refreshed.refreshToken),
  ])

  await updateClient(clientId, {
    calComConnection: {
      ...connection,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt: refreshed.expiresAt,
    },
  })

  return refreshed.accessToken
}

export async function getCalComEventTypes(clientId: string): Promise<CalComEventType[]> {
  const client = await getClientById(clientId)
  const connection = client?.calComConnection
  if (!connection?.connected) {
    throw new Error('Cal.com is not connected for this client')
  }

  const accessToken = await getValidAccessToken(clientId, connection)
  return getCalComEventTypesFromApi(accessToken)
}

export async function setCalComDefaultEventType(clientId: string, eventTypeId: number): Promise<void> {
  const client = await getClientById(clientId)
  if (!client?.calComConnection) {
    throw new Error('Cal.com is not connected for this client')
  }

  await updateClient(clientId, {
    calComConnection: { ...client.calComConnection, defaultEventTypeId: eventTypeId },
  })
}

export interface BookViaCalComInput {
  clientId: string
  start: string
  attendeeName: string
  attendeeEmail?: string
  attendeeTimeZone: string
}

export type BookViaCalComResult =
  | { connected: true; booking: CalComBooking }
  | { connected: false }

// The single entry point booking-mcp-server.ts calls -- returns
// `{connected: false}` rather than throwing when the client has no Cal.com
// connection or no default event type set, since that's a real, expected
// state (client hasn't finished setup yet), not an error condition. A real
// booking failure (connected, but Cal.com's API rejects the request) DOES
// throw, so the caller can record AppointmentRequest.status: 'failed' with
// the real reason rather than silently falling back to 'requested'.
export async function bookViaCalCom(input: BookViaCalComInput): Promise<BookViaCalComResult> {
  const client = await getClientById(input.clientId)
  const connection = client?.calComConnection

  if (!connection?.connected || !connection.defaultEventTypeId) {
    return { connected: false }
  }

  const accessToken = await getValidAccessToken(input.clientId, connection)

  const bookingInput: CreateBookingInput = {
    eventTypeId: connection.defaultEventTypeId,
    start: input.start,
    attendeeName: input.attendeeName,
    attendeeEmail: input.attendeeEmail,
    attendeeTimeZone: input.attendeeTimeZone,
  }

  const booking = await createCalComBooking(accessToken, bookingInput)
  return { connected: true, booking }
}
