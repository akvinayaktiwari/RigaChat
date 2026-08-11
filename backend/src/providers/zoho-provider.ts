import type { CRMCredentials, CRMLead, CRMProvider, CRMSyncResult } from '../lib/crm-provider.js'
import type { FormField } from '../types/index.js'

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in'
const ZOHO_API_URL = 'https://www.zohoapis.in/crm/v2'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

const ZOHO_CLIENT_ID = requireEnv('ZOHO_CLIENT_ID')
const ZOHO_CLIENT_SECRET = requireEnv('ZOHO_CLIENT_SECRET')
const ZOHO_REDIRECT_URI = requireEnv('ZOHO_REDIRECT_URI')

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

interface ZohoTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface ZohoLeadsResponse {
  code?: string
  data?: Array<{
    code: string
    status: string
    message?: string
    details?: { id?: string }
  }>
}

const PERMANENT_FAILURE_CODES = new Set(['INVALID_DATA', 'MANDATORY_NOT_FOUND', 'DUPLICATE_DATA'])

// Label fallbacks for mapLead. A form field's declared `type` is the primary
// signal, but the form builder happily saves an email field as plain text, and
// Meta's synthetic fields carry no type at all -- without these the value is
// silently dumped into Description instead of its own Zoho field.
const EMAIL_LABEL = /e-?mail/i
const PHONE_LABEL = /phone|mobile|whatsapp|contact\s*(no\b|number)/i
const COMPANY_LABEL = /company|organi[sz]ation|business|firm|employer/i
const NAME_LABEL = /name/i

// Zoho's Website field takes a real public URL and rejects anything else, so a
// dev submission from localhost or a file:// page has to keep falling back to
// Description. Returns null when sourceUrl is not something Zoho will accept.
const ZOHO_WEBSITE_MAX_LENGTH = 255

