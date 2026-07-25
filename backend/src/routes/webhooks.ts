import { Hono } from 'hono'
import { logGupshupWebhookEvent, processRazorpayWebhook } from '../services/webhook-service.js'
import {
  handleMetaDataDeletionRequest,
  handleMetaDeauthorize,
  processMetaLeadWebhook,
  verifyMetaWebhookChallenge,
} from '../services/meta-lead-service.js'

export const webhookRoutes = new Hono()

webhookRoutes.post('/gupshup', async (c) => {
  const body: unknown = await c.req.json().catch(() => null)
  logGupshupWebhookEvent(body)
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

  const { verified, confirmationCode } = handleMetaDataDeletionRequest(signedRequest)
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
