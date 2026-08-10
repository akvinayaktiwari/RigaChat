import { Hono } from 'hono'
import { logGupshupWebhookEvent, processRazorpayWebhook, verifyGupshupWebhookToken } from '../services/webhook-service.js'
import {
  getMetaDeletionRequestStatus,
  handleMetaDataDeletionRequest,
  handleMetaDeauthorize,
  processMetaLeadWebhook,
  verifyMetaWebhookChallenge,
} from '../services/meta-lead-service.js'

import type { ApiResponse, MetaDeletionRequestStatus } from '../types/index.js'

export const webhookRoutes = new Hono()

// No auth middleware, no HMAC signature either — Gupshup doesn't sign
// webhook payloads at all (confirmed against their docs; see
// verifyGupshupWebhookToken's own comment). Authenticity instead comes from
// an unguessable ?token= query param on the callback URL we register in
// Gupshup's dashboard — the one piece of that configuration actually within
// our control. Checked before the body is ever parsed or trusted.
webhookRoutes.post('/gupshup', async (c) => {
  if (!verifyGupshupWebhookToken(c.req.query('token'))) {
    console.error('Gupshup webhook rejected: missing or invalid token')
    return c.body(null, 401)
  }

  const body: unknown = await c.req.json().catch(() => null)
  // Must be awaited, not fire-and-forget: AWS Lambda freezes the execution
  // environment as soon as the handler's response promise resolves (same
  // reasoning already documented on form-lead-service.ts's CRM sync call) --
  // an un-awaited call here could be aborted mid-flight before the inbound
  // message ever gets recorded.
  await logGupshupWebhookEvent(body)
  return c.body(null, 200)
})

// No auth middleware — Razorpay calls this directly, authenticity comes from
// the HMAC signature instead of a JWT. Raw text body read BEFORE any JSON
// parsing: signature verification is over the exact bytes Razorpay signed,
// and c.req.json() would have consumed the stream and reserialized it
// differently (key order, whitespace), breaking the HMAC comparison.
webhookRoutes.post('/razorpay', async (c) => {
  const rawBody = await c.req.text()
  const signature = c.req.header('X-Razorpay-Signature')
  const eventId = c.req.header('x-razorpay-event-id')

  const result = await processRazorpayWebhook(rawBody, signature, eventId)
  return c.json({ message: result.message }, result.status)
})

// One-time verification handshake, run by Meta when the webhook subscription
// is registered at the app level (shared across every client's Page).
webhookRoutes.get('/meta', (c) => {
  const challenge = verifyMetaWebhookChallenge(
    c.req.query('hub.mode'),
    c.req.query('hub.verify_token'),
    c.req.query('hub.challenge')
  )

  if (!challenge) {
    return c.body(null, 403)
  }

  return c.text(challenge, 200)
})

// No auth middleware — Meta calls this directly, authenticity comes from the
// X-Hub-Signature-256 HMAC instead of a JWT. Raw text body read BEFORE any
// JSON parsing, same reasoning as the Razorpay route above: the signature
// covers the exact bytes Meta signed, not a reserialized copy.
webhookRoutes.post('/meta', async (c) => {
  const rawBody = await c.req.text()
  const signature = c.req.header('X-Hub-Signature-256')

  const result = await processMetaLeadWebhook(rawBody, signature)
  return c.json({ message: result.message }, result.status)
})

// Meta platform requirement: called when a user deauthorizes the app.
// Payload is form-urlencoded with a single `signed_request` field.
webhookRoutes.post('/meta/deauthorize', async (c) => {
  const body = await c.req.parseBody()
  const signedRequest = typeof body.signed_request === 'string' ? body.signed_request : undefined

  if (!signedRequest) {
    return c.body(null, 400)
  }

  const { verified } = handleMetaDeauthorize(signedRequest)
  return c.body(null, verified ? 200 : 400)
})

// Meta platform requirement: called when a user requests data deletion.
// Must respond with { url, confirmation_code } per Meta's contract.
webhookRoutes.post('/meta/data-deletion', async (c) => {
  const body = await c.req.parseBody()
  const signedRequest = typeof body.signed_request === 'string' ? body.signed_request : undefined

  if (!signedRequest) {
    return c.body(null, 400)
  }

  const { verified, confirmationCode } = await handleMetaDataDeletionRequest(signedRequest)
  if (!verified) {
    return c.body(null, 400)
  }
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  return c.json(
    {
      url: `${frontendUrl}/data-deletion-status?id=${confirmationCode}`,
      confirmation_code: confirmationCode,
    },
    200
  )
})

// Public by design: this is the page Meta hands the user, and they arrive
// without a Vyostra account. The confirmation code is the credential -- 128
// bits of randomness, so it is not enumerable -- and the response deliberately
// omits the Meta user id that the stored record carries.
webhookRoutes.get('/meta/data-deletion/:code', async (c) => {
  const status = await getMetaDeletionRequestStatus(c.req.param('code'))

  // ApiResponse envelope, unlike the Meta-facing callbacks above it: this one
  // is consumed by our own frontend through apiClient, not by Meta.
  if (!status) {
    return c.json<ApiResponse<null>>({ success: false, error: 'Not found' }, 404)
  }

  return c.json<ApiResponse<MetaDeletionRequestStatus>>({ success: true, data: status }, 200)
})
