import { zohoProvider } from '../providers/zoho-provider.js'
import type { CRMCredentials, CRMLead, CRMProvider } from '../lib/crm-provider.js'
import { getClientById, removeClientCRMConnection, updateClient } from '../repositories/client-repository.js'
import { getFormById } from '../repositories/form-repository.js'
import { updateFormLeadSyncStatus } from '../repositories/form-lead-repository.js'
import type { ClientRecord, CRMConnection, FormLead } from '../types/index.js'

const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 1000
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

// Exported so other lead sources (meta-lead-service.ts) can resolve the
// client's connected CRM provider to build their own CRMLead shape before
// calling syncLeadToCRMWithRetry below -- not just FormLead's own call site.
export function getProvider(providerName: string): CRMProvider | null {
  if (providerName === 'zoho') return zohoProvider
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTokenExpiringSoon(tokenExpiry: string): boolean {
  const expiry = new Date(tokenExpiry)
  return new Date() >= new Date(expiry.getTime() - TOKEN_EXPIRY_BUFFER_MS)
}

export interface CRMSyncOutcome {
  success: boolean
  externalId?: string
  error?: string
  attempts: number
}

// Shared by every lead source's CRM sync (currently FormLead and MetaLead).
// Extracted out of what used to be syncFormLeadToCRM's own inline loop --
// same retry/backoff/credential-refresh behavior, byte-for-byte, just no
// longer duplicated per source. Callers own connection/provider-resolution
// checks and persisting the outcome to their own lead record; this function
// only owns the CRM push itself.
//
// Preserves the original's exact refresh-persistence quirk: a refreshed
// token is only written back to the client record on a SUCCESSFUL sync.
// On failure, the refreshed token is discarded and re-refreshed next time --
// a known minor inefficiency in the pre-existing FormLead behavior, kept
// as-is rather than silently changed while extracting this helper.
export async function syncLeadToCRMWithRetry(client: ClientRecord, crmLead: CRMLead): Promise<CRMSyncOutcome> {
  if (!client.crmConnection?.connected) {
    return { success: false, attempts: 0, error: 'CRM not connected' }
  }

  const provider = getProvider(client.crmConnection.provider)
  if (!provider) {
    return { success: false, attempts: 0, error: `Unknown CRM provider ${client.crmConnection.provider}` }
  }

  let credentials: CRMCredentials = {
    provider: client.crmConnection.provider,
    accessToken: client.crmConnection.accessToken,
    refreshToken: client.crmConnection.refreshToken,
    tokenExpiry: client.crmConnection.tokenExpiry,
  }

  let credentialsRefreshed = false
  if (isTokenExpiringSoon(credentials.tokenExpiry)) {
    credentials = await provider.refreshAccessToken(credentials)
    credentialsRefreshed = true
  }

  let attempts = 0
  let lastError = ''

  while (attempts < MAX_RETRY_ATTEMPTS) {
    attempts++
    const result = await provider.syncLead(crmLead, credentials)

    if (result.success) {
      if (credentialsRefreshed && client.crmConnection) {
        await updateClient(client.clientId, {
          crmConnection: {
            ...client.crmConnection,
            accessToken: credentials.accessToken,
            tokenExpiry: credentials.tokenExpiry,
          },
        })
      }
      return { success: true, externalId: result.externalId, attempts }
    }

    lastError = result.error ?? 'Unknown error'
    if (!result.retryable) break

    if (attempts < MAX_RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempts)
    }
  }

  return { success: false, error: lastError, attempts }
}

export async function syncFormLeadToCRM(formLead: FormLead, formId: string, clientId: string): Promise<void> {
  try {
    const client = await getClientById(clientId)
    if (!client?.crmConnection?.connected) return

    const form = await getFormById(formId, clientId)
    if (!form) return

    const provider = getProvider(client.crmConnection.provider)
    if (!provider) return

    const fields: Record<string, string> =
      typeof formLead.customFields === 'string' ? JSON.parse(formLead.customFields) : formLead.customFields

    const crmLead = provider.mapLead(fields, form.fields, formLead.sourceUrl)
    const outcome = await syncLeadToCRMWithRetry(client, crmLead)

    if (outcome.success) {
      await updateFormLeadSyncStatus(formLead.formId, formLead.leadId, {
        crmSynced: true,
        crmSyncedAt: new Date().toISOString(),
        crmExternalId: outcome.externalId,
        crmSyncAttempts: outcome.attempts,
      })
      return
    }

    await updateFormLeadSyncStatus(formLead.formId, formLead.leadId, {
      crmSynced: false,
      crmSyncError: outcome.error,
      crmSyncAttempts: outcome.attempts,
    })
  } catch (error) {
    console.error('CRM sync failed:', error)
    await updateFormLeadSyncStatus(formLead.formId, formLead.leadId, {
      crmSynced: false,
      crmSyncError: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined)
  }
}

export async function connectZohoCRM(clientId: string, code: string): Promise<void> {
  const credentials = await zohoProvider.exchangeCodeForTokens(code)

  await updateClient(clientId, {
    crmConnection: {
      provider: 'zoho',
      connected: true,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
      tokenExpiry: credentials.tokenExpiry,
      connectedAt: new Date().toISOString(),
    },
  })
}

export async function disconnectCRM(clientId: string): Promise<void> {
  await removeClientCRMConnection(clientId)
}

export async function getCRMStatus(clientId: string): Promise<CRMConnection | null> {
  const client = await getClientById(clientId)
  return client?.crmConnection ?? null
}
