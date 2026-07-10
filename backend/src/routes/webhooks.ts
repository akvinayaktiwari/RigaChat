import { Hono } from 'hono'
import { logGupshupWebhookEvent } from '../services/webhook-service.js'

export const webhookRoutes = new Hono()

webhookRoutes.post('/gupshup', async (c) => {
  const body: unknown = await c.req.json().catch(() => null)
  logGupshupWebhookEvent(body)
  return c.body(null, 200)
})
