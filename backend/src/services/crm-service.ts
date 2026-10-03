import { zohoProvider } from '../providers/zoho-provider.js'
import type { CRMCredentials, CRMLead, CRMProvider } from '../lib/crm-provider.js'
import { decrypt, encrypt } from '../lib/kms.js'
import { getClientById, removeClientCRMConnection, updateClient } from '../repositories/client-repository.js'
import { getFormById } from '../repositories/form-repository.js'
import { updateFormLeadSyncStatus } from '../repositories/form-lead-repository.js'
import type { ClientRecord, CRMConnection, CRMConnectionStatus, FormLead } from '../types/index.js'

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The stored tokens, in the clear. Encrypted fields win; the plaintext pair is
// the pre-encryption shape (see CRMConnection) and is only ever read.
async function credentialsFrom(connection: CRMConnection): Promise<CRMCredentials> {
  const [accessToken, refreshToken] = await Promise.all([
    connection.accessTokenEncrypted ? decrypt(connection.accessTokenEncrypted) : connection.accessToken,
    connection.refreshTokenEncrypted ? decrypt(connection.refreshTokenEncrypted) : connection.refreshToken,
  ])
  if (!accessToken || !refreshToken) {
    throw new Error('Zoho connection has no stored tokens; reconnect Zoho CRM')
  }
  return { provider: connection.provider, accessToken, refreshToken, tokenExpiry: connection.tokenExpiry }
}

// The connection as it is stored: encrypted tokens only. Built whole because
// updateClient SETs crmConnection as one map, so the write that adds the
// ciphertext also drops a legacy row's plaintext pair.
async function encryptedConnection(
  connection: Pick<CRMConnection, 'provider' | 'connected' | 'connectedAt'>,
  credentials: CRMCredentials
): Promise<CRMConnection> {
  const [accessTokenEncrypted, refreshTokenEncrypted] = await Promise.all([
    encrypt(credentials.accessToken),
    encrypt(credentials.refreshToken),
  ])
  return {
    provider: connection.provider,
    connected: connection.connected,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenExpiry: credentials.tokenExpiry,
    connectedAt: connection.connectedAt,
  }
}

interface ReadyCredentials {
  credentials: CRMCredentials
  refreshed: boolean
}

async function readyCredentials(connection: CRMConnection, provider: CRMProvider): Promise<ReadyCredentials> {
  const credentials = await credentialsFrom(connection)
  if (!isTokenExpiringSoon(credentials.tokenExpiry)) return { credentials, refreshed: false }
  return { credentials: await provider.refreshAccessToken(credentials), refreshed: true }
}

async function pushWithRetry(provider: CRMProvider, crmLead: CRMLead, credentials: CRMCredentials): Promise<CRMSyncOutcome> {
  let attempts = 0
  let lastError = ''

  while (attempts < MAX_RETRY_ATTEMPTS) {
    attempts++
    const result = await provider.syncLead(crmLead, credentials)
    if (result.success) return { success: true, externalId: result.externalId, attempts }

    lastError = result.error ?? 'Unknown error'
    if (!result.retryable) break
    if (attempts < MAX_RETRY_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempts)
  }

  return { success: false, error: lastError, attempts }
}

// A refreshed token is kept only after a successful sync, as before. Failing to
// keep it costs one more refresh next time, not the lead, which Zoho has
// already accepted -- so it is logged rather than thrown into the caller's
// failure path, where it would record a synced lead as failed.
async function keepRefreshedToken(client: ClientRecord, connection: CRMConnection, credentials: CRMCredentials): Promise<void> {
  try {
    await updateClient(client.clientId, { crmConnection: await encryptedConnection(connection, credentials) })
  } catch (error) {
    console.error(`Could not store the refreshed Zoho token for client ${client.clientId}:`, error)
  }
}

// Shared by every lead source's CRM sync (currently FormLead and MetaLead).
// Callers own persisting the outcome to their own lead record; this owns the
// CRM push, including reading and renewing the stored tokens.
//
// A token that cannot be decrypted or renewed is returned as a failed sync,
// never thrown. Thrown, it skipped the Meta path's status write entirely, so a
// client whose Zoho access had lapsed saw no failure on any Meta lead.
export async function syncLeadToCRMWithRetry(client: ClientRecord, crmLead: CRMLead): Promise<CRMSyncOutcome> {
  const connection = client.crmConnection
  if (!connection?.connected) {
    return { success: false, attempts: 0, error: 'CRM not connected' }
  }

  const provider = getProvider(connection.provider)
  if (!provider) {
    return { success: false, attempts: 0, error: `Unknown CRM provider ${connection.provider}` }
  }

  let ready: ReadyCredentials
  try {
    ready = await readyCredentials(connection, provider)
  } catch (error) {
    return { success: false, attempts: 0, error: errorMessage(error) }
  }

  const outcome = await pushWithRetry(provider, crmLead, ready.credentials)
  if (outcome.success && ready.refreshed) await keepRefreshedToken(client, connection, ready.credentials)
  return outcome
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
  const connection = { provider: 'zoho' as const, connected: true, connectedAt: new Date().toISOString() }
  await updateClient(clientId, { crmConnection: await encryptedConnection(connection, credentials) })
}

export async function disconnectCRM(clientId: string): Promise<void> {
  await removeClientCRMConnection(clientId)
}

export async function getCRMStatus(clientId: string): Promise<CRMConnectionStatus | null> {
  const client = await getClientById(clientId)
  const connection = client?.crmConnection
  if (!connection) return null
  return {
    provider: connection.provider,
    connected: connection.connected,
    tokenExpiry: connection.tokenExpiry,
    connectedAt: connection.connectedAt,
  }
}

export type ZohoTokenMigration = 'encrypted' | 'already-encrypted' | 'no-connection' | 'no-tokens'

function isFullyEncrypted(connection: CRMConnection): boolean {
  const hasCiphertext = Boolean(connection.accessTokenEncrypted && connection.refreshTokenEncrypted)
  return hasCiphertext && !connection.accessToken && !connection.refreshToken
}

// One client's step in scripts/encrypt-zoho-tokens.ts: rewrite a plaintext
// connection encrypted. Idempotent, so the script can be rerun safely.
export async function encryptLegacyZohoTokens(client: ClientRecord, dryRun: boolean): Promise<ZohoTokenMigration> {
  const connection = client.crmConnection
  if (!connection) return 'no-connection'
  if (isFullyEncrypted(connection)) return 'already-encrypted'

  let credentials: CRMCredentials
  try {
    credentials = await credentialsFrom(connection)
  } catch (error) {
    console.warn(`  SKIP ${client.clientId}: ${errorMessage(error)}`)
    return 'no-tokens'
  }

  if (!dryRun) await updateClient(client.clientId, { crmConnection: await encryptedConnection(connection, credentials) })
  return 'encrypted'
}
