import { gupshupProvider } from '../providers/gupshup-provider.js'
import { metaWhatsAppProvider } from '../providers/meta-whatsapp-provider.js'
import { decrypt, encrypt } from '../lib/kms.js'
import type { WhatsAppCredentials, WhatsAppProvider, WhatsAppSendResult } from '../lib/whatsapp-provider.js'
import {
  clearActiveWhatsappProvider,
  getClientById,
  getConnectedWhatsAppClients,
  removeClientMetaDirectWhatsAppConnection,
  removeClientWhatsAppConnection,
  updateClient,
} from '../repositories/client-repository.js'
import { getLeadsForClient as getChatLeadsForClient } from './lead-service.js'
import { getLeadsForClient as getFormLeadsForClient } from './form-lead-service.js'
import type { ClientRecord, MetaDirectWhatsAppConnection, WhatsAppConnection } from '../types/index.js'

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
  if (providerName === 'meta_direct') return metaWhatsAppProvider
  return null
}

interface ActiveWhatsAppSender {
  provider: WhatsAppProvider
  credentials: WhatsAppCredentials
  notificationNumber: string
}

// The single place that resolves "which provider is active for this
// client" - a client can have both Gupshup and Meta Direct connected, but
// only one is ever active (client.activeWhatsappProvider). Clients that
// connected Gupshup before this field existed have it unset; treating unset
// + a connected Gupshup connection as active 'gupshup' is a deliberate
// fallback (not just an oversight - see design doc Premise 8) so a missed or
// partial backfill run can't silently stop existing notifications.
function resolveActiveProvider(client: ClientRecord): 'gupshup' | 'meta_direct' | null {
  return client.activeWhatsappProvider ?? (client.whatsappConnection?.connected ? 'gupshup' : null)
}