export function toPublicWebsiteUrl(sourceUrl: string): string | null {
  if (sourceUrl.length > ZOHO_WEBSITE_MAX_LENGTH) return null

  let parsed: URL
  try {
    parsed = new URL(sourceUrl)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const host = parsed.hostname.toLowerCase()
  // A hostname with no dot cannot be public (localhost, an intranet name), and
  // .local/loopback addresses are reachable only from the machine that submitted.
  if (!host.includes('.') || host.endsWith('.local')) return null
  if (host === '127.0.0.1' || host === '0.0.0.0' || host.startsWith('192.168.')) return null

  return sourceUrl
}

function isTokenExpiringSoon(tokenExpiry: string): boolean {
  const expiry = new Date(tokenExpiry)
  return new Date() >= new Date(expiry.getTime() - TOKEN_EXPIRY_BUFFER_MS)
}

export class ZohoProvider implements CRMProvider {
  getProviderName(): string {
    return 'zoho'
  }

  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: ZOHO_CLIENT_ID,
      response_type: 'code',
      scope: 'ZohoCRM.modules.leads.CREATE,ZohoCRM.modules.leads.UPDATE',
      redirect_uri: ZOHO_REDIRECT_URI,
      access_type: 'offline',
      state,
    })
    return `${ZOHO_ACCOUNTS_URL}/oauth/v2/auth?${params.toString()}`
  }

  async exchangeCodeForTokens(code: string): Promise<CRMCredentials> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      redirect_uri: ZOHO_REDIRECT_URI,
      code,
    })

    const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const data = (await response.json()) as ZohoTokenResponse

    if (!data.access_token || !data.refresh_token || !data.expires_in) {
      throw new Error(
        `Zoho token exchange failed: ${data.error_description ?? data.error ?? 'Unknown error'}`
      )
    }

    return {
      provider: 'zoho',
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    }
  }

  async refreshAccessToken(credentials: CRMCredentials): Promise<CRMCredentials> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: credentials.refreshToken,
    })

    const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    const data = (await response.json()) as ZohoTokenResponse

    if (!data.access_token || !data.expires_in) {
      throw new Error(
        `Zoho token refresh failed: ${data.error_description ?? data.error ?? 'Unknown error'}`
      )
    }

    return {
      ...credentials,
      accessToken: data.access_token,
      tokenExpiry: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    }
  }

  async validateCredentials(credentials: CRMCredentials): Promise<boolean> {
    try {
      const response = await fetch(`${ZOHO_API_URL}/users?type=CurrentUser`, {
        headers: { Authorization: `Zoho-oauthtoken ${credentials.accessToken}` },
      })
      return response.status === 200
    } catch {
      return false
    }
  }

  async syncLead(lead: CRMLead, credentials: CRMCredentials): Promise<CRMSyncResult> {
    let activeCredentials = credentials

    if (isTokenExpiringSoon(activeCredentials.tokenExpiry)) {
      try {
        activeCredentials = await this.refreshAccessToken(activeCredentials)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          retryable: true,
        }
      }
    }

    // sourceUrl is the page the form was submitted from. When it is a real
    // public URL it belongs in Zoho's own Website field, where it stays
    // clickable and filterable; otherwise it falls back into Description so the
    // attribution is never lost outright.
    const website = toPublicWebsiteUrl(lead.sourceUrl)

    const zohoLeadData = {
      Last_Name: lead.lastName,
      First_Name: lead.firstName ?? '',
      Email: lead.email ?? '',
      Phone: lead.phone ?? '',
      Company: lead.company ?? 'Not specified',
      Lead_Source: lead.leadSource,
      ...(website ? { Website: website } : {}),
      Description: website ? lead.description : `${lead.description}\n\nSource: ${lead.sourceUrl}`,
    }

    const postLead = (accessToken: string) =>
      fetch(`${ZOHO_API_URL}/Leads`, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: [zohoLeadData] }),
      })

    try {
      let response = await postLead(activeCredentials.accessToken)

      if (response.status === 401) {
        try {
          activeCredentials = await this.refreshAccessToken(activeCredentials)
          response = await postLead(activeCredentials.accessToken)
        } catch {
          return { success: false, error: 'Authentication failed', retryable: false }
        }

        if (response.status === 401) {
          return { success: false, error: 'Authentication failed', retryable: false }
        }
      }

      const body = (await response.json()) as ZohoLeadsResponse
      const result = body.data?.[0]

      if (response.ok && result?.details?.id) {
        return { success: true, externalId: result.details.id }
      }

      const zohoCode = result?.code || body.code || ''

      if (PERMANENT_FAILURE_CODES.has(zohoCode)) {
        return {
          success: false,
          error: `Zoho validation error: ${zohoCode}`,
          retryable: false,
        }
      }

      return {
        success: false,
        error: result?.message ?? `Zoho API returned status ${response.status}`,
        retryable: true,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: true,
      }
    }
  }

  mapLead(customFields: Record<string, string>, formFields: FormField[], sourceUrl: string): CRMLead {
    let lastName = 'Unknown'
    let email = ''
    let phone = ''
    let company = ''
    const otherFields: string[] = []

    // First match wins for each Zoho field; every later candidate (a second
    // email, a secondary phone) falls through to Description rather than
    // overwriting what was already claimed.
    for (const field of formFields) {
      const value = customFields[field.fieldId]
      if (!value) continue

      if (!email && (field.type === 'email' || EMAIL_LABEL.test(field.label))) {
        email = value
      } else if (!phone && (field.type === 'phone' || PHONE_LABEL.test(field.label))) {
        phone = value
      } else if (!company && COMPANY_LABEL.test(field.label)) {
        // Tested before the name branch on purpose: a label like
        // "Company/Project Name" matches NAME_LABEL too, and checking name
        // first would file the company as the lead's name.
        company = value
      } else if (lastName === 'Unknown' && field.type === 'text' && NAME_LABEL.test(field.label)) {
        lastName = value
      } else {
        otherFields.push(`${field.label}: ${value}`)
      }
    }

    return {
      lastName,
      email: email || undefined,
      phone: phone || undefined,
      company: company || undefined,
      leadSource: 'VyostraAI',
      description: otherFields.length > 0 ? otherFields.join('\n') : 'Lead captured via VyostraAI form',
      sourceUrl,
    }
  }
}

export const zohoProvider = new ZohoProvider()
