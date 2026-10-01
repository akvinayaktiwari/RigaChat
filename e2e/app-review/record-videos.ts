// Records the two Meta App Review screencasts for the WhatsApp permissions --
// one video per permission, because Meta rejects a combined one.
//
//   npm run record:app-review -- --setup              (one-time manual logins)
//   npm run record:app-review -- --video=management   (whatsapp_business_management)
//   npm run record:app-review -- --video=messaging    (whatsapp_business_messaging)
//
// This drives the REAL product against the real Meta APIs. Nothing is mocked,
// and nothing here types, stores or reads a password, token or OTP: every login
// is done by hand in the persistent profile, and Meta's Embedded Signup popup is
// never scripted -- the human clicks through it while the recording runs.
//
// See README.md in this directory for setup and for every point where the
// script stops and waits for a person.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { chromium, type BrowserContext, type Locator, type Page } from '@playwright/test'

type VideoName = 'management' | 'messaging'

const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PROFILE_DIR = join(E2E_DIR, '.pw-profile')
const RECORDINGS_DIR = join(E2E_DIR, 'recordings')
const RAW_DIR = join(RECORDINGS_DIR, '.raw')

const VIEWPORT = { width: 1440, height: 900 }
const SLOW_MO_MS = 400
const HOLD_MS = 2000
const CAPTION_MS = 1800
const HUMAN_TIMEOUT_MS = 5 * 60 * 1000
const WHATSAPP_WEB_URL = 'https://web.whatsapp.com/'
const LEAD_NAME = 'Test Lead — App Review'

const OUTPUT_NAMES: Record<VideoName, string> = {
  management: 'whatsapp_business_management',
  messaging: 'whatsapp_business_messaging',
}

interface RecorderConfig {
  baseUrl: string
  channel?: string
  notificationNumber?: string
  formId?: string
  leadPhone?: string
  leadEmail: string
  templateName: string
}

// Seconds into the main page's recording at which Meta's popup opened and
// closed. Playwright records each window to its own file, so these are what
// let the popup's recording be placed back where it happened.
interface PopupWindow {
  page: Page
  openedAtSeconds: number
  closedAtSeconds: number
}

interface Take {
  page: Page
  popup?: PopupWindow
}

function readConfig(): RecorderConfig {
  return {
    baseUrl: (process.env.APP_REVIEW_BASE_URL ?? 'https://vyostra.com').replace(/\/$/, ''),
    channel: process.env.APP_REVIEW_CHANNEL,
    notificationNumber: process.env.APP_REVIEW_NOTIFICATION_NUMBER,
    formId: process.env.APP_REVIEW_FORM_ID,
    leadPhone: process.env.APP_REVIEW_LEAD_PHONE,
    leadEmail: process.env.APP_REVIEW_LEAD_EMAIL ?? 'test-lead@example.com',
    templateName: process.env.APP_REVIEW_TEMPLATE ?? 'lead_notification_2',
  }
}

function requireSetting(value: string | undefined, name: string, why: string): string {
  if (!value?.trim()) throw new Error(`Set ${name} — ${why}`)
  return value.trim()
}

function parseVideoArg(): VideoName | 'setup' {
  if (process.argv.includes('--setup')) return 'setup'
  const value = process.argv.find((arg) => arg.startsWith('--video='))?.split('=')[1]
  if (value === 'management' || value === 'messaging') return value
  throw new Error('Pass --setup, --video=management or --video=messaging')
}

async function waitForHuman(instruction: string): Promise<void> {
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  try {
    await prompt.question(`\n>>> ${instruction}\n    Press Enter when done. `)
  } finally {
    prompt.close()
  }
}

async function launch(config: RecorderConfig, record: boolean): Promise<BrowserContext> {
  return chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    slowMo: SLOW_MO_MS,
    viewport: VIEWPORT,
    ...(config.channel ? { channel: config.channel } : {}),
    ...(record ? { recordVideo: { dir: RAW_DIR, size: VIEWPORT } } : {}),
  })
}

