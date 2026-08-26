// Sends a lead alert to a client's registered phones.
//
// NEVER THROWS. This is the load-bearing property of the whole file, and it is
// stronger than "best effort": both call sites (sendLeadNotification and
// sendHandoffAlert) sit inside try/catch blocks whose catch branches CHANGE
// BEHAVIOUR -- sendLeadNotification's catch fires the email fallback, and
// sendHandoffAlert's reports notified:false. If a push failure escaped into
// either, a perfectly healthy WhatsApp alert would produce a spurious fallback
// email or be reported as undelivered. So a throw here is not just noisy, it
// corrupts a working path. The callers wrap this in their own try/catch as a
// second line of defence; that is deliberate belt-and-braces, not redundancy to
// be tidied away.
//
// Ordering also matters at the call sites: both of them RETURN EARLY on a
// successful WhatsApp send, so the push call has to sit BEFORE the template
// loop or it never runs on the happy path.
//
// See vyostra-mobile docs/SPEC.md and docs/designs/web-mobile-contract.md.

import {
  getDeviceTokensForClient,
  deleteDeviceToken,
} from '../repositories/device-token-repository.js'
import {
  sendExpoPushNotifications,
  EXPO_MAX_MESSAGES_PER_REQUEST,
  type ExpoPushMessage,
  type PushChannelId,
} from '../providers/expo-push-provider.js'
import type { LeadRef } from '../types/index.js'

export type PushKind = 'lead_captured' | 'handoff'

const CHANNEL_FOR: Record<PushKind, PushChannelId> = {
  lead_captured: 'leads',
  handoff: 'handoffs',
}

export interface LeadPushInput {
  clientId: string
  kind: PushKind
  // The full LeadRef, not just a leadId. The three lead tables have three
  // different partition keys, so a leadId alone is not addressable -- the app
  // passes this straight to GET /api/leads/detail with no reconstruction.
  leadRef: LeadRef
  title: string
  body: string
}

export interface LeadPushResult {
  sent: number
  failed: number
  retired: number
  // Present when nothing was attempted. 'no_devices' is the overwhelmingly
  // common case and is NOT a failure: it is every client who has not installed
  // the app, which today is all of them.
  skipped?: 'no_devices' | 'disabled'
}

const NOTHING: LeadPushResult = { sent: 0, failed: 0, retired: 0 }

// Emergency kill switch. Deliberately UNSET in every environment: an unset
// variable costs zero of the 499 remaining Lambda environment bytes, and it can
// be set without a deploy if push ever misbehaves in production. Absence means
// enabled.
function pushDisabled(): boolean {
  return process.env.PUSH_DISABLED === '1'
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// NEVER THROWS -- see the header.
export async function sendLeadPush(input: LeadPushInput): Promise<LeadPushResult> {
  try {
    if (pushDisabled()) {
      console.log(`[push] disabled by PUSH_DISABLED: client=${input.clientId} lead=${input.leadRef.leadId}`)
      return { ...NOTHING, skipped: 'disabled' }
    }

    const devices = await getDeviceTokensForClient(input.clientId)

    // The early return that makes this change safe to deploy. Until a client
    // registers a device there are no rows, so this costs one Query on a
    // partition key and makes no external call at all. Production behaviour is
    // unchanged on the day this ships.
    if (devices.length === 0) return { ...NOTHING, skipped: 'no_devices' }

    const messages: ExpoPushMessage[] = devices.map((device) => ({
      to: device.expoPushToken,
      title: input.title,
      body: input.body,
      sound: 'default',
      channelId: CHANNEL_FOR[input.kind],
      data: { kind: input.kind, leadRef: input.leadRef },
    }))

    // Expo caps a request at 100 messages. One client with more than 100
    // registered devices is not a real scenario today, but the cap is the
    // provider's, not ours, and chunking costs three lines.
    const tickets = (
      await Promise.all(
        chunk(messages, EXPO_MAX_MESSAGES_PER_REQUEST).map((batch) => sendExpoPushNotifications(batch))
      )
    ).flat()

    const byToken = new Map(devices.map((device) => [device.expoPushToken, device]))
    let sent = 0
    let failed = 0
    let retired = 0

    for (const ticket of tickets) {
      if (ticket.ok) {
        sent += 1
        continue
      }
      failed += 1

      // The only ticket code worth acting on. Expo returns it once it is
      // certain the token is dead (app uninstalled, token revoked), so the row
      // is deleted on the first report rather than counted up: a dead token
      // left in the table is a wasted send on every future lead, forever.
      // Anything else -- a network blip, an Expo 5xx -- must NOT delete a live
      // device, which is why the provider never invents this code.
      if (ticket.code === 'DeviceNotRegistered') {
        const device = byToken.get(ticket.expoPushToken)
        if (device) {
          // A failed cleanup must not fail the send. Worst case the row
          // survives and is retired on the next lead.
          await deleteDeviceToken(device.clientId, device.deviceId).catch((error: unknown) => {
            console.error(
              `[push] could not retire dead token: client=${device.clientId} device=${device.deviceId}`,
              error instanceof Error ? error.message : String(error)
            )
          })
          retired += 1
        }
      } else {
        console.error(
          `[push] send failed: client=${input.clientId} lead=${input.leadRef.leadId} error="${ticket.error ?? 'no detail'}"`
        )
      }
    }

    console.log(
      `[push] kind=${input.kind} client=${input.clientId} lead=${input.leadRef.leadId} sent=${sent} failed=${failed} retired=${retired}`
    )
    return { sent, failed, retired }
  } catch (error) {
    // The catch that makes this file's header true. Nothing from here reaches
    // the lead-capture path.
    console.error(
      `[push] threw: client=${input.clientId} lead=${input.leadRef.leadId}`,
      error instanceof Error ? error.message : String(error)
    )
    return NOTHING
  }
}
