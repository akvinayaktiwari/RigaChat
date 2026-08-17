import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import { NAME_RE, PHONE_RE, captureLeadViaWidget, openWidget } from './helpers/widget.js'
import { sendInboundMessage, type WebhookTarget } from './helpers/meta-webhook.js'
import { signInWithIdToken } from './helpers/dashboard.js'

// The whole WhatsApp loop in one run, and the frames to show for it.
//
// scripts/test-meta-journey-run.sh already proves this path at the AWS level.
// What it cannot do is produce a picture, run unattended, or fail in a way that
// names the step -- and the pictures are the point as much as the pass, because
// they are the frames used in client meetings.
//
// THE INBOUND SIDE IS DRIVEN BY A SIGNED WEBHOOK, not a handset (option 1 of the
// two the issue put up). That covers everything from the webhook boundary
// inward -- signature check, lead resolution, the agent turn, KB retrieval,
// journey resume -- and stops short of only Meta's own delivery. The handset
// version stays available as the shell script, which is the right home for a
// check that needs a human anyway.
//
// DELIBERATELY NOT IN THE DEFAULT SUITE. It writes a permanent lead into a real
// CRM -- there is no delete path for a lead anywhere in the product (TODOS.md).
// Requires JOURNEY_E2E=1, same guard as journey-lead-capture.spec.ts.

const enabled = process.env.JOURNEY_E2E === '1'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
const apiBase = process.env.E2E_API_BASE ?? baseUrl
const botId = process.env.BOT_ID ?? ''
const idToken = process.env.E2E_ID_TOKEN ?? ''
const appSecret = process.env.META_APP_SECRET ?? ''
const phoneNumberId = process.env.META_PHONE_NUMBER_ID ?? ''
const wabaId = process.env.META_WABA_ID ?? ''
const templateId = process.env.TEMPLATE_ID ?? 'real-estate-lead-qualification-v1'
const region = process.env.AWS_REGION ?? 'ap-south-1'

const leadName = process.env.LEAD_NAME ?? 'Loop E2E Test'
const leadPhone = process.env.LEAD_PHONE ?? ''
const leadEmail = process.env.LEAD_EMAIL ?? 'loop-e2e@example.com'

const shotsDir = path.resolve(process.env.E2E_SCREENSHOT_DIR ?? 'screenshots')

// Meta sends the wa_id with no '+' and no separators, and inbound lead matching
// compares against that form. Deriving it here rather than asking for the
// number twice keeps the two from drifting.
const fromWaId = leadPhone.replace(/[^0-9]/g, '')

const webhook: WebhookTarget = { baseUrl: apiBase, appSecret }

