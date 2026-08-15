import type {
  MetaDirectCredentials,
  WhatsAppCredentials,
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateSend,
} from '../lib/whatsapp-provider.js'
import { WHATSAPP_TEMPLATE_LANGUAGE, type WhatsAppTemplateDefinition } from '../lib/whatsapp-templates.js'

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

interface MetaTemplateComponent {
  type: 'BODY' | 'BUTTONS'
  text?: string
  example?: { body_text: string[][] }
  buttons?: { type: string; text: string; url?: string }[]
}

interface MetaTemplateCreateResponse {
  id?: string
  status?: string
  category?: string
  // error.message on template rejections is almost always the useless string
  // "Invalid parameter". The actionable reason lives in error_user_title /
  // error_user_msg, so both are captured and surfaced by describeTemplateError
  // below -- without them a rejection costs a manual curl to diagnose.
  error?: {
    message?: string
    code?: number
    error_subcode?: number
    error_user_title?: string
    error_user_msg?: string
  }
}

interface MetaTemplateListResponse {
  data?: { name: string; status: string; category: string; language: string }[]
  error?: { message?: string }
}

export interface ExistingTemplate {
  name: string
  status: string
  category: string
  language: string
}

export type TemplateCreateResult =
  | { success: true; id: string; status: string; category: string }
  | { success: false; error: string }

// Meta requires an `example` for every {{n}} in the body and rejects the
// template outright without one -- see the comment on bodyExample in
// whatsapp-templates.ts. body_text is an array OF arrays: one inner array per
// example set, and we always send exactly one.
function buildComponents(definition: WhatsAppTemplateDefinition): MetaTemplateComponent[] {
  const body: MetaTemplateComponent = { type: 'BODY', text: definition.body }
  if (definition.bodyExample.length > 0) {
    body.example = { body_text: [definition.bodyExample] }
  }

  const components: MetaTemplateComponent[] = [body]

  if (definition.buttons && definition.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: definition.buttons.map((button) =>
        button.url ? { type: button.type, text: button.text, url: button.url } : { type: button.type, text: button.text }
      ),
    })
  }

  return components
}

export interface MetaWhatsAppCredentialsExchange {
  accessToken: string
  displayPhoneNumber: string
}

// Shared by sendMessage and sendTemplate: both hit the same /messages
// endpoint and get the same envelope back, so the success test and the
// retryable classification belong in one place. 4xx = bad number/token/
// payload, or an unapproved template -- none of which a retry fixes. 5xx or a
// network error is transient.
async function interpretSendResponse(response: Response): Promise<WhatsAppSendResult> {
  const data = (await response.json().catch(() => ({}))) as MetaSendResponse

  if (response.ok && data.messages?.[0]?.id) {
    return { success: true, messageId: data.messages[0].id }
  }

  return {
    success: false,
    error: data.error?.message ?? `Meta API returned status ${response.status}`,
    retryable: response.status >= 500 || response.status === 0,
  }
}

function toSendFailure(error: unknown): WhatsAppSendResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    retryable: true,
  }
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
      const response = await this.postMessage(credentials, {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      })
      return await interpretSendResponse(response)
    } catch (error) {
      return toSendFailure(error)
    }
  }

  async sendTemplate(
    to: string,
    template: WhatsAppTemplateSend,
    credentials: WhatsAppCredentials
  ): Promise<WhatsAppSendResult> {
    if (credentials.provider !== 'meta_direct') {
      return { success: false, error: 'MetaWhatsAppProvider received non-Meta credentials', retryable: false }
    }

    try {
      const response = await this.postMessage(credentials, {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template.templateName,
          language: { code: template.languageCode },
          // components is OMITTED entirely when there are no parameters, not
          // sent as an empty array: Meta rejects a body component carrying an
          // empty parameters list, which is exactly the zero-placeholder case
          // (hello_world).
          ...(template.bodyParams.length > 0
            ? {
                components: [
                  {
                    type: 'body',
                    parameters: template.bodyParams.map((text) => ({ type: 'text', text })),
                  },
                ],
              }
            : {}),
        },
      })
      return await interpretSendResponse(response)
    } catch (error) {
      return toSendFailure(error)
    }
  }

  private postMessage(credentials: MetaDirectCredentials, payload: Record<string, unknown>): Promise<Response> {
    return fetch(`${GRAPH_API_BASE}/${credentials.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  }

  // Template management is WABA-scoped, not phone-number-scoped, so these two
  // take a wabaId + token directly rather than WhatsAppCredentials (which
  // carries a phoneNumberId and is about sending). Requires
  // whatsapp_business_management on the token, NOT whatsapp_business_messaging.
  async listMessageTemplates(wabaId: string, accessToken: string): Promise<ExistingTemplate[]> {
    const params = new URLSearchParams({
      fields: 'name,status,category,language',
      limit: '200',
      access_token: accessToken,
    })
    const response = await fetch(`${GRAPH_API_BASE}/${wabaId}/message_templates?${params.toString()}`)
    const data = (await response.json().catch(() => ({}))) as MetaTemplateListResponse

    if (!response.ok || !data.data) {
      throw new Error(`Listing templates failed: ${data.error?.message ?? `status ${response.status}`}`)
    }

    return data.data
  }

  async createMessageTemplate(
    wabaId: string,
    accessToken: string,
    definition: WhatsAppTemplateDefinition
  ): Promise<TemplateCreateResult> {
    try {
      const response = await fetch(`${GRAPH_API_BASE}/${wabaId}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: definition.name,
          language: WHATSAPP_TEMPLATE_LANGUAGE,
          category: definition.category,
          components: buildComponents(definition),
        }),
      })

      const data = (await response.json().catch(() => ({}))) as MetaTemplateCreateResponse

      if (response.ok && data.id) {
        // Meta may return a category different from the one requested -- it
        // reclassifies on its own. Surfacing the returned value rather than the
        // requested one is deliberate: it is a pricing change the caller needs
        // to see.
        return { success: true, id: data.id, status: data.status ?? 'UNKNOWN', category: data.category ?? definition.category }
      }

      return { success: false, error: describeTemplateError(data, response.status) }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

function describeTemplateError(data: MetaTemplateCreateResponse, status: number): string {
  const { message, error_user_title: title, error_user_msg: detail } = data.error ?? {}
  const specific = [title, detail].filter(Boolean).join(': ')
  if (specific) return specific
  return message ?? `Meta API returned status ${status}`
}

export const metaWhatsAppProvider = new MetaWhatsAppProvider()
