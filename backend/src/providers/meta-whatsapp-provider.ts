import type {
  MetaDirectCredentials,
  WhatsAppCredentials,
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateSend,
} from '../lib/whatsapp-provider.js'
import { WHATSAPP_TEMPLATE_LANGUAGE, type WhatsAppTemplateDefinition } from '../lib/whatsapp-templates.js'

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'
const META_OAUTH_DIALOG_URL = 'https://www.facebook.com/v21.0/dialog/oauth'

interface MetaSendResponse {
  messages?: { id: string }[]
  error?: { message?: string; code?: number; error_subcode?: number }
}

interface MetaTokenResponse {
  access_token?: string
  // Seconds until the business token dies. Embedded Signup configs built from
  // the "60 Expiration Token" template issue ~60-day tokens, so this is ~5.2M
  // and NOT the "never expires" a system user token gives you elsewhere.
  // Meta omits it on some responses, which is why the caller treats a missing
  // value as unknown rather than assuming permanence.
  expires_in?: number
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
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  format?: 'TEXT'
  text?: string
  example?: { body_text: string[][] }
  buttons?: { type: string; text: string; url?: string; example?: string[] }[]
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
// The SEND-side counterpart of buildComponents above. Different shape, different
// API, deliberately not merged: create-time components describe a template's
// STRUCTURE (lowercased 'BODY', example values), send-time components carry its
// VALUES (lowercase 'body', parameters). Meta rejects each shape on the other's
// endpoint.
//
// Returns a spreadable object rather than an array because `components` must be
// OMITTED entirely when there is nothing to fill: Meta rejects a body component
// carrying an empty parameters list, which is exactly the zero-placeholder case
// (hello_world).
function buildSendComponents(template: WhatsAppTemplateSend): { components?: unknown[] } {
  const components: unknown[] = []

  if (template.bodyParams.length > 0) {
    components.push({
      type: 'body',
      parameters: template.bodyParams.map((text) => ({ type: 'text', text })),
    })
  }

  // The value here is the SUFFIX appended to the approved url, never the whole
  // URL: the template holds 'https://vyostra.com/l/{{1}}' and this fills {{1}}.
  // Sending a full URL produces a link with the base repeated twice, which Meta
  // accepts and the recipient cannot open.
  //
  // index is '0' because a template may carry more than one button and the
  // parameter has to name which. Every template that uses this has exactly one.
  if (template.urlButtonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: template.urlButtonParam }],
    })
  }

  return components.length > 0 ? { components } : {}
}

function buildComponents(definition: WhatsAppTemplateDefinition): MetaTemplateComponent[] {
  const components: MetaTemplateComponent[] = []

  // Order matters to Meta: HEADER, BODY, FOOTER, BUTTONS.
  if (definition.header) {
    components.push({ type: 'HEADER', format: 'TEXT', text: definition.header })
  }

  const body: MetaTemplateComponent = { type: 'BODY', text: definition.body }
  if (definition.bodyExample.length > 0) {
    body.example = { body_text: [definition.bodyExample] }
  }
  components.push(body)

  if (definition.footer) {
    components.push({ type: 'FOOTER', text: definition.footer })
  }

  if (definition.buttons && definition.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      // A dynamic URL button ({{1}} in the url) must ship a full example URL,
      // exactly as a parameterised body must ship body_text. Meta wants it as
      // an ARRAY even though only one value is ever meaningful.
      buttons: definition.buttons.map((button) => {
        if (!button.url) return { type: button.type, text: button.text }
        const mapped: { type: string; text: string; url?: string; example?: string[] } = {
          type: button.type,
          text: button.text,
          url: button.url,
        }
        if (button.urlExample) mapped.example = [button.urlExample]
        return mapped
      }),
    })
  }

  return components
}

export interface DiscoveredWhatsAppAccount {
  wabaId: string
  phoneNumberId: string
  displayPhoneNumber: string
}

interface MetaBusinessListResponse {
  data?: { id: string; name?: string }[]
  error?: { message?: string }
}

interface MetaWabaListResponse {
  data?: { id: string; name?: string }[]
  error?: { message?: string }
}

interface MetaPhoneListResponse {
  data?: { id: string; display_phone_number?: string }[]
  error?: { message?: string }
}

export interface MetaWhatsAppCredentialsExchange {
  accessToken: string
  displayPhoneNumber: string
  // ISO timestamp, absent when Meta did not report expires_in. Stored on the
  // connection so a token approaching death can be found BEFORE it takes a
  // client's inbound and outbound with it.
  tokenExpiresAt?: string
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