async function getActiveProviderAndCredentials(client: ClientRecord): Promise<ActiveWhatsAppSender | null> {
  const active = resolveActiveProvider(client)

  if (active === 'gupshup' && client.whatsappConnection?.connected) {
    const provider = getProvider('gupshup')
    if (!provider) return null

    const apiKey = await decrypt(client.whatsappConnection.apiKeyEncrypted)
    return {
      provider,
      credentials: {
        provider: 'gupshup',
        apiKey,
        appName: client.whatsappConnection.appName,
        sourceNumber: client.whatsappConnection.sourceNumber,
      },
      notificationNumber: client.whatsappConnection.notificationNumber,
    }
  }

  if (active === 'meta_direct' && client.metaDirectWhatsAppConnection?.connected) {
    const provider = getProvider('meta_direct')
    if (!provider) return null

    const accessToken = await decrypt(client.metaDirectWhatsAppConnection.accessTokenEncrypted)
    return {
      provider,
      credentials: {
        provider: 'meta_direct',
        phoneNumberId: client.metaDirectWhatsAppConnection.phoneNumberId,
        accessToken,
      },
      notificationNumber: client.metaDirectWhatsAppConnection.notificationNumber,
    }
  }

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

interface ConnectMetaWhatsAppInput {
  code: string
  wabaId: string
  phoneNumberId: string
  notificationNumber: string
}

export async function connectMetaWhatsApp(clientId: string, input: ConnectMetaWhatsAppInput): Promise<void> {
  const { accessToken, displayPhoneNumber } = await metaWhatsAppProvider.exchangeCodeForCredentials(
    input.code,
    input.phoneNumberId
  )
  const accessTokenEncrypted = await encrypt(accessToken)

  const client = await getClientById(clientId)
  // A brand-new client with no active Gupshup connection gets Meta Direct
  // set active automatically (nothing to switch from). A client who already
  // has Gupshup active keeps it active - connecting Meta alongside it does
  // not silently switch which provider actually sends (design doc Premise 8;
  // switching providers is a deferred, explicit UX - see Open Question 7).
  const hasActiveGupshup = (client?.activeWhatsappProvider ?? (client?.whatsappConnection?.connected ? 'gupshup' : undefined)) === 'gupshup'

  await updateClient(clientId, {
    metaDirectWhatsAppConnection: {
      provider: 'meta_direct',
      connected: true,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      // Meta distinguishes a WABA from the business that owns it; this
      // implementation doesn't look up a separate business ID and reuses
      // wabaId as a placeholder - needs verification against Meta's
      // Embedded Signup docs (see design doc Open Question 3).
      businessAccountId: input.wabaId,
      accessTokenEncrypted,
      displayPhoneNumber,
      notificationNumber: input.notificationNumber,
      connectedAt: new Date().toISOString(),
    },
    ...(hasActiveGupshup ? {} : { activeWhatsappProvider: 'meta_direct' }),
  })
}

export async function disconnectWhatsApp(clientId: string): Promise<void> {
  const client = await getClientById(clientId)
  await removeClientWhatsAppConnection(clientId)

  // Disconnecting the currently-active provider needs a new active provider,
  // not a dangling reference to a connection that no longer exists. Falls
  // back to Meta Direct if it's connected, otherwise clears the field so the
  // defensive fallback logic in getActiveProviderAndCredentials treats this
  // client as having no active connection.
  if (client && resolveActiveProvider(client) === 'gupshup') {
    if (client?.metaDirectWhatsAppConnection?.connected) {
      await updateClient(clientId, { activeWhatsappProvider: 'meta_direct' })
    } else {
      await clearActiveWhatsappProvider(clientId)
    }
  }
}

export async function disconnectMetaWhatsApp(clientId: string): Promise<void> {
  const client = await getClientById(clientId)
  await removeClientMetaDirectWhatsAppConnection(clientId)

  if (client?.activeWhatsappProvider === 'meta_direct') {
    if (client?.whatsappConnection?.connected) {
      await updateClient(clientId, { activeWhatsappProvider: 'gupshup' })
    } else {
      await clearActiveWhatsappProvider(clientId)
    }
  }
}

export async function getWhatsAppStatus(
  clientId: string
): Promise<(Omit<WhatsAppConnection, 'apiKeyEncrypted'> & { active: boolean }) | null> {
  const client = await getClientById(clientId)
  if (!client?.whatsappConnection) return null

  const { apiKeyEncrypted: _apiKeyEncrypted, ...status } = client.whatsappConnection
  return { ...status, active: resolveActiveProvider(client) === 'gupshup' }
}

export async function getMetaWhatsAppStatus(
  clientId: string
): Promise<(Omit<MetaDirectWhatsAppConnection, 'accessTokenEncrypted'> & { active: boolean }) | null> {
  const client = await getClientById(clientId)
  if (!client?.metaDirectWhatsAppConnection) return null

  const { accessTokenEncrypted: _accessTokenEncrypted, ...status } = client.metaDirectWhatsAppConnection
  return { ...status, active: resolveActiveProvider(client) === 'meta_direct' }
}

export async function sendLeadNotification(clientId: string, leadSummary: string): Promise<void> {
  try {
    const client = await getClientById(clientId)
    if (!client) return

    const sender = await getActiveProviderAndCredentials(client)
    if (!sender) {
      console.log('WhatsApp notification skipped: no active connection')
      return
    }

    console.log('WhatsApp notification sending to:', sender.notificationNumber)

    const result = await sendWithRetry(
      sender.notificationNumber,
      `New lead captured!\n\n${leadSummary}`,
      sender.provider,
      sender.credentials
    )

    console.log('WhatsApp notification result:', result)
  } catch (error) {
    console.error('WhatsApp lead notification failed:', error)
  }
}

// Unlike sendLeadNotification/sendWeeklyReport above (which always send to
// the CLIENT's own notification number), this sends to an arbitrary LEAD's
// phone number -- the real send primitive journey-executor-service.ts's
// handleSendMessage() needs for a Journey's send_message step. Reuses the
// same provider-resolution and retry logic as the client-notification
// paths; the only difference is who the message goes to.
export async function sendWhatsAppMessageToLead(
  clientId: string,
  toNumber: string,
  message: string
): Promise<WhatsAppSendResult> {
  const client = await getClientById(clientId)
  if (!client) {
    return { success: false, error: 'Client not found', retryable: false }
  }

  const sender = await getActiveProviderAndCredentials(client)
  if (!sender) {
    return { success: false, error: 'No active WhatsApp connection for this client', retryable: false }
  }

  return sendWithRetry(toNumber, message, sender.provider, sender.credentials)
}

// Meta requires a pre-approved message template for any business-initiated
// send outside a 24-hour customer-service window that started with the
// lead's own most recent inbound message (Gupshup sits on the same
// underlying platform policy). This codebase has NO inbound WhatsApp
// message handling at all yet -- the webhook only logs (and has no
// signature verification, tracked separately in TODOS.md as P1) -- so
// there is no real data anywhere to check a genuine session window
// against. Hardcoded false is the only HONEST answer given that: treating
// an unknown/untracked session as "not active" is the conservative,
// correct default, not a placeholder pretending to check something real.
// Real inbound message timestamp tracking (itself gated behind the webhook
// signature fix, since trusting unverified webhook data for this decision
// would be a real vulnerability) is what turns this into a genuine check --
// see TODOS.md. The guard's call sites don't need to change when that
// lands, only this function's body.
export async function hasActiveWhatsAppSession(_leadId: string): Promise<boolean> {
  return false
}

export async function sendWeeklyReport(clientId: string): Promise<void> {
  const client = await getClientById(clientId)
  if (!client) return

  const sender = await getActiveProviderAndCredentials(client)
  if (!sender) return

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

  await sendWithRetry(sender.notificationNumber, message, sender.provider, sender.credentials)
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
