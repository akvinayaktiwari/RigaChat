import { gupshupProvider } from '../providers/gupshup-provider.js'
import { metaWhatsAppProvider } from '../providers/meta-whatsapp-provider.js'
import { decrypt, encrypt } from '../lib/kms.js'
import type {
  WhatsAppCredentials,
  WhatsAppProvider,
  WhatsAppSendResult,
  WhatsAppTemplateSend,
} from '../lib/whatsapp-provider.js'
import {
  WHATSAPP_SMOKE_TEST_TEMPLATE,
  WHATSAPP_TEMPLATE_LANGUAGE,
  templateLanguageOf,
} from '../lib/whatsapp-templates.js'
import {
  clearActiveWhatsappProvider,
  getClientById,
  getConnectedWhatsAppClients,
  removeClientMetaDirectWhatsAppConnection,
  removeClientWhatsAppConnection,
  updateClient,
} from '../repositories/client-repository.js'
import {
  removeGupshupAppClientMapping,
  setGupshupAppClientMapping,
} from '../repositories/gupshup-app-lookup-repository.js'
import { getLastInboundMessageAt } from '../repositories/whatsapp-inbound-activity-repository.js'
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

// Takes a thunk rather than (to, message, provider, credentials) so the same
// backoff covers free-form AND template sends -- a template send that loses a
// race with a 5xx deserves the same three attempts a text send gets, and
// duplicating this loop per message type is how the two quietly diverge.
async function sendWithRetry(send: () => Promise<WhatsAppSendResult>): Promise<WhatsAppSendResult> {
  let attempts = 0
  let lastResult: WhatsAppSendResult = { success: false, error: 'No send attempt made' }

  while (attempts < MAX_RETRY_ATTEMPTS) {
    attempts++
    lastResult = await send()

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

  // Written before updateClient, not after: if the app name is already
  // claimed by a different client, GupshupAppConflictError should stop this
  // connect attempt before the client record ever reflects "connected".
  // appName uniqueness is only guaranteed within one Gupshup account, not
  // globally -- see gupshup-app-lookup-repository.ts's own comment on this
  // being a real, if unlikely, collision risk across different clients'
  // separate Gupshup accounts.
  await setGupshupAppClientMapping(input.appName, clientId)

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

export interface StoreMetaWhatsAppConnectionInput {
  wabaId: string
  phoneNumberId: string
  notificationNumber: string
  accessToken: string
  displayPhoneNumber: string
}

// Split out of connectMetaWhatsApp so the Embedded Signup path and the
// seed script (scripts/seed-meta-whatsapp-connection.ts) store a connection
// through ONE implementation. The only thing that differs between them is
// where the access token came from -- an OAuth code exchange versus a token
// issued directly in the Meta dashboard -- and everything after that point
// (encryption, active-provider arbitration, the record shape) must stay
// identical or the seeded connection would behave subtly differently from a
// real one, which would make it useless for testing.
export async function storeMetaWhatsAppConnection(
  clientId: string,
  input: StoreMetaWhatsAppConnectionInput
): Promise<void> {
  const accessTokenEncrypted = await encrypt(input.accessToken)

  // Subscribe BEFORE storing, so the stored record can state honestly whether
  // this connection can actually receive anything.
  //
  // Deliberately does NOT throw on failure. A connection that can send but not
  // receive is degraded, not worthless, and discarding working credentials
  // because a second call failed would be the worse outcome -- especially since
  // the caller is mid-OAuth-redirect and has nowhere good to put an error. The
  // flag is what stops it being SILENTLY degraded, which is the actual bug this
  // fixes: inbound was dead for every Meta client and nothing anywhere said so.
  let webhookSubscribed = false
  try {
    await metaWhatsAppProvider.subscribeWabaToApp(input.wabaId, input.accessToken)
    webhookSubscribed = true
  } catch (error) {
    console.error(
      `[whatsapp] WABA ${input.wabaId} connected for client ${clientId} but NOT subscribed to webhooks -- ` +
        `inbound messages and delivery statuses will not arrive. ` +
        `Repair with scripts/subscribe-whatsapp-webhooks.ts. Cause:`,
      error
    )
  }

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
      displayPhoneNumber: input.displayPhoneNumber,
      notificationNumber: input.notificationNumber,
      connectedAt: new Date().toISOString(),
      webhookSubscribed,
    },
    ...(hasActiveGupshup ? {} : { activeWhatsappProvider: 'meta_direct' }),
  })
}