    return {
      accessToken: tokenData.access_token,
      displayPhoneNumber: phoneData.display_phone_number,
      tokenExpiresAt:
        tokenData.expires_in === undefined
          ? undefined
          : new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
    }
  }

  // The redirect-based alternative to Embedded Signup, mirroring the Lead Ads
  // flow in meta-provider.ts exactly: a top-level browser navigation to
  // /dialog/oauth driven by a dashboard login CONFIGURATION rather than a raw
  // scope string, because this app is Facebook Login for Business and raw
  // scopes are not a supported path for it.
  //
  // config_id is therefore mandatory, and override_default_response_type is
  // required alongside it or the dialog can hand back a token instead of the
  // `code` we exchange. Same reasoning as meta-provider.ts:106 -- see there.
  getOAuthUrl(state: string, redirectUri: string): string {
    const configId = process.env.META_WHATSAPP_CONFIG_ID
    if (!configId) {
      throw new Error(
        'Missing META_WHATSAPP_CONFIG_ID. It is the Meta login configuration carrying the WhatsApp permissions; ' +
          'without it a Login for Business app cannot show a consent screen at all.'
      )
    }

    const params = new URLSearchParams({
      client_id: requireEnv('META_APP_ID'),
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      config_id: configId,
      override_default_response_type: 'true',
    })

    return `${META_OAUTH_DIALOG_URL}?${params.toString()}`
  }

  // Unlike exchangeCodeForCredentials below (the Embedded Signup path, which
  // sends no redirect_uri), a redirect-based grant MUST echo back the exact
  // redirect_uri that started it or Meta rejects the exchange.
  //
  // TWO steps, not one, for the same reason meta-provider.ts has three: the
  // code exchange returns a SHORT-LIVED token good for about an hour. We STORE
  // this token and reuse it for every future send, so storing the short-lived
  // one produces a connection that works during the connect and then dies
  // quietly ~an hour later, while the client is still logged in and everything
  // still looks connected. That exact bug was already fixed once for Lead Ads
  // in df5405a; this is the WhatsApp equivalent.
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
    const clientId = requireEnv('META_APP_ID')
    const clientSecret = requireEnv('META_APP_SECRET')

    const shortLived = await this.requestToken(
      new URLSearchParams({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code }),
      'code exchange'
    )

    // Throwing rather than falling back to the short-lived token is
    // deliberate: a fallback would look like a successful connect and then
    // fail every send an hour later, which from the dashboard is
    // indistinguishable from Meta having broken something.
    return this.requestToken(
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: shortLived,
      }),
      'long-lived token exchange'
    )
  }

  private async requestToken(params: URLSearchParams, stage: string): Promise<string> {
    const response = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`)
    const data = (await response.json().catch(() => ({}))) as MetaTokenResponse

    if (!data.access_token) {
      throw new Error(`Meta WhatsApp ${stage} failed: ${data.error?.message ?? 'Unknown error'}`)
    }

    return data.access_token
  }

  // Replaces what Embedded Signup hands over via postMessage. ES tells the
  // browser the waba_id and phone_number_id directly; a redirect grant does
  // not, so we walk businesses -> WABAs -> phone numbers instead.
  //
  // Every failure here is reported with the specific thing that was empty,
  // because they mean different things and have different fixes. In
  // particular an empty WABA list almost always means the user did not tick
  // their WhatsApp account on the asset-selection screen -- Meta grants these
  // permissions PER ASSET, and a token scoped to zero WABAs reads exactly
  // like a token with no permission at all.
  async discoverWhatsAppAccount(accessToken: string): Promise<DiscoveredWhatsAppAccount> {
    const businesses = await this.getJson<MetaBusinessListResponse>('me/businesses', accessToken, 'id,name')
    const business = businesses.data?.[0]
    if (!business) {
      throw new Error('No Meta business portfolio is visible to this account.')
    }

    const wabas = await this.getJson<MetaWabaListResponse>(
      `${business.id}/owned_whatsapp_business_accounts`,
      accessToken,
      'id,name'
    )
    const waba = wabas.data?.[0]
    if (!waba) {
      throw new Error(
        'No WhatsApp Business Account was shared with this app. On the Meta consent screen, select the ' +
          'WhatsApp account you want to connect -- permissions are granted per account, not app-wide.'
      )
    }

    const phones = await this.getJson<MetaPhoneListResponse>(
      `${waba.id}/phone_numbers`,
      accessToken,
      'id,display_phone_number'
    )
    const phone = phones.data?.[0]
    if (!phone?.id) {
      throw new Error(`WhatsApp account "${waba.name ?? waba.id}" has no phone number added yet.`)
    }

    return {
      wabaId: waba.id,
      phoneNumberId: phone.id,
      displayPhoneNumber: phone.display_phone_number ?? '',
    }
  }

  private async getJson<T extends { error?: { message?: string } }>(
    path: string,
    accessToken: string,
    fields: string
  ): Promise<T> {
    const params = new URLSearchParams({ access_token: accessToken, fields })
    const response = await fetch(`${GRAPH_API_BASE}/${path}?${params.toString()}`)
    const data = (await response.json().catch(() => ({}))) as T

    if (!response.ok) {
      throw new Error(`Meta lookup ${path} failed: ${data.error?.message ?? `status ${response.status}`}`)
    }

    return data
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
          ...buildSendComponents(template),
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

  // Subscribes THIS app to the WABA's webhooks. Without it Meta delivers
  // nothing to our endpoint -- the endpoint can pass verification, the
  // credentials can send messages, and inbound is still silently dead.
  //
  // The Lead Ads flow has always done the Page-level equivalent
  // (meta-provider.ts's POST /{pageId}/subscribed_apps). The WhatsApp flow
  // never had its WABA-level counterpart, which is why no reply ever reached a
  // journey. Found by the first live journey run on 2026-08-16, ~24h after the
  // send path was proven working -- send and receive fail independently, and
  // only receive fails quietly.
  //
  // Fields come from the app's webhook configuration in the Meta dashboard, not
  // from this call, so `messages` must be ticked there too. This only says
  // "deliver this WABA's events to this app".
  async subscribeWabaToApp(wabaId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${GRAPH_API_BASE}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean
      error?: { message?: string }
    }

    if (!response.ok || data.success !== true) {
      throw new Error(
        `Subscribing WABA ${wabaId} to the app failed: ${data.error?.message ?? `status ${response.status}`}`
      )
    }
  }

  // Reads back which apps a WABA delivers to, so a subscribe can be CONFIRMED
  // rather than assumed from its own 200. Worth the extra call precisely
  // because the bug this whole path exists to fix was a subscription that was
  // never made and never noticed -- trusting a write to have worked is the
  // habit that produced it.
  async isWabaSubscribedToApp(wabaId: string, accessToken: string): Promise<boolean> {
    const appId = requireEnv('META_APP_ID')
    const params = new URLSearchParams({ access_token: accessToken })
    const response = await fetch(`${GRAPH_API_BASE}/${wabaId}/subscribed_apps?${params.toString()}`)
    const data = (await response.json().catch(() => ({}))) as {
      data?: { whatsapp_business_api_data?: { id?: string } }[]
      error?: { message?: string }
    }

    if (!response.ok) {
      throw new Error(
        `Reading subscribed apps for WABA ${wabaId} failed: ${data.error?.message ?? `status ${response.status}`}`
      )
    }

    return (data.data ?? []).some((entry) => entry.whatsapp_business_api_data?.id === appId)
  }

  // Activates the number for Cloud API sending. THE step that was missing:
  // exchanging the code and subscribing the WABA both succeed without it, the
  // connection record looks complete, and then the first send fails -- the
  // same shape of silent, late-surfacing failure as the missing
  // subscribed_apps call above, one layer over.
  //
  // The PIN is the number's two-step verification PIN, and Meta binds it on
  // FIRST registration. Re-registering later with a different PIN is
  // rejected, which is why the caller must persist whatever it passed here
  // rather than generating a fresh one per call.
  //
  // Requires whatsapp_business_management AND whatsapp_business_messaging on
  // the token -- register is the one call in this flow that needs both.
  async registerPhoneNumber(phoneNumberId: string, pin: string, accessToken: string): Promise<void> {
    const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    })
    const data = (await response.json().catch(() => ({}))) as {
      success?: boolean
      error?: { message?: string; code?: number; error_user_msg?: string }
    }

    // Re-registering an already-live number with the SAME pin returns
    // success:true, so idempotency needs no special case here. Nothing else is
    // treated as success: the 133xxx registration codes are not documented on
    // Meta's register reference, and guessing which of them means "already
    // fine" risks reporting a connected number that cannot send -- the exact
    // failure this call was added to close.
    if (response.ok && data.success === true) return

    throw new Error(
      `Registering phone number ${phoneNumberId} failed: ` +
        `${data.error?.error_user_msg ?? data.error?.message ?? `status ${response.status}`}`
    )
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
          language: definition.language ?? WHATSAPP_TEMPLATE_LANGUAGE,
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
