// Drives the inbound half of the WhatsApp loop by POSTing a Meta-shaped webhook
// to the real endpoint.
//
// This is option 1 of the two the issue put up. It exercises everything from
// the webhook boundary inward -- signature verification, lead resolution, the
// agent turn, the KB retrieval, the journey resume -- and stops short of only
// Meta's own delivery to a handset. The alternative (a human with a phone) is
// what scripts/test-meta-journey-run.sh already provides, and it cannot run
// unattended or produce a regression signal.
//
// The signature is REAL, not bypassed. The endpoint rejects an unsigned body
// with a 400 (meta-whatsapp-webhook-service.ts), and a test that needed that
// check disabled would be testing a build nobody ships.

import crypto from 'node:crypto'
import { expect } from '@playwright/test'

export interface InboundMessageOptions {
  // The lead's own number, digits only and no leading '+' -- Meta sends the
  // wa_id in that form, and inbound lead matching compares against it.
  fromWaId: string
  text: string
  phoneNumberId: string
  wabaId: string
}

// A wamid Meta would plausibly have minted. Unique per call because the webhook
// treats it as the idempotency key: a repeated id is deliberately dropped as a
// retry, so a reused one makes the second turn silently vanish.
export function mintWamid(): string {
  return `wamid.E2E${crypto.randomBytes(16).toString('hex').toUpperCase()}`
}

export function buildInboundPayload(options: InboundMessageOptions, wamid: string): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: options.wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: options.phoneNumberId },
              messages: [
                { id: wamid, from: options.fromWaId, type: 'text', text: { body: options.text } },
              ],
            },
          },
        ],
      },
    ],
  })
}

// HMAC-SHA256 over the EXACT bytes being sent, hex, prefixed "sha256=".
// meta-provider.ts's verifyWebhookSignature compares against the raw body the
// route read before any parse, so the string signed here and the string sent
// have to be the same object -- hence both come from one `body` variable at the
// call site rather than being built twice.
export function signPayload(rawBody: string, appSecret: string): string {
  return `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
}

export interface WebhookTarget {
  baseUrl: string
  appSecret: string
}

// Returns the wamid so the caller can correlate the message it just sent with
// what turns up on the timeline.
export async function sendInboundMessage(
  target: WebhookTarget,
  options: InboundMessageOptions
): Promise<string> {
  const wamid = mintWamid()
  const body = buildInboundPayload(options, wamid)

  const response = await fetch(`${target.baseUrl}/api/webhooks/meta-whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signPayload(body, target.appSecret),
    },
    body,
  })

  // 400 here means the signature was rejected, which in practice means
  // META_APP_SECRET differs between this machine and the deployment. Naming
  // that beats a downstream assertion failing three steps later.
  expect(
    response.status,
    `webhook rejected the inbound message (${response.status}) — a 400 means META_APP_SECRET does not match the deployment`
  ).toBe(200)

  return wamid
}
