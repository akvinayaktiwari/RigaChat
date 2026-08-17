// Widget-driving helpers, extracted from journey-lead-capture.spec.ts so the
// full-loop spec drives lead capture the same way rather than a second way.
//
// Every comment below is a bug that was actually hit. The widget's failure mode
// is silence -- it swallows errors by design -- so each wait here exists
// because its absence produced a timeout that named the wrong thing.

import { expect, type Locator, type Page } from '@playwright/test'

// The widget validates every field client-side before enabling its submit
// button (validateFieldValue in frontend/public/widget.js), and two of the
// three rules are stricter than they look. Asserting them up front turns a bad
// LEAD_PHONE into a clear message instead of a test that hangs on a button that
// never enables.
export const NAME_RE = /^[a-zA-Z\s]{2,}$/
export const PHONE_RE = /^\+?[0-9]{10,}$/

// Mount the widget and open its window, tolerating a widgetTrigger that opens
// it unprompted.
export async function openWidget(page: Page, botId: string): Promise<void> {
  await page.goto(`/widget-test/preview?botId=${encodeURIComponent(botId)}`)

  // Asserted on the bubble, NOT on #chatiq-widget-host: the host is a bare div
  // whose shadow children are all position:fixed, so it measures 0x0 and
  // toBeVisible() can never pass on it however healthy the widget is.
  //
  // And on `.ciq-show`, not bare visibility. Open/closed here is expressed as
  // opacity + pointer-events, which Playwright's visibility check ignores
  // entirely -- a closed, un-clickable window reports as visible.
  await expect(
    page.locator('#ciq-bubble.ciq-show'),
    'widget never mounted — check the botId is real and its config is public'
  ).toBeVisible({ timeout: 30_000 })

  const chatWindow = page.locator('#ciq-window')
  if (!(await chatWindow.evaluate((el) => el.classList.contains('ciq-open')))) {
    await page.locator('#ciq-bubble').click()
  }
  await expect(page.locator('#ciq-window.ciq-open')).toBeVisible({ timeout: 15_000 })

  // Opening the window kicks off startConversation(), and handleSend()
  // early-returns on !state.conversationId -- so the input is ENABLED a moment
  // before it is usable, and a message sent into that gap is dropped in
  // silence. The greeting bubble landing is the observable proof the
  // conversation exists. Enabled does not mean ready; that gap cost a run.
  await expect(
    page.locator('#ciq-messages .ciq-msg-bot:not(.ciq-lead-card)'),
    'greeting never arrived — the conversation was never started'
  ).toHaveCount(1, { timeout: 45_000 })
}

// One user turn: type, send, and wait for the bot to FINISH answering.
//
// Finishing matters more than it looks. handleSend() early-returns while
// state.isLoading is true, so a turn sent too early is silently dropped -- no
// error, no user bubble, and the lead trigger (which counts user messages
// server-side) never reaches its threshold. Every "the cards never appeared"
// failure traces back to here.
export async function sendMessage(page: Page, text: string): Promise<void> {
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
export async function fillLeadCard(page: Page, label: string, value: string): Promise<void> {
  const card: Locator = page.locator('.ciq-lead-card').filter({ hasText: label }).last()
  await expect(card, `lead card "${label}" never appeared`).toBeVisible({ timeout: 60_000 })

  const input = card.locator('.ciq-lead-card-input')
  await input.click()
  await input.pressSequentially(value, { delay: 20 })

  const submit = card.locator('.ciq-lead-card-submit')
  await expect(
    submit,
    `submit stayed disabled for "${label}" — value rejected by the widget's own validation`
  ).toBeEnabled({ timeout: 10_000 })
  await submit.click()
}

export interface LeadIdentity {
  name: string
  phone: string
  email: string
}

// Two chat turns, the three lead cards, and the capture POST. Returns the
// leadId the API minted.
export async function captureLeadViaWidget(page: Page, lead: LeadIdentity): Promise<string> {
  // Two turns, because the seeded bot's leadTriggerAfterMessages is 2. The
  // trigger is decided server-side (/api/chat/lead-trigger/...), not by
  // counting in the browser, so the cards appear only after the backend agrees.
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
  await fillLeadCard(page, 'Your Name', lead.name)
  await fillLeadCard(page, 'Phone Number', lead.phone)
  await fillLeadCard(page, 'Email Address', lead.email)

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

  return leadId as string
}