export async function connectMetaWhatsApp(clientId: string, input: ConnectMetaWhatsAppInput): Promise<void> {
  const { accessToken, displayPhoneNumber } = await metaWhatsAppProvider.exchangeCodeForCredentials(
    input.code,
    input.phoneNumberId
  )

  await storeMetaWhatsAppConnection(clientId, {
    wabaId: input.wabaId,
    phoneNumberId: input.phoneNumberId,
    notificationNumber: input.notificationNumber,
    accessToken,
    displayPhoneNumber,
  })
}

// The redirect-OAuth counterpart to connectMetaWhatsApp above. Both end at
// the same storeMetaWhatsAppConnection, so a connection made this way is
// indistinguishable from an Embedded Signup one -- which is the point: this
// exists so the WhatsApp connect can reuse the redirect flow already proven
// working for Meta Lead Ads, not to create a second class of connection.
export async function connectMetaWhatsAppViaOAuth(
  clientId: string,
  code: string,
  redirectUri: string,
  notificationNumber: string
): Promise<void> {
  const accessToken = await metaWhatsAppProvider.exchangeCodeForToken(code, redirectUri)
  const discovered = await metaWhatsAppProvider.discoverWhatsAppAccount(accessToken)

  await storeMetaWhatsAppConnection(clientId, {
    wabaId: discovered.wabaId,
    phoneNumberId: discovered.phoneNumberId,
    notificationNumber,
    accessToken,
    displayPhoneNumber: discovered.displayPhoneNumber,
  })
}

export async function disconnectWhatsApp(clientId: string): Promise<void> {
  const client = await getClientById(clientId)

  // Captured before removeClientWhatsAppConnection wipes the connection
  // field below -- this is the only place the appName the mapping was
  // keyed by is still available.
  if (client?.whatsappConnection?.appName) {
    await removeGupshupAppClientMapping(client.whatsappConnection.appName)
  }

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

// sendLeadNotification used to live here and sent FREE TEXT to the client's
// notificationNumber. It never once delivered: that number never messages the
// business, so its 24h window is permanently closed and Meta failed every send
// with 131047 -- asynchronously, via the status webhook, long after this
// function had already logged `success: true` and returned. It now lives in
// lead-notification-service.ts and sends the approved `lead_notification_1`
// template. Do not reintroduce a free-text send to a client's own number.

// Unlike sendWeeklyReport below (which always sends to
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

  return sendWithRetry(() => sender.provider.sendMessage(toNumber, message, sender.credentials))
}

// The business-initiated counterpart to sendWhatsAppMessageToLead above.
// Unlike that one it does NOT require an open 24h session window -- which is
// the entire point: journey outreach, reminders and lead notifications all
// fire on a schedule, long after any window has closed.
//
// Takes the template name + ordered params rather than a
// WhatsAppTemplateDefinition so a caller can send a template this codebase
// does not define (hello_world, or one a client authored on their own WABA).
// languageCode defaults to WHATSAPP_TEMPLATE_LANGUAGE so callers cannot drift
// from what create-side approved.
export async function sendWhatsAppTemplateToLead(
  clientId: string,
  toNumber: string,
  templateName: string,
  bodyParams: string[] = [],
  languageCode: string = WHATSAPP_TEMPLATE_LANGUAGE
): Promise<WhatsAppSendResult> {
  const client = await getClientById(clientId)
  if (!client) {
    return { success: false, error: 'Client not found', retryable: false }
  }

  const sender = await getActiveProviderAndCredentials(client)
  if (!sender) {
    return { success: false, error: 'No active WhatsApp connection for this client', retryable: false }
  }

  const template: WhatsAppTemplateSend = { templateName, languageCode, bodyParams }
  return sendWithRetry(() => sender.provider.sendTemplate(toNumber, template, sender.credentials))
}

