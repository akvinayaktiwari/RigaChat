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
import { countWebhookAttempt, hasProcessed, markProcessed } from '../repositories/webhook-event-repository.js'
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

// Its own namespace, never the idempotency key above: a counter row that
// hasProcessed() could see would make the next redelivery skip a lead still
// waiting for its answers.
function emptyFieldDataCounterKey(leadgenId: string): string {
  return `meta:${leadgenId}:empty-field-data`
}

// How many deliveries an empty field_data may cost before the lead is accepted
// as genuinely empty.
//
// Meta's field data is eventually consistent with its webhook: the notification
// can arrive before the answers are readable. Retrying is therefore right, but
// only briefly -- Meta redelivers immediately and then backs off over 36 hours,
// and a lead that is STILL empty after three deliveries is not going to fill in.
// Past that the choice is between a blank record and no record, and a blank one
// at least tells the client a lead exists to go look up in Ads Manager.
const MAX_EMPTY_FIELD_DATA_ATTEMPTS = 3

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

// Which normalized lead field a Meta question maps onto. `custom` is not a
// field -- it is the "no rule matched" outcome, kept in the same vocabulary so
// the resolver has one return type.
type MappedFieldName = 'name' | 'phone' | 'email' | 'propertyInterest' | 'budgetRange'

// Meta forms are authored in Ads Manager, not our form builder, so we never see
// field types up front -- only a key per question. Meta standardizes the common
// ones (full_name, email, phone_number) and slugifies everything else from the
// question text the client typed.
//
// ORDER IS PRECEDENCE and is deliberate, because real question keys match more
// than one rule ("email_or_phone", "budget_for_property"). It used to be an
// if/else chain, where the precedence was real but invisible and unstated.
// Anything matching two rules is logged (see resolveFieldName) so an ambiguous
// form shows up in the log instead of being silently resolved by source order.
//
//   email  first: 'email' is the most specific token here and never appears in
//          a question that is really asking for something else.
//   phone  second, and the reason this list exists in its stated form. Indian
//          real-estate forms very often ask for a "WhatsApp Number" rather than
//          a phone number, which slugifies to whatsapp_number and matched NO
//          rule under the old chain -- so the lead was saved with an empty
//          phone and landed in customFields. That is the one field the product
//          cannot work without: lead notifications, journey outreach and the
//          whole WhatsApp agent are addressed by it.
//   name   third; exact keys only, because 'name' as a substring appears in
//          company_name, project_name and society_name.
//   budget before property, because 'budget_for_property' is a budget question.
const FIELD_RULES: { field: MappedFieldName; matches: (key: string) => boolean }[] = [
  { field: 'email', matches: (key) => /e_?mail/.test(key) },
  {
    field: 'phone',
    // 'contact' alone is deliberately NOT here: 'preferred_contact_time' is a
    // common question and is not a phone number.
    matches: (key) => /phone|whatsapp|whats_app|wa_?number|mobile|^cell$|cell_?(no|number)|contact_?(no|number)/.test(key),
  },
  { field: 'name', matches: (key) => key === 'full_name' || key === 'name' || key === 'your_name' },
  { field: 'budgetRange', matches: (key) => /budget|price_?range/.test(key) },
  { field: 'propertyInterest', matches: (key) => /propert|interest|project|configuration|bhk|unit_?type/.test(key) },
]

// Meta splits a name into two standard keys when the form asks that way. Neither
// matches the name rule above (both would be ambiguous as a whole name), so they
// are composed after the loop instead.
const FIRST_NAME_KEYS = new Set(['first_name', 'given_name'])
const LAST_NAME_KEYS = new Set(['last_name', 'family_name', 'surname'])

