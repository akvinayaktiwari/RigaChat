import type { FormField } from '../types/index.js'

export interface CRMCredentials {
  provider: 'zoho'
  accessToken: string
  refreshToken: string
  tokenExpiry: string
  /**
   * The Zoho data centre the tokens belong to: where they are refreshed, and
   * the API host they are valid against. Absent on a connection made before
   * data centres were recorded, which the provider treats as India.
   */
  accountsServer?: string
  apiDomain?: string
  extra?: Record<string, string>
}

export interface CRMLead {
  firstName?: string
  lastName: string
  email?: string
  phone?: string
  company?: string
  leadSource: string
  description: string
  sourceUrl: string
  customFields?: Record<string, string>
}

export interface CRMSyncResult {
  success: boolean
  externalId?: string
  error?: string
  retryable?: boolean
}

export interface CRMProvider {
  getProviderName(): string
  validateCredentials(credentials: CRMCredentials): Promise<boolean>
  syncLead(lead: CRMLead, credentials: CRMCredentials): Promise<CRMSyncResult>
  refreshAccessToken(credentials: CRMCredentials): Promise<CRMCredentials>
  getOAuthUrl(state: string): string
  exchangeCodeForTokens(code: string, accountsServer?: string): Promise<CRMCredentials>
  mapLead(customFields: Record<string, string>, formFields: FormField[], sourceUrl: string): CRMLead
}