// The inward-facing counterpart to sendWhatsAppTemplateToLead: same
// business-initiated template path, but addressed to the CLIENT's own
// notificationNumber instead of a lead's phone. Handoff alerts and lead
// reminders both need it -- they are messages ABOUT a lead, TO the human who
// owns them.
//
// Kept here rather than resolved by the caller because notificationNumber
// lives behind getActiveProviderAndCredentials, which is private: which of
// the two connection records holds the number depends on the active provider,
// and that is exactly the branch callers should not be re-deriving.
//
// A missing notificationNumber is reported as its own non-retryable error
// rather than folded into "no active connection". The two mean different
// things to whoever reads the log: one client never connected WhatsApp, the
// other connected it and has nowhere to be told about it.
export async function sendWhatsAppTemplateToClientNumber(
  clientId: string,
  templateName: string,
  bodyParams: string[] = [],
  languageCode: string = WHATSAPP_TEMPLATE_LANGUAGE
): Promise<WhatsAppSendResult> {
  const client = await getClientById(clientId)
  if (!client) {
    return { success: false, error: 'Client not found', retryable: false }
  }

  const sender = await getActiveProviderAndCredentials(client)
  if (!sender) {
    return { success: false, error: 'No active WhatsApp connection for this client', retryable: false }
  }

  const notificationNumber = sender.notificationNumber?.trim()
  if (!notificationNumber) {
    return { success: false, error: 'Client has no notificationNumber configured', retryable: false }
  }

  const template: WhatsAppTemplateSend = { templateName, languageCode, bodyParams }
  return sendWithRetry(() => sender.provider.sendTemplate(notificationNumber, template, sender.credentials))
}

// Powers the dashboard's "send test message" button. Deliberately sends a
// TEMPLATE rather than free text: a test is only meaningful if it exercises
// the same business-initiated path real journey outreach uses, and free text
// would fail outside a 24h session window anyway -- which is always, for a
// number that has never messaged the business.
//
// Returns the provider's WhatsAppSendResult unchanged rather than collapsing
// it to a boolean, because the whole point of a test button is the reason it
// failed (unapproved template, number not on the allow-list, expired token).
export async function sendWhatsAppTestMessage(clientId: string, toNumber: string): Promise<WhatsAppSendResult> {
  return sendWhatsAppTemplateToLead(
    clientId,
    toNumber,
    WHATSAPP_SMOKE_TEST_TEMPLATE,
    [],
    templateLanguageOf(WHATSAPP_SMOKE_TEST_TEMPLATE)
  )
}

const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

// Meta requires a pre-approved message template for any business-initiated
// send outside a 24-hour customer-service window that started with the
// lead's own most recent inbound message (Gupshup sits on the same
// underlying platform policy). Real as of 2026-07-29: webhook-service.ts's
// Gupshup inbound handler now resolves an incoming message to a lead (via
// the app -> clientId lookup, then a phone match across that client's
// leads) and records the timestamp here via
// whatsapp-inbound-activity-repository.ts, once the webhook's own
// authenticity check (verifyGupshupWebhookToken) made trusting that data
// safe. No inbound record at all still means "not active," same
// conservative default as before -- a lead who has genuinely never
// messaged in has no session to be inside of.
export async function hasActiveWhatsAppSession(leadId: string): Promise<boolean> {
  const lastInboundAt = await getLastInboundMessageAt(leadId)
  if (!lastInboundAt) return false

  return Date.now() - new Date(lastInboundAt).getTime() < WHATSAPP_SESSION_WINDOW_MS
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
    `Your weekly VyostraAI report\n\n` +
    `New leads this week: ${totalCount}\n` +
    `- Chat widget: ${chatLeadCount}\n` +
    `- Forms: ${formLeadCount}`

  await sendWithRetry(() => sender.provider.sendMessage(sender.notificationNumber, message, sender.credentials))
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
