import crypto from 'node:crypto'
import {
  MetaMisconfiguredError,
  MetaNoPagesError,
  MetaPagesLookupError,
  MetaTokenExchangeError,
} from '../lib/meta-connect-errors.js'

const META_OAUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth'
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

// pages_show_list: list the Pages the client manages.
// pages_manage_metadata: required to read/manage a Page's webhook subscriptions.
// pages_read_engagement + leads_retrieval: required to read Lead Ads field_data.
// pages_manage_ads: not used by any call we make, but Meta REQUIRES it to be
// present in the App Review submission for leads_retrieval -- a submission
// without it is rejected regardless of how good the screencast is.
// leads_retrieval requires Meta App Review before this scope works for any
// Page outside the app's own test Pages/roles -- see design doc Dependencies.
const META_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_manage_ads',
  'leads_retrieval',
].join(',')

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

interface MetaTokenResponse {
  access_token?: string
  error?: { message?: string; type?: string; code?: number }
}

interface MetaPageEntry {
  id: string
  name: string
  access_token: string
}

interface MetaPagesResponse {
  data?: MetaPageEntry[]
  error?: { message?: string }
}

export interface MetaPageCredentials {
  pageId: string
  pageName: string
  pageAccessToken: string
}

export interface MetaFieldDatum {
  name: string
  values: string[]
}

interface MetaLeadgenResponse {
  field_data?: MetaFieldDatum[]
  created_time?: string
  error?: { message?: string; code?: number }
}

export class MetaProvider {
  getProviderName(): string {
    return 'meta'
  }

  getOAuthUrl(state: string): string {
    const clientId = requireEnv('META_APP_ID')
    const redirectUri = requireEnv('META_REDIRECT_URI')

    // A localhost redirect in production is the misconfiguration that costs the
    // most to diagnose: Meta accepts the request, shows the consent screen, and
    // only then answers "URL Blocked" -- by which point the client has left the
    // dashboard and there is nothing in our logs. Caught before the redirect.
    if (process.env.NODE_ENV === 'production' && /localhost|127\.0\.0\.1/.test(redirectUri)) {
      throw new MetaMisconfiguredError('META_REDIRECT_URI still points at localhost')
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
    })

    // This app is configured for Facebook Login for Business, where the consent
    // screen is driven by a dashboard *configuration* rather than by a scope
    // string. Sending raw scopes against a config-driven app is what produced
    // Meta's "Facebook Login is currently unavailable for this app, since we are
    // updating additional details" screen: there was no configuration matching
    // the Page permissions we asked for, and Meta reports that as a vague
    // "try again later" instead of an error naming the cause.
    //
    // override_default_response_type is required alongside config_id -- without
    // it the dialog can hand back a token instead of the `code` we exchange.
    //
    // Falls back to the scope string when the env var is unset, so local dev and
    // any app not on Login for Business keep working unchanged.
    const configId = process.env.META_LOGIN_CONFIG_ID
    if (configId) {
      params.set('config_id', configId)
      params.set('override_default_response_type', 'true')
    } else {
      params.set('scope', META_OAUTH_SCOPES)
    }

