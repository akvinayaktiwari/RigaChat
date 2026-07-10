export interface GupshupDeliveryEventPayload {
  id: string
  destination: string
  payload: {
    type: string
    error?: { errorCode: number; errorText: string }
  }
}

export interface GupshupIncomingMessagePayload {
  id: string
  source: string
  payload: { text?: string }
}

export interface GupshupDeliveryEvent {
  type: 'message-event'
  timestamp: number
  payload: GupshupDeliveryEventPayload
}

export interface GupshupIncomingMessage {
  type: 'message'
  timestamp: number
  payload: GupshupIncomingMessagePayload
}

interface GupshupWebhookBody {
  type?: unknown
  timestamp?: unknown
  payload?: unknown
}

function asWebhookBody(body: unknown): GupshupWebhookBody | null {
  if (typeof body !== 'object' || body === null) return null
  return body as GupshupWebhookBody
}

export function isGupshupDeliveryEvent(body: unknown): body is GupshupDeliveryEvent {
  const b = asWebhookBody(body)
  return b?.type === 'message-event' && typeof b.payload === 'object' && b.payload !== null
}

export function isGupshupIncomingMessage(body: unknown): body is GupshupIncomingMessage {
  const b = asWebhookBody(body)
  return b?.type === 'message' && typeof b.payload === 'object' && b.payload !== null
}

export function getWebhookType(body: unknown): string {
  const b = asWebhookBody(body)
  return typeof b?.type === 'string' ? b.type : 'unknown'
}
