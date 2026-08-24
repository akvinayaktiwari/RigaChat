// Re-exported so existing importers keep working now that the class lives
// with the rest of the connect failures.
export { MetaPageAlreadyConnectedError } from '../lib/meta-connect-errors.js'
import { MetaPageAlreadyConnectedError } from '../lib/meta-connect-errors.js'
import { metaProvider } from '../providers/meta-provider.js'
import type { MetaFieldDatum } from '../providers/meta-provider.js'
import { getProvider, syncLeadToCRMWithRetry } from './crm-service.js'
import { sendLeadNotification } from './lead-notification-service.js'
import { igniteJourneysForLead } from './journey-ignition-service.js'
import { decrypt, encrypt } from '../lib/kms.js'
import { getClientById, removeClientMetaConnection, updateClient } from '../repositories/client-repository.js'
import {
  createMetaLead,
  getClientIdForPage,
  getMetaLeadsByClientId,
  MetaPageConflictError,
  removePageClientMapping,
  setPageClientMapping,
  updateMetaLeadSyncStatus,
} from '../repositories/meta-lead-repository.js'
import { hasProcessed, markProcessed } from '../repositories/webhook-event-repository.js'
import {
  createMetaDeletionRequest,
  getMetaDeletionRequest,
  markMetaDeletionRequestNotified,
} from '../repositories/meta-deletion-request-repository.js'
import { getContactNotificationAddress, sendEmail } from '../repositories/email-repository.js'
import type {
  ClientRecord,
  FormField,
  MetaConnection,
  MetaDeletionRequest,
  MetaDeletionRequestStatus,
  MetaLead,
} from '../types/index.js'
import crypto from 'crypto'

// Idempotency keys in webhook_events are a bare eventId partition key shared
// across every provider (Razorpay writes its own unnamespaced there today) --
// prefixing ours avoids a cross-provider collision. See design doc Premise 7.
function idempotencyKey(leadgenId: string): string {
  return `meta:${leadgenId}`
}

interface MetaWebhookChange {
  field: string
  value: {
    leadgen_id: string
    page_id?: string
    form_id?: string
    created_time?: number
  }
}

interface MetaWebhookEntry {
  id: string
  time?: number
  changes?: MetaWebhookChange[]
}

interface MetaWebhookPayload {
  object?: string
  entry?: MetaWebhookEntry[]
}

interface MappedMetaFields {
  name?: string
  phone?: string
  email?: string
  propertyInterest?: string
  budgetRange?: string
  customFields: Record<string, string>
}

// Meta forms are authored in Ads Manager, not our form builder -- we never
// see field types up front. Best-effort match on Meta's own field key names
// (Meta standardizes common ones like full_name/email/phone_number).
// Unmatched questions land in customFields, same fallback FormLead uses.
function mapMetaFieldData(fieldData: MetaFieldDatum[]): MappedMetaFields {
  const mapped: MappedMetaFields = { customFields: {} }

  for (const { name, values } of fieldData) {
    const value = values[0] ?? ''
    const key = name.toLowerCase()

    if (key === 'full_name' || key === 'name') mapped.name = value
    else if (key.includes('phone')) mapped.phone = value
    else if (key.includes('email')) mapped.email = value
    else if (key.includes('propert') || key.includes('interest')) mapped.propertyInterest = value
    else if (key.includes('budget')) mapped.budgetRange = value
    else mapped.customFields[name] = value
  }

  return mapped
}

// Synthesizes FormField[] shape purely so the client's connected CRM
// provider's mapLead() (built for the form-builder's FormField[] contract)
// can be reused unchanged for Meta leads -- name/phone/email are tagged with
// the types mapLead's own heuristics look for; everything else is generic
// text and ends up in the CRM lead's description via mapLead's otherFields.
function buildSyntheticFormFields(fields: Record<string, string>): FormField[] {
  return Object.keys(fields).map((fieldId) => {
    if (fieldId === 'email') return { fieldId, label: 'Email', type: 'email', required: false }
    if (fieldId === 'phone') return { fieldId, label: 'Phone', type: 'phone', required: false }
    if (fieldId === 'name') return { fieldId, label: 'Name', type: 'text', required: false }
    return { fieldId, label: fieldId, type: 'text', required: false }
  })
}