// Named per step so the directory reads as the story in order, which is what
// makes them usable in a deck without renaming anything.
let stepNumber = 0
async function shoot(page: Page, name: string): Promise<void> {
  stepNumber += 1
  const file = path.join(shotsDir, `${String(stepNumber).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log(`  📸 ${file}`)
}

interface ApiResult<T> {
  success: boolean
  data?: T
  error?: string
}

async function api<T>(method: string, route: string, body?: unknown): Promise<ApiResult<T>> {
  const response = await fetch(`${apiBase}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return (await response.json().catch(() => ({ success: false, error: `non-JSON ${response.status}` }))) as ApiResult<T>
}

interface LeadEventRow {
  type: string
  body?: string
  status?: string
  stepId?: string
}

// Polls the timeline API rather than the page, because the agent's reply lands
// asynchronously and the dashboard is opened once at the end. This is the same
// data the page renders -- it IS the assertion the screenshot illustrates.
async function waitForEvent(
  leadId: string,
  predicate: (events: LeadEventRow[]) => boolean,
  description: string,
  timeoutMs = 120_000
): Promise<LeadEventRow[]> {
  const deadline = Date.now() + timeoutMs
  let latest: LeadEventRow[] = []

  while (Date.now() < deadline) {
    const result = await api<LeadEventRow[]>(
      'GET',
      `/api/leads/events?source=chat&leadId=${encodeURIComponent(leadId)}&botId=${encodeURIComponent(botId)}`
    )
    latest = result.data ?? []
    if (predicate(latest)) return latest
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  // Dumping what DID arrive turns "timed out" into a diagnosis. Almost every
  // failure here is a missing piece of config, and the events say which.
  throw new Error(
    `${description} — timed out after ${timeoutMs}ms. Timeline held:\n${latest
      .map((event) => `  ${event.type} ${event.status ?? ''} ${(event.body ?? '').slice(0, 60)}`)
      .join('\n')}`
  )
}

let bundleId = ''
let leadId = ''
// Whether THIS run published the bundle. Cleanup deletes only what it created:
// unpublishing a client's live journey because a test borrowed it would be a
// far worse outcome than a leaked test bundle.
let armedByThisRun = false

test.describe('the full WhatsApp loop, end to end', () => {
  test.skip(!enabled, 'set JOURNEY_E2E=1 — this writes a permanent lead to a real CRM')

  test.beforeAll(() => {
    mkdirSync(shotsDir, { recursive: true })

    // Every one of these has produced a failure that pointed somewhere else.
    expect(botId, 'BOT_ID must be set').not.toBe('')
    expect(idToken, 'E2E_ID_TOKEN must be set — see e2e/README.md for where to get one').not.toBe('')
    expect(appSecret, 'META_APP_SECRET must be set (it signs the inbound webhook)').not.toBe('')
    expect(phoneNumberId, 'META_PHONE_NUMBER_ID must be set — it is how inbound resolves to a client').not.toBe('')
    expect(wabaId, 'META_WABA_ID must be set').not.toBe('')
    expect(leadPhone, 'LEAD_PHONE must be set').not.toBe('')
    expect(leadPhone, `LEAD_PHONE must match ${PHONE_RE} (no spaces or dashes)`).toMatch(PHONE_RE)
    expect(leadName, `LEAD_NAME must match ${NAME_RE} (letters and spaces only)`).toMatch(NAME_RE)
  })

  test('capture, converse, advance, and show it on the dashboard', async ({ page }) => {
    // Six network round trips plus two model turns plus a journey resume. The
    // default 30s is not in the right order of magnitude.
    test.setTimeout(600_000)

    // --- ARM ------------------------------------------------------------
    // A journey has to be published and owning its trigger before a lead is
    // captured. Ignition is a point read on journey_trigger_claims at capture
    // time, so arming afterwards would be a no-op that looks like a bug.
    //
    // If the bot ALREADY has a published journey, use it rather than publishing
    // a second one. Exactly one bundle may own a trigger -- that is what stops
    // a lead getting two sets of outreach -- so a bot in real use will always
    // reject a test's own publish. Borrowing the live journey is also the more
    // honest test: it exercises what is actually running for this bot.
    const existing = await api<{ bundleId: string; status: string }[]>('GET', `/api/journeys/${botId}`)
    const live = (existing.data ?? []).find((bundle) => bundle.status === 'published')

    if (live) {
      bundleId = live.bundleId
      console.log(`  using the journey already published on this bot: ${bundleId}`)
    } else {
      const cloned = await api<{ bundleId: string }>('POST', `/api/journeys/from-template/${templateId}`, { botId })
      expect(cloned.success, `cloning the template failed: ${cloned.error ?? ''}`).toBe(true)
      bundleId = cloned.data?.bundleId ?? ''
      expect(bundleId, 'clone returned no bundleId').not.toBe('')

      const published = await api('POST', `/api/journeys/${botId}/${bundleId}/publish`, {})
      expect(published.success, `publishing failed: ${published.error ?? ''}`).toBe(true)
      armedByThisRun = true
      console.log(`  published a journey for this run: ${bundleId}`)
    }

    // --- CAPTURE --------------------------------------------------------
    await openWidget(page, botId)
    await shoot(page, 'widget-open')

    leadId = await captureLeadViaWidget(page, { name: leadName, phone: leadPhone, email: leadEmail })
    await shoot(page, 'lead-captured')

    // The journey greets on ignition. Waiting for it here rather than assuming
    // it separates "the journey never started" from "the agent never answered",
    // which otherwise both surface as the same timeout two steps later.
    await waitForEvent(
      leadId,
      (events) => events.some((event) => event.type === 'message_out'),
      'the journey never sent its greeting — check the bundle published and claimed its trigger'
    )

    // --- TURN ONE: the lead asks something the KB can answer -------------
    const QUESTION = 'What amenities does the property have?'
    // The answer has to be ABOUT amenities. A journey's authored line ("Would
    // you like to see the property in person?") is a perfectly good message and
    // a completely useless answer, and counting outbound messages cannot tell
    // the two apart -- which is how the first green run of this spec passed
    // while the agent never consulted the knowledge base at all.
    const ANSWERS_THE_QUESTION = /amenit|gym|pool|club|garden|park|facilit|security|lift|court/i

    await sendInboundMessage(webhook, { fromWaId, text: QUESTION, phoneNumberId, wabaId })

    const afterFirst = await waitForEvent(
      leadId,
      (events) =>
        events.some((event) => event.type === 'message_out' && ANSWERS_THE_QUESTION.test(event.body ?? '')),
      'no outbound message actually ANSWERED the question. If a message went out but was the journey’s ' +
        'authored line instead, the published journey was compiled before the agent could compose: its state ' +
        'machine threads no lastResult, so composedReply never reaches send_message and messageHint always ' +
        'wins. Republish the bundle to recompile it. Otherwise check the 24h session window: this spec forges the ' +
        'inbound webhook, which opens the window in OUR records (whatsapp_inbound_activity) but NOT on Meta’s ' +
        'side — so a free-text reply is rejected with error 131047 unless a real message was sent from ' +
        'LEAD_PHONE to the business number within the last 24h. See e2e/README.md. If the window is genuinely ' +
        'open, then check the Agent binding and the KB namespace'
    )
    expect(
      afterFirst.some((event) => event.type === 'message_in' && /amenities/i.test(event.body ?? '')),
      'the inbound message never reached the timeline'
    ).toBe(true)

    // Stated as its own assertion so a failure reads as "the agent did not
    // answer" rather than "a wait timed out".
    expect(
      afterFirst.find((event) => event.type === 'message_out' && ANSWERS_THE_QUESTION.test(event.body ?? ''))?.body,
      'no outbound message was grounded in the knowledge base'
    ).toBeTruthy()

    // --- TURN TWO: the reply the journey is parked on --------------------
    await sendInboundMessage(webhook, { fromWaId, text: 'Saturday works for me', phoneNumberId, wabaId })

    await waitForEvent(
      leadId,
      (events) => events.filter((event) => event.type === 'message_in').length >= 2,
      'the second inbound message never landed'
    )

    // --- DASHBOARD ------------------------------------------------------
    await signInWithIdToken(page, baseUrl, idToken)
    await page.goto(`${baseUrl}/dashboard/leads/${leadId}?source=chat&botId=${encodeURIComponent(botId)}`)

    const timeline = page.getByTestId('lead-timeline')
    await expect(timeline, 'the Activity card never rendered at all').toBeVisible({ timeout: 30_000 })

    // data-state, not just visibility. The card renders in four states and
    // three of them are visible while showing no timeline -- an error card
    // would otherwise pass a bare toBeVisible and fail confusingly further
    // down. This is the assertion that would have caught the /api/leads/events
    // 400 that shipped in #13.
    await expect(
      timeline,
      'the timeline rendered, but not with events — check /api/leads/events is not erroring'
    ).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })

    // The three things the card exists to show: what was said, that it was
    // delivered, and what the agent did about it.
    await expect(timeline, 'the lead’s own words are missing from the timeline').toContainText(/amenities/i)

    // Delivery state renders as a tick ICON carrying an aria-label, not as
    // text -- message_status rows are folded onto the bubble they belong to
    // rather than listed. Asserting on text here would never match.
    await expect(
      timeline.locator('[aria-label="sent"], [aria-label="delivered"], [aria-label="read"]').first(),
      'no delivery state on any outbound message — the status webhook never correlated by wamid'
    ).toBeVisible({ timeout: 30_000 })

    // The journey's own steps, in client language. Their absence means the
    // journey never advanced even though the messages flowed.
    await expect(timeline, 'no journey step ever rendered — the journey did not advance').toContainText(
      /waiting for a reply|sent|greeting/i
    )

    await shoot(page, 'dashboard-timeline')

    console.log(`\n  lead ${leadId} — bundle ${bundleId}`)
    console.log(`  screenshots in ${shotsDir}\n`)
  })

  // Runs even when the test above fails, which is the point: a failed run that
  // leaves its bundle published keeps owning the trigger, and the NEXT run
  // cannot claim it. One bad run would otherwise poison every run after it.
  test.afterAll(async () => {
    if (bundleId && armedByThisRun) {
      const deleted = await api('DELETE', `/api/journeys/${botId}/${bundleId}`)
      console.log(deleted.success ? `  cleaned up bundle ${bundleId}` : `  ⚠ bundle ${bundleId} NOT deleted`)
    } else if (bundleId) {
      console.log(`  left bundle ${bundleId} published — it was already live before this run`)
    }

    // Deleting the bundle releases the trigger claim, but NOT a callback token
    // parked on await_reply -- nothing calls back to clean that up. Its TTL is
    // 24h, and until it expires claimPendingReply's attribute_not_exists guard
    // rejects the next journey on this lead with a PendingReplyConflictError
    // from a bundle that no longer exists. Observed on the 2026-08-16 run.
    if (leadId) {
      try {
        execFileSync(
          'aws',
          [
            'dynamodb',
            'delete-item',
            '--region',
            region,
            '--table-name',
            'journey_pending_replies',
            '--key',
            JSON.stringify({ leadId: { S: leadId } }),
          ],
          { stdio: 'ignore' }
        )
        console.log(`  released the parked callback token for ${leadId}`)
      } catch {
        console.log('  ⚠ could not clear journey_pending_replies (needs the aws CLI) — it will TTL out within 24h')
      }
    }

    // Stated rather than silently accepted: this is the one thing the test
    // cannot undo, and it is worth knowing before pointing this at a real
    // client account.
    if (leadId) console.log(`  ⚠ lead ${leadId} is PERMANENT — no delete path exists (TODOS.md)`)
  })
})
