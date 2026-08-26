// The only file in the backend that knows Expo Push exists.
//
// WHY EXPO AND NOT FCM DIRECTLY
//   The rigachat-api Lambda environment is at 3597 of 4096 bytes
//   (lib/table-names.ts, ceiling actually hit on 2026-08-10). A Firebase
//   service-account JSON is ~2.3KB and does not fit. Expo Push needs no server
//   credential for unauthenticated sends, so this provider adds ZERO
//   environment bytes. If Expo's push security is enabled later that is one
//   token (~40 bytes) against the remaining headroom.
//
//   Swapping to SNS or direct FCM later is a change to this file and nowhere
//   else. Sits alongside meta-provider.ts and gupshup-provider.ts by the same
//   convention.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

// Expo rejects a request carrying more than 100 messages. The caller chunks;
// this constant is exported so the chunking and the limit cannot drift apart.
export const EXPO_MAX_MESSAGES_PER_REQUEST = 100

// Android notification channels. Two, not one, so a client can mute new-lead
// pings without also muting a handoff -- a handoff means a human is waiting.
// The app creates channels with these exact ids; a mismatch silently downgrades
// to the default channel, so these strings are a contract with the app.
export type PushChannelId = 'leads' | 'handoffs'

export interface ExpoPushMessage {
  to: string
  title: string
  body: string
  sound: 'default'
  channelId: PushChannelId
  // The full LeadRef plus the trigger kind. Carries no PII beyond what is
  // already in title/body: the payload transits Expo's servers, so a
  // transcript must never go in here.
  data: Record<string, unknown>
}

export interface ExpoPushTicket {
  expoPushToken: string
  ok: boolean
  // 'DeviceNotRegistered' means the app was uninstalled or the token revoked.
  // It is the only code the caller acts on, by deleting the row.
  code?: string
  error?: string
}

interface ExpoTicketResponse {
  status?: string
  id?: string
  message?: string
  details?: { error?: string }
}

interface ExpoSendResponse {
  data?: ExpoTicketResponse[]
  errors?: { code?: string; message?: string }[]
}

// Builds a whole-batch failure result. A transport error tells us nothing about
// any individual token, so every token in the chunk gets the same non-fatal
// error and NO code -- emitting a fake 'DeviceNotRegistered' here would delete
// live devices on a network blip.
function failBatch(messages: ExpoPushMessage[], error: string): ExpoPushTicket[] {
  return messages.map((message) => ({ expoPushToken: message.to, ok: false, error }))
}

// NEVER THROWS. Returns one ticket per input message, in input order, which is
// what lets the caller map a failure back to the device row that caused it.
// Expo guarantees the response array matches request order.
export async function sendExpoPushNotifications(
  messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return []

  if (messages.length > EXPO_MAX_MESSAGES_PER_REQUEST) {
    // A caller-side bug, not a runtime condition. Fail the batch loudly rather
    // than letting Expo reject it with a less obvious message.
    return failBatch(
      messages,
      `refusing to send ${messages.length} messages in one request; max is ${EXPO_MAX_MESSAGES_PER_REQUEST}`
    )
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Expo returns gzip by default; being explicit keeps the response
        // parseable in every runtime this Lambda has run on.
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return failBatch(messages, `expo push HTTP ${response.status}: ${text.slice(0, 200)}`)
    }

    const parsed = (await response.json()) as ExpoSendResponse

    // Request-level rejection: the whole batch failed, no per-ticket detail.
    if (parsed.errors?.length) {
      const detail = parsed.errors.map((e) => e.message ?? e.code ?? 'unknown').join('; ')
      return failBatch(messages, `expo push rejected the request: ${detail}`)
    }

    const tickets = parsed.data ?? []

    return messages.map((message, index) => {
      const ticket = tickets[index]
      // A short response is Expo behaving unexpectedly. Treat the missing
      // entries as failed-but-alive rather than assuming success.
      if (!ticket) {
        return { expoPushToken: message.to, ok: false, error: 'expo returned no ticket for this message' }
      }
      if (ticket.status === 'ok') {
        return { expoPushToken: message.to, ok: true }
      }
      return {
        expoPushToken: message.to,
        ok: false,
        ...(ticket.details?.error ? { code: ticket.details.error } : {}),
        error: ticket.message ?? 'expo push failed with no detail',
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return failBatch(messages, `expo push threw: ${message}`)
  }
}