// Runs in the page. Draws a caption bar and a cursor ring, but only on the
// Vyostra AI host: Meta's popup and WhatsApp Web are left exactly as they are.
function installOverlay(allowedHost: string): void {
  if (window.location.hostname !== allowedHost) return

  window.addEventListener('DOMContentLoaded', () => {
    const ring = document.createElement('div')
    ring.id = 'app-review-cursor'
    ring.style.cssText =
      'position:fixed;z-index:2147483647;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;' +
      'border:3px solid #7c3aed;background:rgba(124,58,237,.18);pointer-events:none;transition:transform .15s'
    document.body.appendChild(ring)

    document.addEventListener('mousemove', (event) => {
      ring.style.left = `${event.clientX}px`
      ring.style.top = `${event.clientY}px`
    })
    document.addEventListener('mousedown', () => (ring.style.transform = 'scale(1.7)'))
    document.addEventListener('mouseup', () => (ring.style.transform = 'scale(1)'))
  })
}

// Shows the step name, holds, then REMOVES it before returning, so the action
// that follows is filmed against the real UI with nothing drawn over it.
async function caption(page: Page, text: string): Promise<void> {
  await page.evaluate((message) => {
    const bar = document.createElement('div')
    bar.id = 'app-review-caption'
    bar.textContent = message
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483646;padding:14px 24px;text-align:center;' +
      'background:#111827;color:#fff;font:600 18px/1.3 system-ui,sans-serif;pointer-events:none'
    document.body.appendChild(bar)
  }, text)
  await page.waitForTimeout(CAPTION_MS)
  await page.evaluate(() => document.getElementById('app-review-caption')?.remove())
}

// Glides the cursor to the target before clicking. Playwright's own click
// teleports, which on video reads as things happening with no visible cause.
async function humanClick(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 })
  }
  await target.click()
}

// The dashboard session lives in sessionStorage, which a fresh browser launch
// does not carry over, so a person signs in at the start of every take. The
// profile keeps the Google session, which makes that one click.
async function openDashboard(page: Page, config: RecorderConfig, path: string): Promise<void> {
  await page.goto(`${config.baseUrl}${path}`)
  await page.waitForLoadState('networkidle')

  if (!new URL(page.url()).pathname.startsWith('/dashboard')) {
    console.log('\n>>> Sign in to Vyostra AI in the browser window. The script continues on its own.')
    await page.waitForURL(/\/dashboard/, { timeout: HUMAN_TIMEOUT_MS })
    await page.goto(`${config.baseUrl}${path}`)
  }
}

async function startTake(context: BrowserContext, config: RecorderConfig): Promise<{ page: Page; startedAt: number }> {
  await context.addInitScript(installOverlay, new URL(config.baseUrl).hostname)
  const startedAt = Date.now()
  const page = await context.newPage()

  // The blank tab a persistent context opens with would otherwise sit in front.
  for (const other of context.pages()) {
    if (other !== page) await other.close()
  }
  return { page, startedAt }
}

// ---------------------------------------------------------------- Video A

async function connectThroughEmbeddedSignup(page: Page, context: BrowserContext, startedAt: number): Promise<PopupWindow> {
  const connect = page.getByRole('button', { name: 'Connect with Meta' })
  const popupOpening = context.waitForEvent('page', { timeout: 30_000 })
  await humanClick(page, connect)

  const popup = await popupOpening
  const openedAtSeconds = (Date.now() - startedAt) / 1000
  console.log(
    '\n>>> Meta Embedded Signup is open. Click through it yourself:\n' +
      '    business -> WhatsApp Business Account -> phone number -> Finish.\n' +
      '    Hold on the permissions screen for about 3 seconds. The recording is running.'
  )

  await popup.waitForEvent('close', { timeout: HUMAN_TIMEOUT_MS })
  return { page: popup, openedAtSeconds, closedAtSeconds: (Date.now() - startedAt) / 1000 }
}

async function createTemplateOnCamera(page: Page, templateName: string): Promise<void> {
  await page.getByTestId('whatsapp-templates').scrollIntoViewIfNeeded()
  await caption(page, 'Step 4 — Creating a message template on the connected WhatsApp Business Account')

  const row = page.getByTestId(`template-row-${templateName}`)
  await row.scrollIntoViewIfNeeded()
  const create = page.getByTestId(`template-create-${templateName}`)

  if (!(await create.isVisible())) {
    console.log(`\n(${templateName} already exists on this account — filming its status without creating it.)`)
    await page.waitForTimeout(HOLD_MS)
    return
  }

  await humanClick(page, create)
  await page
    .getByTestId(`template-status-${templateName}`)
    .filter({ hasNotText: 'Not created' })
    .waitFor({ timeout: 45_000 })
  await caption(page, 'Step 5 — The template is submitted to Meta and its review status is shown')
  await page.waitForTimeout(HOLD_MS)
}

