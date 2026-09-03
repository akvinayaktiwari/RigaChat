// Re-exported so existing importers keep working now that the class lives
// with the rest of the connect failures.
export { MetaPageAlreadyConnectedError } from '../lib/meta-connect-errors.js'
import {
  MetaPageAlreadyConnectedError,
  MetaPagesLookupError,
  MetaTooManyPagesError,
  MetaUserTokenExpiredError,
} from '../lib/meta-connect-errors.js'
import { metaProvider } from '../providers/meta-provider.js'
import { mapMetaFieldData } from '../lib/meta-field-mapping.js'
import type { MetaFieldDatum } from '../lib/meta-field-mapping.js'
import { getCachedFormQuestions, setCachedFormQuestions } from '../repositories/redis-repository.js'
import { getProvider, syncLeadToCRMWithRetry } from './crm-service.js'
import { sendLeadNotification } from './lead-notification-service.js'
import { igniteJourneysForLead } from './journey-ignition-service.js'
import { decrypt, encrypt } from '../lib/kms.js'
import { getClientById, removeClientMetaConnection, updateClient } from '../repositories/client-repository.js'
import {
  createMetaLead,
  getClientIdForPage,
  getClientIdsForPages,
  getPageRegistration,
  markPageVerified,
  listPagesForClient,
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
  MetaConnectPagesResult,
  MetaFormQuestion,
  MetaPageSkipped,
  MetaPageSummary,
  MetaSelectablePage,
  MetaPageRepaired,
  MetaSubscriptionReport,
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

// Reads every form on the Page and caches its schema, so the field mapper has
// Meta's declared question types from the FIRST lead rather than paying a Graph
// call on the lead-capture path.
//
// Possible because a lead form exists as soon as the client builds the ad --
// it does not need a submission to be readable -- so connect time is the
// earliest and cheapest moment to do this.
//
// Best-effort in every direction: it is awaited so the Lambda cannot freeze
// mid-flight, but no failure it can produce is allowed to fail the connection.
// A Page connects fine with no schemas cached; the mapper just falls back to
// its keyword and value-shape layers until the per-lead fetch fills them in.
async function prewarmFormSchemas(pageId: string, pageAccessToken: string): Promise<void> {
  try {
    const forms = await metaProvider.fetchPageLeadgenForms(pageId, pageAccessToken)

    if (forms.length === 0) {
      // Either the Page genuinely has no forms yet, or pages_manage_ads is not
      // granted. The provider has already logged which.
      console.log(`[meta-connect] no lead form schemas cached for page ${pageId}`)
      return
    }

    let cached = 0
    for (const form of forms) {
      if (form.questions.length === 0) continue
      await setCachedFormQuestions(form.formId, form.questions)
      cached += 1
    }

    console.log(`[meta-connect] cached ${cached}/${forms.length} lead form schemas for page ${pageId}`)
  } catch (error) {
    console.error(`[meta-connect] form schema prewarm failed for page ${pageId}:`, error)
  }
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

  // AFTER the client record is written, because the connection is complete
  // without it. Ordering it earlier would let a Graph API hiccup on an optional
  // cache warm delay -- or, if it ever threw, prevent -- a connection that has
  // already claimed the Page and subscribed its webhook.
  await prewarmFormSchemas(pageId, pageAccessToken)
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


// ---------------------------------------------------------------------------
// M3 -- multi-Page connect and management (issue #28)
// ---------------------------------------------------------------------------

// A batch size, not a product ceiling. Each Page costs a webhook subscription
// round trip against LAMBDA_BUDGET_MS; a client with 60 Pages connects
// them in three passes rather than being told 25 is all they may ever have.
export const MAX_PAGES_PER_CONNECT = 25

// Each Page costs a Graph round trip, so 25 of them one after another is a
// real chance of spending the whole LAMBDA_BUDGET_MS and timing out
// mid-batch -- leaving some Pages claimed and subscribed and the rest not,
// with nothing to roll them back. Bounded rather than unbounded: firing all 25
// at once only trades the timeout risk for a Graph rate-limit risk.
const PAGE_WORK_CONCURRENCY = 5

// The deployed Lambda timeout. Used only to judge how close a batch came to it,
// so the log says "80% of budget" rather than an unanchored millisecond count.
const LAMBDA_BUDGET_MS = 60_000

// Stop starting new Pages past this point.
//
// LAMBDA_BUDGET_MS used to be a cliff: the batch either finished or the process
// was killed mid-Page, and a kill lands between the claim and the webhook
// subscription -- leaving a Page that reads Connected and receives nothing,
// with the rollback killed alongside it. Checked instead of hoped for, running
// out of time becomes a reported outcome the client can act on. The 15s margin
// covers the Page already in flight plus the response.
const BATCH_DEADLINE_MS = 45_000

/**
 * Runs `work` over `items` with at most `limit` in flight, preserving input
 * order in the result. Order matters here because the connected/skipped lists
 * are read back by a human in the dashboard.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function runner(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) return
      results[index] = await work(item)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner))
  return results
}

/** Exchanges the OAuth code and KEEPS the user token, so Pages stay manageable. */
export async function beginMetaConnection(clientId: string, code: string): Promise<void> {
  const userToken = await metaProvider.exchangeCodeForLongLivedUserToken(code)
  await updateClient(clientId, { metaUserTokenEncrypted: await encrypt(userToken) })
}

async function requireUserToken(clientId: string): Promise<string> {
  const client = await getClientById(clientId)
  if (!client?.metaUserTokenEncrypted) {
    throw new MetaUserTokenExpiredError()
  }
  return decrypt(client.metaUserTokenEncrypted)
}

/**
 * Graph rejecting the token is the expiry case, and it must surface as
 * "reconnect" rather than as an empty Page list or a generic 500.
 *
 * Shared by both callers deliberately: connectMetaPages fetched without this
 * and turned an expiry between opening the picker and pressing Connect into a
 * 500, which the dashboard renders as "could not reach Meta" with no way back.
 * The token can be minutes from expiry while the picker sits open.
 */
async function fetchPagesOrExpired(
  userToken: string
): Promise<Awaited<ReturnType<typeof metaProvider.fetchAllManageablePages>>> {
  try {
    return await metaProvider.fetchAllManageablePages(userToken)
  } catch (error) {
    if (error instanceof MetaPagesLookupError) {
      throw new MetaUserTokenExpiredError()
    }
    throw error
  }
}

/**
 * Every Page this person administers, marked with what we already know.
 *
 * Served from the stored user token, so this is the SAME endpoint whether the
 * client is finishing their first connect or adding a Page three weeks later.
 * That is the whole point of keeping the token.
 */
export async function listSelectablePages(clientId: string): Promise<MetaSelectablePage[]> {
  const userToken = await requireUserToken(clientId)

  const pages = await fetchPagesOrExpired(userToken)

  const mine = new Set((await listPagesForClient(clientId)).map((p) => p.pageId))

  // One batched read for everything we do not already own, rather than a point
  // read per Page. An agency administering 300 Pages opened 300 concurrent
  // DynamoDB reads on every picker open.
  const owners = await getClientIdsForPages(pages.filter((p) => !mine.has(p.pageId)).map((p) => p.pageId))

  return pages.map((page) => {
    const owner = mine.has(page.pageId) ? clientId : (owners.get(page.pageId) ?? null)
    return {
      pageId: page.pageId,
      pageName: page.pageName,
      connected: owner === clientId,
      unavailable: Boolean(owner) && owner !== clientId,
    }
  })
}

/**
 * Connects a selected set of Pages.
 *
 * Partial success is deliberate: a Page claimed by another account is SKIPPED
 * with a reason, never fatal. Failing the whole batch would let one conflicting
 * Page block 24 legitimate ones, punishing the client for something they can
 * neither see nor fix.
 */
export async function connectMetaPages(
  clientId: string,
  pageIds: string[]
): Promise<MetaConnectPagesResult> {
  if (pageIds.length > MAX_PAGES_PER_CONNECT) {
    throw new MetaTooManyPagesError(pageIds.length, MAX_PAGES_PER_CONNECT)
  }

  const startedAt = Date.now()
  const userToken = await requireUserToken(clientId)
  const available = await fetchPagesOrExpired(userToken)
  const wanted = available.filter((p) => pageIds.includes(p.pageId))

  type PageOutcome = { connected: MetaPageSummary } | { skipped: MetaPageSkipped }

  const outcomes = await mapWithConcurrency<typeof wanted[number], PageOutcome>(
    wanted,
    PAGE_WORK_CONCURRENCY,
    async (page) => {
      // Checked before the claim, never between the claim and the subscribe:
      // stopping in that gap would create exactly the state this guard exists
      // to prevent.
      if (Date.now() - startedAt > BATCH_DEADLINE_MS) {
        return { skipped: { pageId: page.pageId, pageName: page.pageName, reason: 'batch_budget_exceeded' } }
      }

      // Claim first, exactly as the single-Page path does: the atomic condition
      // is the real guarantee, and claiming before any other write means a lost
      // race never leaves a half-connected Page behind.
      try {
        await setPageClientMapping(page.pageId, clientId, {
          pageName: page.pageName,
          pageAccessTokenEncrypted: await encrypt(page.pageAccessToken),
        })
      } catch (error) {
        if (error instanceof MetaPageConflictError) {
          return {
            skipped: {
              pageId: page.pageId,
              pageName: page.pageName,
              reason: 'already_connected_to_another_account',
            },
          }
        }
        throw error
      }

      // Without this subscription Meta never delivers a single leadgen event for
      // the Page, and the failure is invisible: the dashboard says connected and
      // no lead ever arrives. Release the claim rather than leave that state.
      try {
        await metaProvider.subscribePageToWebhook(page.pageId, page.pageAccessToken)
      } catch (error) {
        console.error(`[meta-connect] subscribe failed for page ${page.pageId}:`, error)
        await removePageClientMapping(page.pageId)
        return { skipped: { pageId: page.pageId, pageName: page.pageName, reason: 'subscribe_failed' } }
      }

      const now = new Date().toISOString()
      return {
        connected: {
          pageId: page.pageId,
          clientId,
          pageName: page.pageName,
          connectedAt: now,
          lastVerifiedAt: now,
        },
      }
    }
  )

  const connected: MetaPageSummary[] = []
  const skipped: MetaPageSkipped[] = []
  for (const outcome of outcomes) {
    if ('connected' in outcome) connected.push(outcome.connected)
    else skipped.push(outcome.skipped)
  }

  // The number that answers "does a full batch fit in the Lambda?" from real
  // traffic rather than from arithmetic. A batch killed by the timeout leaves
  // no log line at all, so a run that stops appearing here IS the signal.
  const elapsedMs = Date.now() - startedAt
  console.log(
    `[meta-connect] batch complete: ${wanted.length} page(s) in ${elapsedMs}ms ` +
      `(concurrency ${PAGE_WORK_CONCURRENCY}, ${connected.length} connected, ${skipped.length} skipped, ` +
      `${Math.round(elapsedMs / Math.max(wanted.length, 1))}ms/page, budget ${LAMBDA_BUDGET_MS}ms)`
  )
  const ranOutOfTime = skipped.filter((p) => p.reason === 'batch_budget_exceeded').length
  if (ranOutOfTime > 0) {
    console.warn(
      `[meta-connect] deadline hit after ${elapsedMs}ms: ${ranOutOfTime} page(s) not attempted. ` +
        `The client can reconnect them; nothing was left half-written.`
    )
  }
  if (elapsedMs > LAMBDA_BUDGET_MS * 0.5) {
    console.warn(
      `[meta-connect] batch used ${Math.round((elapsedMs / LAMBDA_BUDGET_MS) * 100)}% of the Lambda budget ` +
        `for ${wanted.length} page(s) -- a larger batch may not finish`
    )
  }

  return { connected, skipped }
}

/**
 * How stale a verification may be before we re-check with Meta.
 *
 * The point of the window is that the repair costs one Graph call per Page, so
 * an unbounded check would put a call per Page on every dashboard load. Twelve
 * hours keeps a broken Page invisible for at most half a day while making the
 * common case free.
 */
const VERIFY_STALE_AFTER_MS = 12 * 60 * 60 * 1000

// This pass runs while a client waits for their dashboard, and it costs a Graph
// call per Page. Both bounds exist because a client's Pages all go stale
// TOGETHER -- they were connected in one batch, so they cross the 12h boundary
// in one batch -- which makes "one Page at a time" the wrong mental model and
// "the whole account at once" the real one. Unbounded, 500 Pages is 100
// sequential waves and blows the same Lambda budget connectMetaPages guards.
const VERIFY_MAX_PER_PASS = 40
const VERIFY_DEADLINE_MS = 20_000

/**
 * Finds Pages that are claimed in our registry but not actually subscribed at
 * Meta, and re-subscribes them.
 *
 * This is the state a Lambda timeout can leave behind: connectMetaPages claims
 * a Page, then subscribes it, and rolls the claim back if subscribing THROWS --
 * but a timeout kills the rollback along with the process. The Page is left
 * showing "Connected" in the dashboard while Meta delivers nothing for it, and
 * a retry makes it worse, because the picker shows it already ticked so the
 * client has no way to act on it.
 *
 * Also repairs the same shape from any other cause: an admin revoking and
 * regranting the app, or Meta dropping a subscription on its own.
 */
export async function reconcilePageSubscriptions(clientId: string): Promise<MetaSubscriptionReport> {
  const rows = await listPagesForClient(clientId)
  const now = Date.now()

  const stale = rows
    .filter((row) => {
      // A row with no token cannot be checked -- nothing to authenticate the
      // Graph call with. Those are the pre-registry rows the backfill skipped.
      if (!row.pageAccessTokenEncrypted) return false
      if (!row.lastVerifiedAt) return true
      return now - new Date(row.lastVerifiedAt).getTime() > VERIFY_STALE_AFTER_MS
    })
    // Oldest first, so a capped pass makes real progress instead of re-checking
    // the same arbitrary slice on every dashboard load.
    .sort((a, b) => (a.lastVerifiedAt ?? '').localeCompare(b.lastVerifiedAt ?? ''))

  const due = stale.slice(0, VERIFY_MAX_PER_PASS)
  const startedAt = Date.now()

  const repaired: MetaPageRepaired[] = []
  const unrepairable: string[] = []
  let skippedForTime = 0

  await mapWithConcurrency(due, PAGE_WORK_CONCURRENCY, async (row) => {
    // Same guard connectMetaPages uses, for the same reason: being killed
    // mid-pass wastes the work and tells the client nothing. Stopping early is
    // free here because every step is idempotent -- the next load resumes.
    if (Date.now() - startedAt > VERIFY_DEADLINE_MS) {
      skippedForTime += 1
      return
    }

    try {
      const token = await decrypt(row.pageAccessTokenEncrypted as string)
      if (await metaProvider.isPageSubscribedToLeadgen(row.pageId, token)) {
        await markPageVerified(row.pageId)
        return
      }

      console.warn(`[meta-verify] page ${row.pageId} was claimed but not subscribed; re-subscribing`)
      await metaProvider.subscribePageToWebhook(row.pageId, token)
      await markPageVerified(row.pageId)
      // Named, not just counted: the client needs to know WHICH Pages were
      // silently dropping leads to judge how much history to worry about.
      repaired.push({ pageId: row.pageId, pageName: row.pageName ?? row.pageId })
    } catch (error) {
      // Never throw: this runs alongside a normal dashboard read, and a Page we
      // cannot check must not take the whole page down with it.
      console.error(`[meta-verify] could not verify page ${row.pageId}:`, error)
      unrepairable.push(row.pageId)
    }
  })

  const remaining = stale.length - due.length + skippedForTime
  if (remaining > 0) {
    console.log(`[meta-verify] ${remaining} page(s) still due; the next dashboard load continues`)
  }

  return { checked: due.length - skippedForTime, repaired, unrepairable, remaining }
}

/** The client's connected Pages, without their tokens. */
export async function listConnectedPages(clientId: string): Promise<MetaPageSummary[]> {
  const rows = await listPagesForClient(clientId)
  return rows.map(({ pageAccessTokenEncrypted: _omit, ...summary }) => ({
    ...summary,
    // A pre-registry row the backfill skipped has no name. Falling back to the
    // pageId keeps the dashboard showing SOMETHING identifiable rather than the
    // literal string "undefined", which is what shipped when this type claimed
    // pageName was always present.
    pageName: summary.pageName ?? summary.pageId,
    lastVerifiedAt: summary.lastVerifiedAt ?? summary.connectedAt,
  }))
}

/** Disconnects ONE Page, leaving the client's others untouched. */
export async function disconnectMetaPage(clientId: string, pageId: string): Promise<void> {
  const registration = await getPageRegistration(pageId)

  // Only touch a row that still belongs to this client. Otherwise a stale local
  // view would let one tenant delete another tenant's live lead routing.
  if (!registration || registration.clientId !== clientId) return

  if (registration.pageAccessTokenEncrypted) {
    try {
      await metaProvider.unsubscribePageFromWebhook(
        pageId,
        await decrypt(registration.pageAccessTokenEncrypted)
      )
    } catch (error) {
      // Best effort: a Page whose token was already revoked cannot be
      // unsubscribed, and that must not stop the client removing it.
      console.warn(`[meta-disconnect] unsubscribe failed for page ${pageId}:`, error)
    }
  }

  await removePageClientMapping(pageId)
}

/** Disconnects every Page AND drops the stored user token. */
export async function disconnectAllMetaPages(clientId: string): Promise<void> {
  const pages = await listPagesForClient(clientId)

  // allSettled over a sequential loop for two reasons. One Page failing must
  // not abort the rest -- and, more importantly, must not skip the token
  // deletion below. A loop that threw on Page 1 left the client told
  // "disconnected" while we kept a live credential that can still enumerate
  // their Facebook assets.
  const results = await Promise.allSettled(
    pages.map((page) => disconnectMetaPage(clientId, page.pageId))
  )
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  for (const failure of failures) {
    console.error('[meta-disconnect] page removal failed:', failure.reason)
  }

  // A connect running in another tab can land a Page AFTER the snapshot above
  // and before the token is deleted below. That Page would stay registered and
  // stay subscribed -- and because it carries its own Page token, its leads
  // keep arriving long after the client was told everything was disconnected.
  // One re-sweep closes the window; the Page token is what makes this matter,
  // since deleting the user token does not stop it.
  const stragglers = await listPagesForClient(clientId)
  if (stragglers.length > 0) {
    console.warn(`[meta-disconnect] ${stragglers.length} Page(s) appeared mid-disconnect for ${clientId}`)
    await Promise.allSettled(stragglers.map((page) => disconnectMetaPage(clientId, page.pageId)))
  }

  // "Disconnect" has to mean disconnected. Keeping a live credential that can
  // enumerate someone's Facebook assets after they asked us to stop is not
  // something a customer would expect, and not defensible in a review. This
  // runs even when some Pages failed above, deliberately.
  await updateClient(clientId, { metaUserTokenEncrypted: undefined })
  await removeClientMetaConnection(clientId)

  // Reported only after the credential is gone, so the client sees the truth:
  // the account is disconnected, but these Pages need another look.
  if (failures.length > 0) {
    throw new Error(
      `Disconnected the account, but ${failures.length} of ${pages.length} Page(s) could not be removed. Try again, or remove them individually.`
    )
  }
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

// Reads the form's questions, preferring the cache. Never throws and never
// returns a partial answer: an empty array means "map without the schema",
// which is the pre-schema behaviour rather than a failure.
async function loadFormSchema(formId: string | undefined, pageAccessToken: string): Promise<MetaFormQuestion[]> {
  // Meta has always sent form_id on a leadgen change, but it is optional in the
  // payload shape and this runs on the lead-capture path -- so its absence is a
  // degraded mapping, not an error.
  if (!formId) return []

  const cached = await getCachedFormQuestions(formId)
  if (cached) return cached

  const questions = await metaProvider.fetchFormQuestions(formId, pageAccessToken)
  if (questions.length > 0) await setCachedFormQuestions(formId, questions)

  return questions
}

async function processSingleLeadgenEvent(
  pageId: string,
  leadgenId: string,
  formId: string | undefined
): Promise<{ retryable: boolean }> {
  const key = idempotencyKey(leadgenId)

  if (await hasProcessed(key)) {
    return { retryable: false }
  }

  const registration = await getPageRegistration(pageId)
  if (!registration) {
    console.log(`Meta webhook: no client mapped for page ${pageId}, ignoring`, { leadgenId })
    await markProcessed(key, 'meta', 'leadgen')
    return { retryable: false }
  }

  const clientId = registration.clientId
  const client = await getClientById(clientId)
  if (!client) {
    console.log(`Meta webhook: client ${clientId} no longer exists, ignoring`, { leadgenId })
    await markProcessed(key, 'meta', 'leadgen')
    return { retryable: false }
  }

  // The REGISTRATION is the connection, not client.metaConnection. The row is
  // written only after the Page's webhook subscription succeeds and is deleted
  // on disconnect, so reaching this line already means "this Page is connected
  // to this client". Gating on client.metaConnection.connected instead would
  // drop every lead for a client connected through the multi-Page picker, which
  // never writes that field -- the same silent lead loss this whole change set
  // exists to end, one layer up.
  //
  // Rows written before the registry carry no token of their own, so fall back
  // to the client's single connection for them; the backfill removes that case
  // and the fallback goes with metaConnection after the soak week.
  const pageAccessTokenEncrypted =
    registration.pageAccessTokenEncrypted ?? client.metaConnection?.pageAccessTokenEncrypted
  if (!pageAccessTokenEncrypted) {
    // Unrecoverable without a reconnect, so do not let Meta redeliver for 36
    // hours against a token we do not have. Loud, because a connected Page with
    // no token is a broken connection the client cannot see.
    console.error(`Meta webhook: no access token for page ${pageId}, ignoring`, { leadgenId, clientId })
    await markProcessed(key, 'meta', 'leadgen')
    return { retryable: false }
  }

  // The Page's own name, from the row the webhook's pageId resolved to. Reading
  // it off client.metaConnection would label a lead from any Page with whichever
  // Page happened to connect first.
  const pageLabel = registration.pageName ?? client.metaConnection?.pageName ?? pageId

  let fieldData: MetaFieldDatum[]
  let pageAccessToken: string
  try {
    pageAccessToken = await decrypt(pageAccessTokenEncrypted)
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

  // The authoritative layer: Meta's own declared type per question. Fetched
  // after the retry gate above, so a lead that is going to be redelivered does
  // not cost a schema call it will make again.
  const schema = await loadFormSchema(formId, pageAccessToken)

  const mapped = mapMetaFieldData(fieldData, schema)
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
    leadRef: { source: 'meta', pageId, leadId: metaLead.leadId },
    source: `Meta Lead Ads (${pageLabel})`,
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
        const { retryable } = await processSingleLeadgenEvent(pageId, leadgenId, change.value.form_id)
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
