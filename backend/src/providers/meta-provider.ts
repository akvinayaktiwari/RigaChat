import crypto from 'node:crypto'
import {
  MetaMisconfiguredError,
  MetaNoPagesError,
  MetaPagesLookupError,
  MetaTokenExchangeError,
} from '../lib/meta-connect-errors.js'
import type { MetaFormQuestion } from '../types/index.js'
// The mapping module owns this shape -- it is the input to mapMetaFieldData,
// and duplicating it here is how the two drift. Re-exported so the existing
// importers of it from this file keep working.
import type { MetaFieldDatum } from '../lib/meta-field-mapping.js'

export type { MetaFieldDatum }

const META_OAUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth'
const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0'

// pages_show_list: list the Pages the client manages.
// pages_manage_metadata: required to read/manage a Page's webhook subscriptions.
// pages_read_engagement + leads_retrieval: required to read Lead Ads field_data.
// pages_manage_ads was briefly listed here on the strength of Meta's Lead Ads
// docs ("your submission must include leads_retrieval and pages_manage_ads").
// This app's own App Review submission does not offer that permission at all,
// and requesting a permission the app cannot request appears to be why the
// consent screen answered "Facebook Login is currently unavailable for this
// app, since we are updating additional details" rather than any error naming
// the permission. The dashboard is the authority here, not the docs.
// leads_retrieval requires Meta App Review before this scope works for any
// Page outside the app's own test Pages/roles -- see design doc Dependencies.
// pages_manage_ads is what Meta gates every leadgen FORM object behind -- both
// /{page_id}/leadgen_forms and /{form_id}?fields=questions. Without it the
// field mapper cannot read a form's declared question types and falls back to
// its keyword and value-shape layers (lib/meta-field-mapping.ts), which is a
// silent quality loss rather than a failure. Confirmed 2026-08-26 on Page
// 1264267750092807: a valid token with the four scopes below answers
// "(#200) Requires pages_manage_ads permission".
//
// It is deliberately NOT in the list below, and adding it here would not grant
// it. Two reasons, in order of importance:
//
//   1. This app uses Facebook Login for Business. META_LOGIN_CONFIG_ID is set
//      in production, so the consent screen is driven by the DASHBOARD
//      configuration and this string is never sent -- the real lever is the
//      config plus an App Review round, not this array.
//   2. On the fallback path where it IS sent, asking for a permission the app's
//      review submission does not offer breaks the consent screen outright,
//      with Meta reporting "Facebook Login is currently unavailable for this
//      app" and naming no cause. That failure is already on record here.
//
// So the order is: add it to the dashboard configuration, get it through App
// Review, THEN add it here and have every connected Page reconnect -- an
// issued token does not gain permissions retroactively.
const META_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_manage_metadata',
  'pages_read_engagement',
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
  // Graph returns an absolute URL here, already carrying the access token and
  // the cursor. Following it verbatim is Meta's documented pagination contract;
  // rebuilding it from `after` by hand is how the token gets dropped.
  paging?: { next?: string }
}

// /me/accounts returns 25 per page by default and we never asked for more, so an
// agency admin'ing 40 Pages was shown 25 and silently lost 15. 100 is Graph's
// practical maximum for this edge.
const PAGES_FETCH_LIMIT = 100

// Two independent stops so a pathological or hostile `paging.next` chain cannot
// spin the Lambda until it times out. Neither should ever fire: 10 hops at 100
// per hop is 1000 Pages, and no real admin has 500.
const MAX_PAGE_HOPS = 10
const MAX_PAGES_COLLECTED = 500

export interface MetaPageCredentials {
  pageId: string
  pageName: string
  pageAccessToken: string
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

