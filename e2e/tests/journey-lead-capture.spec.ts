import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { test, expect, type Page, type Locator } from '@playwright/test'

// Phase 1 of the Meta-transport journey seam test, through the REAL widget.
//
// scripts/test-meta-journey-run.sh's `ignite` phase POSTs /api/leads directly,
// which skips the widget entirely and therefore assumes four links work that
// have never been checked together: widget mount -> chat -> the server-side
// lead trigger -> the capture POST. This drives all of them, and hands the
// resulting leadId back to that script so `watch` can pick the journey up.
//
// DELIBERATELY NOT IN THE DEFAULT SUITE. It writes a permanent lead into a real
// CRM -- there is no delete path for a lead anywhere in the product (TODOS.md),
// so every run leaves a row the client can never remove. Requires an explicit
// JOURNEY_E2E=1 to run at all.
//
// WHAT IT DOES NOT COVER: the WhatsApp side. The greet template lands on a real
// handset and the reply has to come from one -- that half stays manual, by
// nature rather than by omission.

const enabled = process.env.JOURNEY_E2E === '1'
const botId = process.env.BOT_ID ?? ''
const leadPhone = process.env.LEAD_PHONE ?? ''
const leadName = process.env.LEAD_NAME ?? 'Journey Seam Test'
const leadEmail = process.env.LEAD_EMAIL ?? 'seam-test@example.com'
const stateFile = process.env.STATE_FILE ?? '../.test-journey-state.json'

// The widget validates every field client-side before enabling its submit
// button (validateFieldValue in frontend/public/widget.js), and two of the
// three rules are stricter than they look. Asserting them here turns a bad
// LEAD_PHONE into a clear message instead of a test that hangs on a button
// that never enables.
const NAME_RE = /^[a-zA-Z\s]{2,}$/
const PHONE_RE = /^\+?[0-9]{10,}$/

