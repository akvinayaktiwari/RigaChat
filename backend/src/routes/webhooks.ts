import { Hono } from 'hono'
import { logGupshupWebhookEvent, processRazorpayWebhook } from '../services/webhook-service.js'

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
