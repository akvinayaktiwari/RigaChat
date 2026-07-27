export interface GupshupCredentials {
  provider: 'gupshup'
  apiKey: string
  appName: string
  sourceNumber: string
}

export interface MetaDirectCredentials {
  provider: 'meta_direct'
  phoneNumberId: string
  accessToken: string
}

export type WhatsAppCredentials = GupshupCredentials | MetaDirectCredentials

export interface WhatsAppSendResult {
  success: boolean
  messageId?: string
  error?: string
  retryable?: boolean
}

export interface WhatsAppProvider {
  getProviderName(): string
  sendMessage(to: string, message: string, credentials: WhatsAppCredentials): Promise<WhatsAppSendResult>
}
