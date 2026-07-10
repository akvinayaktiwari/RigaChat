import type { WhatsAppCredentials, WhatsAppProvider, WhatsAppSendResult } from '../lib/whatsapp-provider.js'

const GUPSHUP_API_URL = 'https://api.gupshup.io/wa/api/v1/msg'

interface GupshupSendResponse {
  status?: string
  messageId?: string
  message?: string
}

export class GupshupProvider implements WhatsAppProvider {
  getProviderName(): string {
    return 'gupshup'
  }

  async sendMessage(to: string, message: string, credentials: WhatsAppCredentials): Promise<WhatsAppSendResult> {
    const body = new URLSearchParams({
      channel: 'whatsapp',
      source: credentials.sourceNumber,
      destination: to,
      'src.name': credentials.appName,
      message: JSON.stringify({ type: 'text', text: message }),
    })

    try {
      const response = await fetch(GUPSHUP_API_URL, {
        method: 'POST',
        headers: {
          apikey: credentials.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      })

      const data = (await response.json().catch(() => ({}))) as GupshupSendResponse

      if (response.ok && data.status === 'submitted' && data.messageId) {
        return { success: true, messageId: data.messageId }
      }

      // 4xx = bad number/template/credentials, won't succeed on retry.
      // 5xx or network errors = transient, safe to retry.
      const retryable = response.status >= 500 || response.status === 0

      return {
        success: false,
        error: data.message ?? `Gupshup API returned status ${response.status}`,
        retryable,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      }
    }
  }
}

export const gupshupProvider = new GupshupProvider()
