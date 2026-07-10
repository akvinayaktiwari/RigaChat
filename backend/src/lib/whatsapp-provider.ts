export interface WhatsAppCredentials {
  apiKey: string
  appName: string
  sourceNumber: string
}

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
