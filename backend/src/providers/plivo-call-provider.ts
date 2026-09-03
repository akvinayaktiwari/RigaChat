// The only file in the backend that knows how to control a live Plivo call.
//
// Sits alongside meta-provider.ts, gupshup-provider.ts and expo-push-provider.ts
// by the same convention: one file per external service, so swapping Plivo for
// Exotel later is a change here and nowhere else.
//
// UNVERIFIED AGAINST A LIVE CALL. The request shape follows Plivo's published
// call-transfer API; there is no account yet (the DID/KYC step is still open).
// The failure mode is safe by construction -- a transfer that does not happen
// returns false, and every caller falls back to the notify-and-callback path
// that shipped before this. It cannot strand a caller in silence.

const PLIVO_API_BASE = 'https://api.plivo.com/v1/Account'

// A caller waiting to be put through is listening to nothing. Plivo's API is
// normally fast, and a slow transfer is worse than a failed one: on failure the
// agent can still say "I'll have someone call you back", but only if the answer
// arrives while the call is still up.
const TRANSFER_TIMEOUT_MS = 5000

export interface PlivoCredentials {
  authId: string
  authToken: string
}

export interface TransferCallInput {
  credentials: PlivoCredentials
  callUuid: string
  // A URL Plivo will fetch for the XML describing what to do next -- our
  // /plivo/transfer endpoint, which answers with a <Dial> to the staff number.
  // Plivo fetches it rather than accepting inline XML, which is why the
  // transfer target travels as a query parameter on that URL.
  transferUrl: string
}

// Moves the caller's leg away from the media stream and onto whatever the
// transfer URL's XML says. Returns false on ANY failure, never throws: the
// caller is on the line and a thrown error here would end their call instead of
// degrading to a callback.
export async function transferCall(input: TransferCallInput): Promise<boolean> {
  const url = `${PLIVO_API_BASE}/${input.credentials.authId}/Call/${encodeURIComponent(input.callUuid)}/`
  const auth = Buffer.from(`${input.credentials.authId}:${input.credentials.authToken}`).toString('base64')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TRANSFER_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      // 'aleg' is the caller's own leg. Transferring the b-leg would move the
      // wrong party and leave the caller listening to a dead stream.
      body: JSON.stringify({ legs: 'aleg', aleg_url: input.transferUrl, aleg_method: 'GET' }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(
        `[plivo-call] transfer of ${input.callUuid} failed: ${response.status} ${detail.slice(0, 200)}`
      )
      return false
    }

    return true
  } catch (error) {
    console.error(
      `[plivo-call] transfer of ${input.callUuid} threw:`,
      error instanceof Error ? error.message : error
    )
    return false
  } finally {
    clearTimeout(timeout)
  }
}
