import { gupshupProvider } from '../providers/gupshup-provider.js'
import { decrypt, encrypt } from '../lib/kms.js'
import type { WhatsAppCredentials, WhatsAppProvider, WhatsAppSendResult } from '../lib/whatsapp-provider.js'
import {
  getClientById,
  getConnectedWhatsAppClients,
  removeClientWhatsAppConnection,
  updateClient,
} from '../repositories/client-repository.js'
import { getLeadsForClient as getChatLeadsForClient } from './lead-service.js'
import { getLeadsForClient as getFormLeadsForClient } from './form-lead-service.js'
import type { WhatsAppConnection } from '../types/index.js'

const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 1000
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

interface ConnectGupshupInput {
  apiKey: string
  appName: string
  sourceNumber: string
  notificationNumber: string
}

function getProvider(providerName: string): WhatsAppProvider | null {
  if (providerName === 'gupshup') return gupshupProvider
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendWithRetry(
  to: string,
  message: string,
  provider: WhatsAppProvider,
  credentials: WhatsAppCredentials
): Promise<WhatsAppSendResult> {
  let attempts = 0
  let lastResult: WhatsAppSendResult = { success: false, error: 'No send attempt made' }

  while (attempts < MAX_RETRY_ATTEMPTS) {
    attempts++
    lastResult = await provider.sendMessage(to, message, credentials)

    if (lastResult.success) return lastResult
    if (!lastResult.retryable) return lastResult

    if (attempts < MAX_RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempts)
    }
  }

  return lastResult
}

export async function connectGupshup(clientId: string, input: ConnectGupshupInput): Promise<void> {
  const apiKeyEncrypted = await encrypt(input.apiKey)

  await updateClient(clientId, {
    whatsappConnection: {
      provider: 'gupshup',
      connected: true,
      apiKeyEncrypted,
      appName: input.appName,
      sourceNumber: input.sourceNumber,
      notificationNumber: input.notificationNumber,
      connectedAt: new Date().toISOString(),
    },
  })
}

export async function disconnectWhatsApp(clientId: string): Promise<void> {
  await removeClientWhatsAppConnection(clientId)
}

export async function getWhatsAppStatus(clientId: string): Promise<Omit<WhatsAppConnection, 'apiKeyEncrypted'> | null> {
  const client = await getClientById(clientId)
  if (!client?.whatsappConnection) return null

  const { apiKeyEncrypted: _apiKeyEncrypted, ...status } = client.whatsappConnection
  return status
}

export async function sendLeadNotification(clientId: string, leadSummary: string): Promise<void> {
  try {
    const client = await getClientById(clientId)
    if (!client?.whatsappConnection?.connected) {
      console.log('WhatsApp notification skipped: not connected')
      return
    }

    const provider = getProvider(client.whatsappConnection.provider)
    if (!provider) {
      console.log(`WhatsApp notification skipped: unknown provider ${client.whatsappConnection.provider}`)
      return
    }

    const apiKey = await decrypt(client.whatsappConnection.apiKeyEncrypted)
    const credentials: WhatsAppCredentials = {
      apiKey,
      appName: client.whatsappConnection.appName,
      sourceNumber: client.whatsappConnection.sourceNumber,
    }

    console.log('WhatsApp notification sending to:', client.whatsappConnection.notificationNumber)

    const result = await sendWithRetry(
      client.whatsappConnection.notificationNumber,
      `New lead captured!\n\n${leadSummary}`,
      provider,
      credentials
    )

    console.log('WhatsApp notification result:', result)
  } catch (error) {
    console.error('WhatsApp lead notification failed:', error)
  }
}

export async function sendWeeklyReport(clientId: string): Promise<void> {
  const client = await getClientById(clientId)
  if (!client?.whatsappConnection?.connected) return

  const provider = getProvider(client.whatsappConnection.provider)
  if (!provider) return

  const since = Date.now() - WEEK_MS
  const [chatLeads, formLeads] = await Promise.all([
    getChatLeadsForClient(clientId),
    getFormLeadsForClient(clientId),
  ])

  const chatLeadCount = chatLeads.filter((lead) => new Date(lead.createdAt).getTime() >= since).length
  const formLeadCount = formLeads.filter((lead) => new Date(lead.createdAt).getTime() >= since).length
  const totalCount = chatLeadCount + formLeadCount

  const message =
    `Your weekly BeepBoop report\n\n` +
    `New leads this week: ${totalCount}\n` +
    `- Chat widget: ${chatLeadCount}\n` +
    `- Forms: ${formLeadCount}`

  const apiKey = await decrypt(client.whatsappConnection.apiKeyEncrypted)
  const credentials: WhatsAppCredentials = {
    apiKey,
    appName: client.whatsappConnection.appName,
    sourceNumber: client.whatsappConnection.sourceNumber,
  }

  await sendWithRetry(client.whatsappConnection.notificationNumber, message, provider, credentials)
}

export async function sendWeeklyReportsForAllClients(): Promise<void> {
  const clients = await getConnectedWhatsAppClients()

  for (const client of clients) {
    try {
      await sendWeeklyReport(client.clientId)
    } catch (error) {
      console.error(`Weekly WhatsApp report failed for client ${client.clientId}:`, error)
    }
  }
}
