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
  // `title`/`postbackText` carry a quick-reply tap's label; `type`
  // discriminates it from typed text. See lib/whatsapp-inbound.ts.
  payload: { text?: string; type?: string; title?: string; postbackText?: string }
}

export interface GupshupDeliveryEvent {
  type: 'message-event'
  timestamp: number
  app?: string
  payload: GupshupDeliveryEventPayload
}

export interface GupshupIncomingMessage {
  type: 'message'
  timestamp: number
  // Top-level field naming which Gupshup app the event is for (confirmed
  // against Gupshup's own docs) -- matches client.whatsappConnection.appName
  // at connect time. This is what makes routing the single shared
  // /webhooks/gupshup endpoint to the right client possible; see
  // gupshup-app-lookup-repository.ts.
  app?: string
  payload: GupshupIncomingMessagePayload
}

interface GupshupWebhookBody {
  type?: unknown
  timestamp?: unknown
  app?: unknown
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