export async function connectMetaAds(clientId: string, code: string): Promise<void> {
  const { pageId, pageName, pageAccessToken } = await metaProvider.exchangeCodeForPageCredentials(code)

  // Facebook Pages commonly have multiple admins -- an early read-based
  // check gives a fast, clear rejection in the common (non-racing) case.
  const existingOwner = await getClientIdForPage(pageId)
  if (existingOwner && existingOwner !== clientId) {
    throw new MetaPageAlreadyConnectedError()
  }

  // Read the client's current Page (if any) BEFORE claiming the new one --
  // used below, after the new claim succeeds, to release the old mapping.
  const existingClient = await getClientById(clientId)
  const previousPageId = existingClient?.metaConnection?.pageId

  // The real guarantee is this atomic claim, not the read above: two
  // clients completing OAuth for the same Page concurrently could both
  // pass that read before either writes. setPageClientMapping's
  // ConditionExpression makes DynamoDB itself reject the losing write.
  // Claimed BEFORE touching the client record so a lost race never
  // leaves this client's own metaConnection in an inconsistent state.
  try {
    await setPageClientMapping(pageId, clientId)
  } catch (error) {
    if (error instanceof MetaPageConflictError) {
      throw new MetaPageAlreadyConnectedError()
    }
    throw error
  }

  // Only now that the NEW claim has succeeded, release the client's
  // previous Page mapping (if switching Pages). Releasing it earlier (before
  // the new claim was confirmed) would mean a failed new claim (a genuine
  // race, or a transient write error) leaves the old mapping deleted while
  // the client record still points at the old Page -- silently dropping all
  // future webhook deliveries for that Page with no error anywhere.
  if (previousPageId && previousPageId !== pageId) {
    const previousOwner = await getClientIdForPage(previousPageId)
    if (previousOwner === clientId) {
      await removePageClientMapping(previousPageId)
    }
  }

  // Must succeed before we tell the client they're "connected" -- without
  // this subscription, Meta never delivers a single leadgen webhook event
  // for this Page, and the failure would otherwise be invisible (dashboard
  // shows "Connected", zero leads ever arrive, no error anywhere).
  await metaProvider.subscribePageToWebhook(pageId, pageAccessToken)

  const pageAccessTokenEncrypted = await encrypt(pageAccessToken)

  await updateClient(clientId, {
    metaConnection: {
      provider: 'meta',
      connected: true,
      pageId,
      pageName,
      pageAccessTokenEncrypted,
      connectedAt: new Date().toISOString(),
    },
  })
}

export async function disconnectMetaAds(clientId: string): Promise<void> {
  const client = await getClientById(clientId)
  if (client?.metaConnection?.pageId) {
    // Only remove the routing row if it still actually points at THIS
    // client. If another client won a connect race (or the local record is
    // otherwise stale), the mapping already belongs to someone else --
    // deleting it here would let this client unilaterally sabotage another
    // tenant's live lead routing via their own disconnect call.
    const currentOwner = await getClientIdForPage(client.metaConnection.pageId)
    if (currentOwner === clientId) {
      await removePageClientMapping(client.metaConnection.pageId)
    }
  }
  await removeClientMetaConnection(clientId)
}

export async function getMetaStatus(clientId: string): Promise<Omit<MetaConnection, 'pageAccessTokenEncrypted'> | null> {
  const client = await getClientById(clientId)
  if (!client?.metaConnection) return null

  const { pageAccessTokenEncrypted: _pageAccessTokenEncrypted, ...status } = client.metaConnection
  return status
}

export async function getMetaLeadsForClient(clientId: string): Promise<MetaLead[]> {
  return getMetaLeadsByClientId(clientId)
}

// Thin passthrough so the GET /webhooks/meta route calls the service layer
// like every other route in this codebase, rather than reaching into
// meta-provider.ts directly.
export function verifyMetaWebhookChallenge(
  mode: string | undefined,
  token: string | undefined,
  challenge: string | undefined
): string | null {
  return metaProvider.verifyWebhookChallenge(mode, token, challenge)
}

