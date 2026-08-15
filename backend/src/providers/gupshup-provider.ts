import type {
  WhatsAppCredentials,
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateSend,
} from '../lib/whatsapp-provider.js'

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
    if (credentials.provider !== 'gupshup') {
      return { success: false, error: 'GupshupProvider received non-Gupshup credentials', retryable: false }
    }

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

  // An honest, structural "not supported" rather than a silent failure or a
  // guessed implementation. Gupshup templates are NOT interchangeable with
  // Meta's: they live at a different endpoint (/template/msg) and are
  // addressed by a per-app template UUID, not by the name that
  // whatsapp-templates.ts and WhatsAppTemplateSend are built around. There is
  // no mapping from one to the other in this codebase, and inventing one
  // unverified would produce sends that fail at Gupshup with a far more
  // confusing error than this.
  //
  // Returns retryable: false deliberately -- a missing capability is not a
  // transient fault, so sendWithRetry must not burn three attempts on it.
  async sendTemplate(
    _to: string,
    template: WhatsAppTemplateSend,
    _credentials: WhatsAppCredentials
  ): Promise<WhatsAppSendResult> {
    return {
      success: false,
      error:
        `Template sends are not implemented for the Gupshup provider (template "${template.templateName}"). ` +
        'Gupshup addresses templates by per-app UUID rather than by name; switch the client to the meta_direct provider to send templates.',
      retryable: false,
    }
  }
}

export const gupshupProvider = new GupshupProvider()
