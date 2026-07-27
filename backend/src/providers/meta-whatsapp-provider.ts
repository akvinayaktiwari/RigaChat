import type { WhatsAppCredentials, WhatsAppProvider, WhatsAppSendResult } from '../lib/whatsapp-provider.js'

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

interface MetaSendResponse {
  messages?: { id: string }[]
  error?: { message?: string; code?: number; error_subcode?: number }
}

interface MetaTokenResponse {
  access_token?: string
  error?: { message?: string }
}

interface MetaPhoneNumberResponse {
  display_phone_number?: string
  error?: { message?: string }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

export interface MetaWhatsAppCredentialsExchange {
  accessToken: string
  displayPhoneNumber: string
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  getProviderName(): string {
    return 'meta_direct'
  }

  // Embedded Signup is an SDK popup flow, not a redirect - the code it
  // returns is exchanged without a redirect_uri, unlike the Lead Ads OAuth
  // flow in meta-provider.ts (see design doc Architecture Issue 1). Meta's
  // exact Embedded Signup config_id/token requirements weren't verified
  // against the live dashboard during design - flagged as Open Question 3.
  async exchangeCodeForCredentials(code: string, phoneNumberId: string): Promise<MetaWhatsAppCredentialsExchange> {
    const clientId = requireEnv('META_APP_ID')
    const clientSecret = requireEnv('META_APP_SECRET')

    const tokenParams = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code })
    const tokenResponse = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${tokenParams.toString()}`)
    const tokenData = (await tokenResponse.json()) as MetaTokenResponse

    if (!tokenData.access_token) {
      throw new Error(`Meta WhatsApp token exchange failed: ${tokenData.error?.message ?? 'Unknown error'}`)
    }

    const phoneParams = new URLSearchParams({ access_token: tokenData.access_token, fields: 'display_phone_number' })
    const phoneResponse = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}?${phoneParams.toString()}`)
    const phoneData = (await phoneResponse.json()) as MetaPhoneNumberResponse

    if (!phoneData.display_phone_number) {
      throw new Error(`Meta phone number lookup failed: ${phoneData.error?.message ?? 'Unknown error'}`)
    }

    return { accessToken: tokenData.access_token, displayPhoneNumber: phoneData.display_phone_number }
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