function parseCustomFields(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

// Takes the already-fetched ClientRecord (the caller already has it) rather
// than a clientId, avoiding a redundant DynamoDB read on every lead.
async function syncMetaLeadToCRM(metaLead: MetaLead, client: ClientRecord): Promise<void> {
  if (!client.crmConnection?.connected) return

  const provider = getProvider(client.crmConnection.provider)
  if (!provider) return

  const fields: Record<string, string> = {
    ...(metaLead.name && { name: metaLead.name }),
    ...(metaLead.phone && { phone: metaLead.phone }),
    ...(metaLead.email && { email: metaLead.email }),
    ...(metaLead.propertyInterest && { propertyInterest: metaLead.propertyInterest }),
    ...(metaLead.budgetRange && { budgetRange: metaLead.budgetRange }),
    ...parseCustomFields(metaLead.customFields),
  }
  const formFields = buildSyntheticFormFields(fields)
  const crmLead = provider.mapLead(fields, formFields, metaLead.sourceUrl)

  const outcome = await syncLeadToCRMWithRetry(client, crmLead)

  await updateMetaLeadSyncStatus(
    metaLead.clientId,
    metaLead.leadId,
    outcome.success
      ? {
          crmSynced: true,
          crmSyncedAt: new Date().toISOString(),
          crmExternalId: outcome.externalId,
          crmSyncAttempts: outcome.attempts,
        }
      : { crmSynced: false, crmSyncError: outcome.error, crmSyncAttempts: outcome.attempts }
  )
}

async function processSingleLeadgenEvent(pageId: string, leadgenId: string): Promise<{ retryable: boolean }> {
  const key = idempotencyKey(leadgenId)

  if (await hasProcessed(key)) {
    return { retryable: false }
  }

  const clientId = await getClientIdForPage(pageId)
  if (!clientId) {
    console.log(`Meta webhook: no client mapped for page ${pageId}, ignoring`, { leadgenId })
    await markProcessed(key, 'meta', 'leadgen')
    return { retryable: false }
  }

  const client = await getClientById(clientId)
  if (!client?.metaConnection?.connected) {
    console.log(`Meta webhook: client ${clientId} has no active Meta connection, ignoring`, { leadgenId })
    await markProcessed(key, 'meta', 'leadgen')
    return { retryable: false }
  }

  let fieldData: MetaFieldDatum[]
  try {
    const pageAccessToken = await decrypt(client.metaConnection.pageAccessTokenEncrypted)
    fieldData = await metaProvider.fetchLeadFieldData(leadgenId, pageAccessToken)
  } catch (error) {
    // NOT marked processed -- a transient Graph API failure should let
    // Meta's redelivery (immediate, then decreasing frequency over 36
    // hours per Meta's own webhook docs) retry this specific lead.
    console.error(`Meta webhook: failed to fetch lead field data for ${leadgenId}:`, error)
    return { retryable: true }
  }

  const mapped = mapMetaFieldData(fieldData)
  const sourceUrl = `https://www.facebook.com/${pageId}/`

  const metaLead = await createMetaLead({
    pageId,
    clientId,
    source: 'meta',
    name: mapped.name,
    phone: mapped.phone,
    email: mapped.email,
    propertyInterest: mapped.propertyInterest,
    budgetRange: mapped.budgetRange,
    customFields: JSON.stringify(mapped.customFields),
    sourceUrl,
  })

  // Hand the lead to its Agent. First in the post-save sequence because it is
  // the only step that is time-sensitive to the lead themselves -- CRM sync and
  // the notification below are for the client, and a buyer who filled a form
  // thirty seconds ago is the whole reason this product exists.
  //
  // igniteJourneysForLead never throws (see its own comment): a journey-layer
  // failure must not lose a lead that is already durably saved. It returns a
  // structured outcome instead, logged here and persisted onto the lead by the
  // follow-up that adds ignition status to the record.
  const ignition = await igniteJourneysForLead({
    leadRef: { source: 'meta', pageId, leadId: metaLead.leadId },
    clientId,
  })
  if (ignition.status !== 'started') {
    console.log(`[ignition] meta lead ${metaLead.leadId}: ${ignition.status}`, ignition)
  }

  // Fire this after the lead is durably saved -- a CRM sync or WhatsApp
  // notification failure must never lose the lead record itself.
  await syncMetaLeadToCRM(metaLead, client).catch((error) => {
    console.error('Meta lead CRM sync error:', error)
  })

  // Awaited (not fire-and-forget) -- see design doc Architecture Finding 1:
  // an un-awaited async call here could be aborted mid-flight once this
  // Lambda's response promise resolves, the same risk found in the
  // existing (unfixed) form-lead-service.ts CRM sync call.
  const interest = Object.entries({
    ...(mapped.email && { Email: mapped.email }),
    ...(mapped.propertyInterest && { 'Property Interest': mapped.propertyInterest }),
    ...(mapped.budgetRange && { 'Budget Range': mapped.budgetRange }),
  })
    .map(([label, value]) => `${label}: ${value}`)
    .join(' · ')

  const notification = await sendLeadNotification({
    clientId,
    leadId: metaLead.leadId,
    botId: pageId,
    source: `Meta Lead Ads (${client.metaConnection.pageName})`,
    ...(mapped.name ? { name: mapped.name } : {}),
    ...(mapped.phone ? { phone: mapped.phone } : {}),
    interest,
  })
  if (!notification.notified) {
    console.error(`[lead-notification] meta lead ${metaLead.leadId} reached nobody:`, notification.error)
  }

  await markProcessed(key, 'meta', 'leadgen')
  return { retryable: false }
}

// Meta platform policy requires both callbacks to exist and respond
// correctly, even though (per the KNOWN LIMITATION noted on
// meta-provider.ts's parseSignedRequest) we can't correlate the payload's
// user_id back to a specific ClientRecord to auto-disconnect yet.
export function handleMetaDeauthorize(signedRequest: string): { verified: boolean } {
  const payload = metaProvider.parseSignedRequest(signedRequest)
  if (!payload) {
    console.error('Meta deauthorize callback: signature verification failed')
    return { verified: false }
  }

  console.log('Meta deauthorize callback received:', payload)
  return { verified: true }
}

// The confirmation code is the only credential guarding the public status
// lookup, so it is random rather than derived from the request. The previous
// `meta-deletion-${Date.now()}` form was guessable to the second AND collided
// for two requests in the same millisecond.
function generateConfirmationCode(): string {
  return `mdr_${crypto.randomBytes(16).toString('hex')}`
}

// Best-effort, exactly like contact-service's notify(): the request is already
// durable in DynamoDB before this runs, so an SES outage must not turn a valid
// deletion request into a 400 back to Meta. A failure leaves notified=false,
// which is the signal to go read the table by hand.
async function notifyDeletionRequest(record: MetaDeletionRequest): Promise<boolean> {
  const destination = getContactNotificationAddress()

  if (!destination) {
    console.warn(
      `Meta deletion request ${record.confirmationCode} stored but not emailed: SES_FROM_EMAIL / CONTACT_NOTIFICATION_EMAIL are not set.`
    )
    return false
  }

  try {
    await sendEmail({
      to: destination,
      subject: `[Data deletion] Meta request ${record.confirmationCode}`,
      textBody: [
        'A Facebook user requested deletion of their data via Meta.',
        '',
        `Confirmation code: ${record.confirmationCode}`,
        `Meta app-scoped user id: ${record.metaUserId}`,
        `Requested at: ${record.requestedAt}`,
        '',
        'This requires MANUAL action. Meta sends only an app-scoped user id,',
        'which does not appear on any lead record we store, so nothing can be',
        'located automatically. Search the leads for the person if they can be',
        'identified, delete what matches, then set status=completed on this row.',
        '',
        'The status page tells them this completes within 30 days.',
      ].join('\n'),
    })
    return true
  } catch (error) {
    console.error(
      `Meta deletion request ${record.confirmationCode} stored but notification email failed:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

export async function handleMetaDataDeletionRequest(signedRequest: string): Promise<{
  verified: boolean
  confirmationCode: string
}> {
  const payload = metaProvider.parseSignedRequest(signedRequest)
  const confirmationCode = generateConfirmationCode()

  if (!payload) {
    console.error('Meta data deletion request: signature verification failed')
    return { verified: false, confirmationCode }
  }

  // Meta's signed request always carries user_id for this callback. Falling
  // back to 'unknown' rather than rejecting: a request we cannot attribute is
  // still a request someone made, and dropping it would be worse than storing
  // it with a gap for the human to chase.
  const metaUserId = typeof payload.user_id === 'string' ? payload.user_id : 'unknown'

  const record = await createMetaDeletionRequest({
    confirmationCode,
    metaUserId,
    status: 'received',
    requestedAt: new Date().toISOString(),
    notified: false,
  })

  const notified = await notifyDeletionRequest(record)

  if (notified) {
    // Non-fatal: the request is stored and the email already went out, so a
    // failed flag write must not fail the callback. Worst case the row
    // under-reports as un-notified.
    await markMetaDeletionRequestNotified(confirmationCode).catch((error: unknown) => {
      console.error(
        `Failed to flag Meta deletion request ${confirmationCode} as notified:`,
        error instanceof Error ? error.message : String(error)
      )
    })
  }

  return { verified: true, confirmationCode }
}

// Backs the public status page. Returns null for an unknown code rather than
// throwing, so the page can distinguish "we have no such request" from "the
// lookup broke" -- the old page could only ever echo the code back, which made
// a typo'd or fabricated code look identical to a real one.
export async function getMetaDeletionRequestStatus(
  confirmationCode: string
): Promise<MetaDeletionRequestStatus | null> {
  const record = await getMetaDeletionRequest(confirmationCode)

  if (!record) {
    return null
  }

  return {
    confirmationCode: record.confirmationCode,
    status: record.status,
    requestedAt: record.requestedAt,
  }
}

export interface MetaWebhookResult {
  status: 200 | 400 | 500 | 503
  message: string
}

// Meta batches multiple Page/lead updates into a single delivery -- entry[]
// (one per Page) and changes[] (one per field update) are both looped,
// sequentially (not Promise.all): batches are rare in practice, and
// sequential processing keeps each item's idempotency check from racing
// another item's in the same request. See design doc Architecture Finding 2.
export async function processMetaLeadWebhook(
  rawBody: string,
  signatureHeader: string | undefined
): Promise<MetaWebhookResult> {
  let signatureValid: boolean
  try {
    signatureValid = metaProvider.verifyWebhookSignature(rawBody, signatureHeader)
  } catch (error) {
    console.error('Meta webhook signature verification misconfigured:', error)
    return { status: 500, message: 'Signature verification misconfigured' }
  }

  if (!signatureValid) {
    console.error('Meta webhook rejected: invalid or missing signature')
    return { status: 400, message: 'Invalid signature' }
  }

  let payload: MetaWebhookPayload
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload
  } catch {
    console.error('Meta webhook rejected: body is not valid JSON')
    return { status: 400, message: 'Invalid JSON body' }
  }

  let anyRetryableFailure = false

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'leadgen') continue

      const leadgenId = change.value.leadgen_id
      const pageId = change.value.page_id ?? entry.id

      try {
        const { retryable } = await processSingleLeadgenEvent(pageId, leadgenId)
        if (retryable) anyRetryableFailure = true
      } catch (error) {
        // Isolate failures per-item -- one bad lead/client must not drop
        // every other lead batched into the same delivery.
        console.error(`Meta webhook: unhandled error processing leadgen ${leadgenId}:`, error)
        anyRetryableFailure = true
      }
    }
  }

  // A non-2xx here makes Meta redeliver the WHOLE payload. That's fine: the
  // per-leadgen idempotency check above skips anything already processed,
  // so a redelivery only actually reprocesses the item(s) that failed.
  if (anyRetryableFailure) {
    return { status: 503, message: 'One or more leads failed, retry requested' }
  }

  return { status: 200, message: 'Processed' }
}
