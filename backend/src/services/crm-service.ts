import { zohoProvider } from '../providers/zoho-provider.js'
import type { CRMCredentials, CRMProvider } from '../lib/crm-provider.js'
import { getClientById, removeClientCRMConnection, updateClient } from '../repositories/client-repository.js'
import { getFormById } from '../repositories/form-repository.js'
import { updateFormLeadSyncStatus } from '../repositories/form-lead-repository.js'
import type { CRMConnection, FormLead } from '../types/index.js'

const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 1000
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

function getProvider(providerName: string): CRMProvider | null {
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
        await updateFormLeadSyncStatus(formLead.formId, formLead.leadId, {
          crmSynced: true,
          crmSyncedAt: new Date().toISOString(),
          crmExternalId: result.externalId,
          crmSyncAttempts: attempts,
        })

        if (credentialsRefreshed) {
          await updateClient(clientId, {
            crmConnection: {
              ...client.crmConnection,
              accessToken: credentials.accessToken,
              tokenExpiry: credentials.tokenExpiry,
            },
          })
        }
        return
      }

      lastError = result.error ?? 'Unknown error'
      if (!result.retryable) break

      if (attempts < MAX_RETRY_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempts)
      }
    }

    await updateFormLeadSyncStatus(formLead.formId, formLead.leadId, {
      crmSynced: false,
      crmSyncError: lastError,
      crmSyncAttempts: attempts,
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