    return `${META_OAUTH_URL}?${params.toString()}`
  }

  // Meta's OAuth code exchange yields a short-lived USER access token, not a
  // Page token -- a Page's Lead Ads data is only readable with a PAGE access
  // token (from GET /me/accounts, using that user token). MVP connects
  // whichever Page appears first in that list (see design doc Open
  // Questions / Premise 4 -- one Page per client for now).
  async exchangeCodeForPageCredentials(code: string): Promise<MetaPageCredentials> {
    const clientId = requireEnv('META_APP_ID')
    const clientSecret = requireEnv('META_APP_SECRET')
    const redirectUri = requireEnv('META_REDIRECT_URI')

    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    })

    const tokenResponse = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${tokenParams.toString()}`)
    const tokenData = (await tokenResponse.json()) as MetaTokenResponse

    if (!tokenData.access_token) {
      throw new MetaTokenExchangeError(tokenData.error?.message ?? 'Unknown error')
    }

    const pagesParams = new URLSearchParams({
      access_token: tokenData.access_token,
      fields: 'id,name,access_token',
    })

    const pagesResponse = await fetch(`${GRAPH_API_BASE}/me/accounts?${pagesParams.toString()}`)
    const pagesData = (await pagesResponse.json()) as MetaPagesResponse

    if (pagesData.error) {
      throw new MetaPagesLookupError(pagesData.error.message ?? 'Unknown error')
    }

    const page = pagesData.data?.[0]
    if (!page) {
      throw new MetaNoPagesError()
    }

    return { pageId: page.id, pageName: page.name, pageAccessToken: page.access_token }
  }

  // Meta's webhook verification handshake (GET request, one-time per
  // subscription setup): echo hub.challenge back only if hub.verify_token
  // matches our own secret and hub.mode is 'subscribe'. Timing-safe
  // comparison for consistency with verifyWebhookSignature/parseSignedRequest
  // below, even though this is a one-time setup action rather than a
  // per-request check.
  verifyWebhookChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined): string | null {
    const verifyToken = requireEnv('META_WEBHOOK_VERIFY_TOKEN')

    if (mode !== 'subscribe' || !token || !challenge) {
      return null
    }

    const providedBuffer = Buffer.from(token, 'utf-8')
    const expectedBuffer = Buffer.from(verifyToken, 'utf-8')

    if (providedBuffer.length !== expectedBuffer.length) {
      return null
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer) ? challenge : null
  }

  // Deliberately mirrors razorpay-provider.ts's timingSafeEqual comparison
  // (a plain === here would be a timing side-channel on this endpoint's only
  // authenticity check). Meta's header format is "sha256=<hex>", unlike
  // Razorpay's bare hex -- the "sha256=" prefix must be stripped before
  // comparing. META_APP_SECRET is validated lazily here (not required for
  // the whole server to boot) since only this webhook path needs it.
  verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
    const secret = requireEnv('META_APP_SECRET')

    if (!signatureHeader?.startsWith('sha256=')) {
      return false
    }

    const providedHex = signatureHeader.slice('sha256='.length)
    const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

    const expectedBuffer = Buffer.from(expectedHex, 'hex')
    let providedBuffer: Buffer
    try {
      providedBuffer = Buffer.from(providedHex, 'hex')
    } catch {
      return false
    }

    if (expectedBuffer.length !== providedBuffer.length) {
      return false
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  }

  // Meta's deauthorization and data-deletion-request callbacks both POST a
  // single `signed_request` form field: base64url(HMAC-SHA256 signature) +
  // "." + base64url(JSON payload), signed with the app secret. Verifies the
  // signature and returns the decoded payload (contains at least user_id),
  // or null if the signature doesn't match.
  //
  // KNOWN LIMITATION: we only ever store a client's Page ID/token, never
  // their Meta user_id, so this payload's user_id can't be correlated back
  // to a specific ClientRecord to auto-disconnect. The callback still
  // verifies + logs it (satisfying Meta's platform requirement that the
  // endpoint exist and respond correctly) but does not itself disconnect
  // anything -- see TODOS.md if precise auto-disconnect becomes necessary.
  parseSignedRequest(signedRequest: string): Record<string, unknown> | null {
    const appSecret = requireEnv('META_APP_SECRET')
    const [encodedSignature, encodedPayload] = signedRequest.split('.')
    if (!encodedSignature || !encodedPayload) return null

    const providedSignature = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    const expectedSignature = crypto.createHmac('sha256', appSecret).update(encodedPayload).digest()

    if (providedSignature.length !== expectedSignature.length) return null
    if (!crypto.timingSafeEqual(providedSignature, expectedSignature)) return null

    try {
      const json = Buffer.from(encodedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
      return JSON.parse(json) as Record<string, unknown>
    } catch {
      return null
    }
  }

  // Granting OAuth permissions alone does NOT make Meta deliver leadgen
  // webhook events for this Page -- the app-level webhook (configured once
  // in the Meta App dashboard) only fires for Pages that have individually
  // opted this app into their updates via this call, using that Page's own
  // access token. Skipping this leaves a Page connected with no webhook
  // deliveries ever arriving, silently indistinguishable from "no ads yet."
  async subscribePageToWebhook(pageId: string, pageAccessToken: string): Promise<void> {
    const params = new URLSearchParams({
      subscribed_fields: 'leadgen',
      access_token: pageAccessToken,
    })

    const response = await fetch(`${GRAPH_API_BASE}/${pageId}/subscribed_apps?${params.toString()}`, {
      method: 'POST',
    })
    const data = (await response.json()) as { success?: boolean; error?: { message?: string } }

    if (!data.success) {
      throw new Error(`Failed to subscribe Page ${pageId} to leadgen webhook: ${data.error?.message ?? 'Unknown error'}`)
    }
  }

  // The webhook notification only carries a leadgen_id + page_id -- the
  // actual submitted answers require this separate Graph API call using
  // that Page's own access token.
  async fetchLeadFieldData(leadgenId: string, pageAccessToken: string): Promise<MetaFieldDatum[]> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      fields: 'field_data',
    })

    const response = await fetch(`${GRAPH_API_BASE}/${leadgenId}?${params.toString()}`)
    const data = (await response.json()) as MetaLeadgenResponse

    if (data.error) {
      throw new Error(`Meta leadgen fetch failed for ${leadgenId}: ${data.error.message ?? 'Unknown error'}`)
    }

    return data.field_data ?? []
  }
}

export const metaProvider = new MetaProvider()