test.describe('journey lead capture via the real widget', () => {
  test.skip(!enabled, 'set JOURNEY_E2E=1 — this writes a permanent lead to a real CRM')

  test.beforeAll(() => {
    expect(botId, 'BOT_ID must be set').not.toBe('')
    expect(leadPhone, 'LEAD_PHONE must be set').not.toBe('')
    // No spaces, no dashes -- "+91 96486 58889" fails the widget's own regex
    // and the submit button simply never enables.
    expect(leadPhone, `LEAD_PHONE must match ${PHONE_RE} (no spaces or dashes)`).toMatch(PHONE_RE)
    expect(leadName, `LEAD_NAME must match ${NAME_RE} (letters and spaces only)`).toMatch(NAME_RE)
  })

  test('visitor chats, fills the lead cards, and the lead reaches the API', async ({ page }) => {
    test.setTimeout(180_000)

    // The widget is injected by this page from the CDN copy of widget.js, so
    // this exercises the deployed widget rather than a local build.
    await page.goto(`/widget-test/preview?botId=${encodeURIComponent(botId)}`)

    // Asserted on the bubble, NOT on #chatiq-widget-host: the host is a bare
    // div whose shadow children are all position:fixed, so it measures 0x0 and
    // toBeVisible() can never pass on it however healthy the widget is.
    //
    // And on `.ciq-show`, not bare visibility. Open/closed here is expressed as
    // opacity + pointer-events, which Playwright's visibility check ignores
    // entirely -- a closed, un-clickable window reports as visible. The class
    // is the only honest signal, and getting this wrong means clicking straight
    // through the widget into the host page.
    await expect(
      page.locator('#ciq-bubble.ciq-show'),
      'widget never mounted — check the botId is real and its config is public'
    ).toBeVisible({ timeout: 30_000 })

    // widgetTrigger may open it unprompted, so this is conditional rather than
    // an unconditional click that would toggle an already-open window shut.
    const chatWindow = page.locator('#ciq-window')
    if (!(await chatWindow.evaluate((el) => el.classList.contains('ciq-open')))) {
      await page.locator('#ciq-bubble').click()
    }
    await expect(page.locator('#ciq-window.ciq-open')).toBeVisible({ timeout: 15_000 })

    // Wait for the greeting before typing anything. Opening the window kicks
    // off startConversation(), and handleSend() early-returns on
    // !state.conversationId -- so the input is ENABLED a moment before it is
    // actually usable, and a message sent into that gap is dropped in silence.
    // The greeting bubble landing is the observable proof the conversation
    // exists. (Enabled does not mean ready; that gap cost a run.)
    await expect(
      page.locator('#ciq-messages .ciq-msg-bot:not(.ciq-lead-card)'),
      'greeting never arrived — the conversation was never started'
    ).toHaveCount(1, { timeout: 45_000 })

    // Two turns, because this bot's leadTriggerAfterMessages is 2. The trigger
    // is decided server-side (/api/chat/lead-trigger/...), not by counting in
    // the browser, so the cards appear only after the backend agrees.
    await sendMessage(page, 'Hi, I am looking for a 3 BHK')
    await sendMessage(page, 'My budget is around 90 lakhs in Wakad')

    // Start listening BEFORE the last card is submitted: the POST fires
    // immediately on the third submit and a late listener would miss it.
    const leadPost = page.waitForResponse(
      (res) => res.url().includes('/api/leads') && res.request().method() === 'POST',
      { timeout: 60_000 }
    )

    // Three sequential one-field cards (name -> phone -> email), not one form:
    // renderLeadCard() draws a single field, and advanceLeadSequence() replaces
    // it with the next only after the current one is submitted.
    await fillLeadCard(page, 'Your Name', leadName)
    await fillLeadCard(page, 'Phone Number', leadPhone)
    await fillLeadCard(page, 'Email Address', leadEmail)

    const response = await leadPost
    expect(response.status(), 'lead capture returned a non-201').toBe(201)

    const body = (await response.json()) as { success: boolean; data?: { leadId?: string } }
    expect(body.success, `capture failed: ${JSON.stringify(body)}`).toBe(true)
    const leadId = body.data?.leadId
    expect(leadId, 'response carried no leadId').toBeTruthy()

    // The widget swallows capture errors by design ("silent fail, never surface
    // an error for lead capture"), so this confirmation is the only in-product
    // signal a visitor gets that anything was saved.
    await expect(page.getByText("Thanks! We'll be in touch.")).toBeVisible({ timeout: 15_000 })

    // Hand off to scripts/test-meta-journey-run.sh, which reads the same file.
    // Merged rather than overwritten so an existing bundleId from `arm` survives.
    const state: Record<string, unknown> = existsSync(stateFile)
      ? (JSON.parse(readFileSync(stateFile, 'utf-8')) as Record<string, unknown>)
      : {}
    state.leadId = leadId
    state.capturedVia = 'widget'
    writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`)

    console.log(`\n  leadId=${leadId} written to ${stateFile}`)
    console.log('  next: ./scripts/test-meta-journey-run.sh watch')
    console.log(`  and check ${leadPhone} for the lead_welcome_qualify_1 template\n`)
  })
})

// One user turn: type, send, and wait for the bot to FINISH answering.
//
// Finishing matters more than it looks. handleSend() early-returns while
// state.isLoading is true, so a turn sent too early is silently dropped -- no
// error, no user bubble, and the lead trigger (which counts user messages
// server-side) never reaches its threshold. Every "the cards never appeared"
// failure traces back to here.
async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.locator('#ciq-input')
  await expect(input, 'input stayed locked — a required lead card is already open').toBeEnabled({
    timeout: 30_000,
  })

  // The lead card carries .ciq-msg-bot too, so it has to be excluded or a card
  // appearing reads as an answer arriving.
  const replies = page.locator('#ciq-messages .ciq-msg-bot:not(.ciq-lead-card)')
  const before = await replies.count()

  await input.fill(text)
  // Enter, not a click on #ciq-send. Both work, but Enter is what a real
  // visitor does and it does not depend on the send button's hit box being
  // unobstructed at the current viewport size.
  await input.press('Enter')

  // Proves the send was accepted rather than swallowed by the isLoading guard.
  await expect(
    page.locator('#ciq-messages .ciq-msg-user').filter({ hasText: text }),
    'message was never accepted — the widget was still streaming the previous answer'
  ).toBeVisible({ timeout: 15_000 })

  await expect(replies).toHaveCount(before + 1, { timeout: 30_000 })

  // That bubble was appended EMPTY and is streamed into, so its existence is
  // the start of the answer, not the end. Wait for its text to stop growing --
  // an internal-free signal that survives whatever the streaming does.
  let previousLength = -1
  await expect(async () => {
    const current = (await replies.last().innerText()).trim().length
    const settled = current > 0 && current === previousLength
    previousLength = current
    expect(settled, 'answer still streaming').toBe(true)
  }).toPass({ timeout: 120_000, intervals: [1000] })

  await expect(page.locator('#ciq-typing-indicator')).toHaveCount(0, { timeout: 15_000 })
}

// Fill one lead card and advance. Uses pressSequentially, NOT fill: the submit
// button is enabled by a 'keyup' listener, and fill() sets the value without
// producing keyup, which leaves the button disabled forever.
async function fillLeadCard(page: Page, label: string, value: string): Promise<void> {
  const card: Locator = page.locator('.ciq-lead-card').filter({ hasText: label }).last()
  await expect(card, `lead card "${label}" never appeared`).toBeVisible({ timeout: 60_000 })

  const input = card.locator('.ciq-lead-card-input')
  await input.click()
  await input.pressSequentially(value, { delay: 20 })

  const submit = card.locator('.ciq-lead-card-submit')
  await expect(submit, `submit stayed disabled for "${label}" — value rejected by the widget's own validation`).toBeEnabled({
    timeout: 10_000,
  })
  await submit.click()
}
