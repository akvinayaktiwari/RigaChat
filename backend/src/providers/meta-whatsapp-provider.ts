import type { WhatsAppCredentials, WhatsAppProvider, WhatsAppSendResult } from '../lib/whatsapp-provider.js'

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

interface MetaSendResponse {
  messages?: { id: string }[]
  error?: { message?: string; code?: number; error_subcode?: number }
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  getProviderName(): string {
    return 'meta_direct'
  }

  async sendMessage(to: string, message: string, credentials: WhatsAppCredentials): Promise<WhatsAppSendResult> {
    if (credentials.provider !== 'meta_direct') {
      return { success: false, error: 'MetaWhatsAppProvider received non-Meta credentials', retryable: false }
    }

    try {
      const response = await fetch(`${GRAPH_API_BASE}/${credentials.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        }),
      })

      const data = (await response.json().catch(() => ({}))) as MetaSendResponse

      if (response.ok && data.messages?.[0]?.id) {
        return { success: true, messageId: data.messages[0].id }
      }

      // 4xx = bad number/token/payload, won't succeed on retry.
      // 5xx or network errors = transient, safe to retry.
      const retryable = response.status >= 500 || response.status === 0

      return {
        success: false,
        error: data.error?.message ?? `Meta API returned status ${response.status}`,
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

export const metaWhatsAppProvider = new MetaWhatsAppProvider()
