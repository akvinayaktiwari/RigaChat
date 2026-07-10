import { getWebhookType, isGupshupDeliveryEvent, isGupshupIncomingMessage } from '../lib/gupshup-webhook.js'

export function logGupshupWebhookEvent(body: unknown): void {
  if (isGupshupDeliveryEvent(body)) {
    console.log('WhatsApp delivery event:', {
      messageId: body.payload.id,
      destination: body.payload.destination,
      status: body.payload.payload.type,
      error: body.payload.payload.error ?? null,
      timestamp: new Date(body.timestamp).toISOString(),
    })
    return
  }

  if (isGupshupIncomingMessage(body)) {
    console.log('WhatsApp incoming message:', {
      from: body.payload.source,
      text: body.payload.payload.text,
      messageId: body.payload.id,
    })
    // Feature 2 (WhatsApp chatbot) backlog — do not process further yet.
    return
  }

  console.log('WhatsApp webhook unknown type:', getWebhookType(body))
}