// Meta slugifies question text inconsistently -- spaces, hyphens and camelCase
// all appear. Normalizing first means a rule can be written once instead of
// once per spelling Meta happens to emit.
function normalizeFieldKey(name: string): string {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveFieldName(rawName: string): MappedFieldName | null {
  const key = normalizeFieldKey(rawName)
  const hits = FIELD_RULES.filter((rule) => rule.matches(key))

  if (hits.length === 0) return null

  // The complaint this answers: under the old if/else chain a key matching two
  // rules was resolved by source order with nothing recorded, so a client whose
  // form used an ambiguous label had no way to find out why their CRM column
  // was wrong.
  if (hits.length > 1) {
    console.warn(
      `[meta-lead] field "${rawName}" matched ${hits.length} rules (${hits.map((hit) => hit.field).join(', ')}); using "${hits[0].field}"`
    )
  }

  return hits[0].field
}

// A lead has one phone number and one email, so these take the first value.
// A lead can genuinely pick several areas of interest, so those keep all of
// them. Either way nothing is discarded -- see the _additional note below.
const SINGLE_VALUED: ReadonlySet<MappedFieldName> = new Set<MappedFieldName>(['name', 'phone', 'email'])

export function mapMetaFieldData(fieldData: MetaFieldDatum[]): MappedMetaFields {
  const mapped: MappedMetaFields = { customFields: {} }
  let firstName: string | undefined
  let lastName: string | undefined

  for (const { name, values } of fieldData) {
    const key = normalizeFieldKey(name)

    if (FIRST_NAME_KEYS.has(key)) {
      firstName = values[0] ?? ''
      continue
    }
    if (LAST_NAME_KEYS.has(key)) {
      lastName = values[0] ?? ''
      continue
    }

    const field = resolveFieldName(name)

    if (!field) {
      // Unmatched questions land in customFields, the same fallback FormLead
      // uses. Joined rather than truncated: a multi-select custom question is
      // the most likely place for several answers.
      mapped.customFields[name] = values.join(', ')
      continue
    }

    if (!SINGLE_VALUED.has(field)) {
      mapped[field] = values.join(', ')
      continue
    }

    mapped[field] = values[0] ?? ''

    // The old code took values[0] and dropped the rest with no trace. A second
    // phone number on a lead is unlikely, but "unlikely" is not a reason to
    // lose a buyer's contact detail -- parking it keeps the normalized field
    // usable (phonesMatch and the WhatsApp send both need ONE number) while
    // still surfacing the extras to whoever reads the lead.
    if (values.length > 1) {
      console.warn(`[meta-lead] field "${name}" carried ${values.length} values; kept the first, parked the rest`)
      mapped.customFields[`${name}_additional`] = values.slice(1).join(', ')
    }
  }

  // Only when the form used the split keys AND had no whole-name question.
  const composed = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (composed && !mapped.name) mapped.name = composed

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

  // An empty field_data is Meta answering before the lead's answers have
  // propagated, not a lead who submitted an empty form -- every Lead Ads form
  // has at least one question, and a permissions failure comes back as an
  // error rather than as an empty array.
  //
  // Persisting it as-is was the bug: a record with no name, phone or email,
  // marked permanently processed, showing up in the CRM looking like real
  // signal with no path to backfill it.
  let fieldDataUnavailable = false
  if (fieldData.length === 0) {
    const attempt = await countWebhookAttempt(emptyFieldDataCounterKey(leadgenId), 'meta', 'leadgen')

    if (attempt < MAX_EMPTY_FIELD_DATA_ATTEMPTS) {
      // NOT marked processed, exactly like the fetch failure above -- this is
      // the same "come back and try again" answer to Meta.
      console.warn(
        `Meta webhook: empty field_data for ${leadgenId} on attempt ${attempt}/${MAX_EMPTY_FIELD_DATA_ATTEMPTS}, asking Meta to redeliver`
      )
      return { retryable: true }
    }

    // Accepted rather than dropped: losing the lead entirely is worse than
    // recording that one arrived. The marker below is what stops it reading as
    // a normal lead whose buyer simply left every field blank.
    console.error(
      `Meta webhook: field_data still empty for ${leadgenId} after ${attempt} attempts, saving the lead without answers`
    )
    fieldDataUnavailable = true
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
    customFields: JSON.stringify({
      ...mapped.customFields,
      // Read by a human in the CRM, not by code: it says "this lead is real,
      // its answers are not here, go look it up in Ads Manager" rather than
      // leaving a blank row that looks like a lead who typed nothing.
      ...(fieldDataUnavailable ? { _fieldDataUnavailable: 'Meta returned no answers for this lead' } : {}),
    }),
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