async function recordManagement(context: BrowserContext, config: RecorderConfig): Promise<Take> {
  const notificationNumber = requireSetting(
    config.notificationNumber,
    'APP_REVIEW_NOTIFICATION_NUMBER',
    'the test number that receives lead alerts, digits only with country code'
  )
  const { page, startedAt } = await startTake(context, config)

  await openDashboard(page, config, '/dashboard/whatsapp')
  // The Meta card renders a skeleton until its status loads; either of these
  // appearing means it has settled into connected or not-connected.
  await page
    .locator('#meta-wa-notification-number, [data-testid="meta-wa-display-number"]')
    .first()
    .waitFor({ timeout: 30_000 })
  await caption(page, "Step 1 — Connecting a client's WhatsApp Business Account in Vyostra AI")

  const connect = page.getByRole('button', { name: 'Connect with Meta' })
  if (!(await connect.isVisible())) {
    throw new Error('WhatsApp is already connected through Meta. Disconnect it by hand first, then rerun.')
  }
  await page.locator('#meta-wa-notification-number').fill(notificationNumber)
  await caption(page, 'Step 2 — Business owner connects WhatsApp via Embedded Signup')

  const popup = await connectThroughEmbeddedSignup(page, context, startedAt)

  await page.getByTestId('meta-wa-display-number').waitFor({ timeout: 90_000 })
  await caption(page, 'Step 3 — The connected phone number and its verified name')
  await page.waitForTimeout(HOLD_MS)

  await createTemplateOnCamera(page, config.templateName)
  return { page, popup }
}

// ---------------------------------------------------------------- Video B

// Fills whatever fields the test form has, by input type. Reaches into the
// widget's open shadow root, which Playwright locators pierce on their own.
async function fillLeadForm(page: Page, config: RecorderConfig, leadPhone: string): Promise<void> {
  const body = page.locator('#bb-form-body')
  let nameWritten = false

  for (const input of await body.locator('input').all()) {
    const type = (await input.getAttribute('type')) ?? 'text'
    if (type === 'tel') await input.fill(leadPhone)
    else if (type === 'email') await input.fill(config.leadEmail)
    else if (type === 'number') await input.fill('1')
    else {
      await input.fill(nameWritten ? 'App Review test submission' : LEAD_NAME)
      nameWritten = true
    }
  }

  for (const select of await body.locator('select').all()) {
    await select.selectOption({ index: 1 })
  }
}

async function submitLead(page: Page, config: RecorderConfig, formId: string, leadPhone: string): Promise<void> {
  await page.goto(`${config.baseUrl}/form-test/preview?formId=${encodeURIComponent(formId)}`)
  await page.waitForLoadState('networkidle')
  await caption(page, "Step 2 — A visitor submits a lead on the client's website")

  await humanClick(page, page.getByRole('button', { name: 'Request a Quote' }))
  await page.locator('#bb-form-body').waitFor({ timeout: 20_000 })
  await fillLeadForm(page, config, leadPhone)
  await page.waitForTimeout(HOLD_MS)

  await humanClick(page, page.locator('#bb-form-submit'))
  await page.locator('#bb-form-success').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(HOLD_MS)
  await caption(page, 'Step 3 — Vyostra AI alerts the business owner on WhatsApp')
}

// WhatsApp Web is only ever LOOKED at. The script never types or clicks there:
// the person sends the customer's message, by hand, in the window or on a phone.
async function showWhatsApp(page: Page): Promise<void> {
  await page.goto(WHATSAPP_WEB_URL)

  try {
    await page.getByText(LEAD_NAME).first().waitFor({ timeout: 60_000 })
  } catch {
    await waitForHuman(
      'The lead alert was not found in WhatsApp Web. Open the chat that shows it — or, if the alert ' +
        "went to a phone that is not this WhatsApp Web session, screen-record that phone for this segment."
    )
  }
  await page.waitForTimeout(HOLD_MS)

  await waitForHuman(
    'Customer messages the business on WhatsApp: open the chat with the business number and send a ' +
      'question by hand (here or from the test phone). Wait until the AI reply is on screen.'
  )
  await page.waitForTimeout(HOLD_MS)
}

async function showLeadInCrm(page: Page, config: RecorderConfig): Promise<void> {
  await page.goto(`${config.baseUrl}/dashboard/leads`)
  await caption(page, 'Step 5 — The lead and its WhatsApp conversation in the Vyostra AI CRM')

  const lead = page.getByText(LEAD_NAME).first()
  await lead.waitFor({ timeout: 30_000 })
  await page.waitForTimeout(HOLD_MS)
  await humanClick(page, lead)
  await page.waitForTimeout(HOLD_MS * 2)
}