  // Step 1 of three: the authorization code buys a SHORT-LIVED user token
  // (~1 hour). On its own that is not enough to store -- see the long-lived
  // exchange below for why.
  private async exchangeCodeForUserToken(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    code: string
  ): Promise<string> {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    })

    const response = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`)
    const data = (await response.json()) as MetaTokenResponse

    if (!data.access_token) {
      throw new MetaTokenExchangeError(data.error?.message ?? 'Unknown error')
    }

    return data.access_token
  }

  // Step 2 of three, and the reason this class has three steps instead of two:
  // a Page token inherits the lifetime of the user token it was minted from. Mint
  // it from the short-lived token and it dies in about an hour; mint it from a
  // long-lived one and it does not expire at all. Since we STORE the Page token
  // and reuse it for every future lead fetch, only the second is viable.
  //
  // Throwing rather than falling back to the short-lived token is deliberate: a
  // fallback would produce a connection that looks healthy, syncs leads for an
  // hour, then fails every Graph fetch with an expired token -- which from the
  // dashboard is indistinguishable from Meta having broken something.
  private async exchangeForLongLivedUserToken(
    clientId: string,
    clientSecret: string,
    shortLivedToken: string
  ): Promise<string> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: shortLivedToken,
    })

    const response = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`)
    const data = (await response.json()) as MetaTokenResponse

    if (!data.access_token) {
      throw new MetaTokenExchangeError(`Long-lived token exchange failed: ${data.error?.message ?? 'Unknown error'}`)
    }

    return data.access_token
  }

  // Steps 1+2 of three, stopping at the long-lived USER token instead of
  // pushing on to a single Page.
  //
  // exchangeCodeForPageCredentials below does the same two exchanges and then
  // throws the user token away, which is why adding a Page later needed a whole
  // new OAuth round trip. Keeping it is what makes Page management an ordinary
  // authenticated call (decision D8).
  async exchangeCodeForLongLivedUserToken(code: string): Promise<string> {
    const clientId = requireEnv('META_APP_ID')
    const clientSecret = requireEnv('META_APP_SECRET')
    const redirectUri = requireEnv('META_REDIRECT_URI')

    const shortLivedToken = await this.exchangeCodeForUserToken(clientId, clientSecret, redirectUri, code)
    return this.exchangeForLongLivedUserToken(clientId, clientSecret, shortLivedToken)
  }

  // Every Page the user administers, following Graph's cursor to the end.
  //
  // The caller decides what to do with them; this function's only job is to
  // return ALL of them. listSelectablePages and connectMetaPages are the
  // callers. exchangeCodeForPageCredentials below still takes data[0] -- that
  // is the original bug, and it survives only as the rollback path now that
  // nothing routes to it.
  //
  // Errors propagate rather than returning a partial list: a caller that asked
  // for "all Pages" and silently got some of them would reintroduce exactly the
  // silent-truncation failure this exists to remove. The two safety stops are
  // the deliberate exception, and they log.
  async fetchAllManageablePages(userToken: string): Promise<MetaPageCredentials[]> {
    const params = new URLSearchParams({
      access_token: userToken,
      fields: 'id,name,access_token',
      limit: String(PAGES_FETCH_LIMIT),
    })

    let nextUrl: string | undefined = `${GRAPH_API_BASE}/me/accounts?${params.toString()}`
    const pages: MetaPageCredentials[] = []
    let hops = 0

    while (nextUrl) {
      if (hops >= MAX_PAGE_HOPS) {
        console.warn(
          `[meta] /me/accounts pagination stopped at ${MAX_PAGE_HOPS} hops with ${pages.length} Pages collected; ` +
            `returning a partial list. If this is a real account, raise MAX_PAGE_HOPS.`
        )
        break
      }

      const response = await fetch(nextUrl)
      const body = (await response.json()) as MetaPagesResponse
      hops += 1

      if (body.error) {
        throw new MetaPagesLookupError(body.error.message ?? 'Unknown error')
      }

      for (const entry of body.data ?? []) {
        pages.push({ pageId: entry.id, pageName: entry.name, pageAccessToken: entry.access_token })

        if (pages.length >= MAX_PAGES_COLLECTED) {
          console.warn(
            `[meta] /me/accounts pagination stopped at ${MAX_PAGES_COLLECTED} Pages after ${hops} hops; ` +
              `returning a partial list.`
          )
          return pages
        }
      }

      nextUrl = body.paging?.next
    }

    return pages
  }

  // Step 3 of three: a Page's Lead Ads data is only readable with a PAGE access
  // token, obtained from GET /me/accounts using the (now long-lived) user token.
  // MVP connects whichever Page appears first in that list (see design doc Open
  // Questions / Premise 4 -- one Page per client for now).
  async exchangeCodeForPageCredentials(code: string): Promise<MetaPageCredentials> {
    const clientId = requireEnv('META_APP_ID')
    const clientSecret = requireEnv('META_APP_SECRET')
    const redirectUri = requireEnv('META_REDIRECT_URI')

    const shortLivedToken = await this.exchangeCodeForUserToken(clientId, clientSecret, redirectUri, code)
    const longLivedToken = await this.exchangeForLongLivedUserToken(clientId, clientSecret, shortLivedToken)

    const pagesParams = new URLSearchParams({
      access_token: longLivedToken,
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
  // The mirror of subscribePageToWebhook. Disconnecting a Page without this
  // leaves Meta still delivering its leadgen events to our shared webhook,
  // where they land as "no client mapped for page" and are marked processed --
  // i.e. silently discarded forever. Unsubscribing is what makes a disconnect
  // actually stop the traffic rather than just stop reading it.
  //
  // Deliberately best-effort at the call site: a Page whose token has already
  // been revoked cannot be unsubscribed, and that must not block the client
  // from removing it from their account.
  async unsubscribePageFromWebhook(pageId: string, pageAccessToken: string): Promise<void> {
    const params = new URLSearchParams({ access_token: pageAccessToken })

    const response = await fetch(`${GRAPH_API_BASE}/${pageId}/subscribed_apps?${params.toString()}`, {
      method: 'DELETE',
    })
    const data = (await response.json()) as { success?: boolean; error?: { message?: string } }

    if (!data.success) {
      throw new Error(
        `Failed to unsubscribe Page ${pageId} from leadgen webhook: ${data.error?.message ?? 'Unknown error'}`
      )
    }
  }

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

  // Every lead form on a Page, WITH its questions, in one call.
  //
  // A form is created in Ads Manager when the client builds the ad, so this
  // returns the schemas BEFORE a single lead has arrived -- verified against
  // the live API on 2026-08-26 against a Page with zero real leads. That is
  // what makes a connect-time prewarm possible, and it is also the only way to
  // show a client their own questions in a mapping UI.
  //
  // Requires pages_manage_ads, which Meta gates every leadgen FORM object
  // behind. Without it this answers "(#200) Requires pages_manage_ads
  // permission" and the caller degrades to fetching nothing -- see the scope
  // list at the top of this file.
  //
  // Returns [] on any failure, for the same reason fetchFormQuestions does:
  // this must never be the thing that fails a Page connection.
  async fetchPageLeadgenForms(
    pageId: string,
    pageAccessToken: string
  ): Promise<{ formId: string; questions: MetaFormQuestion[] }[]> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      fields: 'id,questions{key,label,type}',
      limit: '100',
    })

    try {
      const response = await fetch(`${GRAPH_API_BASE}/${pageId}/leadgen_forms?${params.toString()}`)
      const data = (await response.json()) as {
        data?: { id?: string; questions?: MetaFormQuestion[] }[]
        error?: { message?: string }
      }

      if (data.error) {
        console.error(`Meta leadgen form list failed for page ${pageId}: ${data.error.message ?? 'Unknown error'}`)
        return []
      }

      // Deliberately NOT paginated. A prewarm is best-effort and a Page with
      // more than 100 forms would still get its 100 most recent; the per-lead
      // fetch covers anything missed.
      return (data.data ?? [])
        .filter((form): form is { id: string; questions?: MetaFormQuestion[] } => Boolean(form.id))
        .map((form) => ({ formId: form.id, questions: form.questions ?? [] }))
    } catch (error) {
      console.error(`Meta leadgen form list threw for page ${pageId}:`, error instanceof Error ? error.message : error)
      return []
    }
  }

  // The form's OWN description of its questions, which is what makes mapping a
  // Meta lead a lookup instead of a guess: every question carries a declared
  // type (EMAIL, PHONE, FULL_NAME) and the human label the client typed in Ads
  // Manager. The webhook payload carries neither -- only a slugified key.
  //
  // Fetched per FORM, not per lead, and cached: a Meta lead form cannot be
  // edited after it has run, so its schema is effectively immutable (editing
  // one in Ads Manager produces a copy, which is why real pages accumulate
  // forms named '...-copy').
  //
  // Returns [] rather than throwing on any failure. A schema we cannot read
  // must degrade the mapping to the keyword and value-shape heuristics, never
  // fail the lead -- this runs on the lead-capture path.
  async fetchFormQuestions(formId: string, pageAccessToken: string): Promise<MetaFormQuestion[]> {
    const params = new URLSearchParams({
      access_token: pageAccessToken,
      fields: 'questions{key,label,type}',
    })

    try {
      const response = await fetch(`${GRAPH_API_BASE}/${formId}?${params.toString()}`)
      const data = (await response.json()) as {
        questions?: MetaFormQuestion[]
        error?: { message?: string }
      }

      if (data.error) {
        console.error(`Meta form schema fetch failed for ${formId}: ${data.error.message ?? 'Unknown error'}`)
        return []
      }

      return data.questions ?? []
    } catch (error) {
      console.error(`Meta form schema fetch threw for ${formId}:`, error instanceof Error ? error.message : error)
      return []
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