async function recordMessaging(context: BrowserContext, config: RecorderConfig): Promise<Take> {
  const formId = requireSetting(config.formId, 'APP_REVIEW_FORM_ID', 'the id of a lead form on the test account')
  const leadPhone = requireSetting(
    config.leadPhone,
    'APP_REVIEW_LEAD_PHONE',
    'the test customer number, the one that will message the business'
  )
  const { page } = await startTake(context, config)

  // Signed in first, in this same tab, so the CRM at the end needs no login.
  await openDashboard(page, config, '/dashboard/whatsapp')
  await caption(page, 'Step 1 — The business has WhatsApp connected in Vyostra AI')
  await page.getByTestId('meta-wa-display-number').waitFor({ timeout: 30_000 })
  await page.waitForTimeout(HOLD_MS)

  await submitLead(page, config, formId, leadPhone)
  await showWhatsApp(page)
  await showLeadInCrm(page, config)
  return { page }
}

// ---------------------------------------------------------------- Output

function ffmpeg(args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
}

const ENCODE = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart']

// Puts the popup's recording back into the main recording at the moment the
// popup was on screen: dashboard up to the click, the whole popup, dashboard
// from the moment it closed. Nothing is dropped and nothing is reordered.
function spliceInPopup(mainFile: string, popupFile: string, popup: PopupWindow, output: string): void {
  const fit = `scale=${VIEWPORT.width}:${VIEWPORT.height}:force_original_aspect_ratio=decrease,pad=${VIEWPORT.width}:${VIEWPORT.height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25`
  const filter =
    `[0:v]trim=end=${popup.openedAtSeconds.toFixed(2)},setpts=PTS-STARTPTS,${fit}[before];` +
    `[1:v]setpts=PTS-STARTPTS,${fit}[during];` +
    `[0:v]trim=start=${popup.closedAtSeconds.toFixed(2)},setpts=PTS-STARTPTS,${fit}[after];` +
    '[before][during][after]concat=n=3:v=1:a=0[out]'

  ffmpeg(['-i', mainFile, '-i', popupFile, '-filter_complex', filter, '-map', '[out]', ...ENCODE, output])
}

async function savedVideo(page: Page, destination: string): Promise<string> {
  const source = await page.video()?.path()
  if (!source || !existsSync(source)) throw new Error('Playwright wrote no video for this take')
  renameSync(source, destination)
  return destination
}

// Called only after the context is closed -- Playwright flushes a video to disk
// on close, and a file read before that is truncated.
async function writeOutputs(video: VideoName, take: Take): Promise<void> {
  const base = join(RECORDINGS_DIR, OUTPUT_NAMES[video])
  const mainFile = await savedVideo(take.page, `${base}.webm`)

  if (take.popup) {
    const popupFile = await savedVideo(take.popup.page, `${base}.popup.webm`)
    spliceInPopup(mainFile, popupFile, take.popup, `${base}.mp4`)
  } else {
    ffmpeg(['-i', mainFile, ...ENCODE, `${base}.mp4`])
  }

  rmSync(RAW_DIR, { recursive: true, force: true })
  console.log(`\nSaved ${base}.mp4 — watch it end to end before uploading.`)
}

async function runSetup(config: RecorderConfig): Promise<void> {
  const context = await launch(config, false)
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(`${config.baseUrl}/login`)
  await waitForHuman(
    'Sign in by hand, in this browser: Vyostra AI, then facebook.com (as an admin of the test business), ' +
      `then ${WHATSAPP_WEB_URL} (scan the QR code).`
  )
  await context.close()
}

async function main(): Promise<void> {
  const mode = parseVideoArg()
  const config = readConfig()
  if (mode === 'setup') return runSetup(config)

  mkdirSync(RAW_DIR, { recursive: true })
  for (const stale of readdirSync(RAW_DIR)) rmSync(join(RAW_DIR, stale), { force: true })

  const context = await launch(config, true)
  let take: Take
  try {
    take = mode === 'management' ? await recordManagement(context, config) : await recordMessaging(context, config)
  } finally {
    await context.close()
  }
  await writeOutputs(mode, take)
}

main().catch((error: unknown) => {
  console.error(`\nRecording stopped: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
