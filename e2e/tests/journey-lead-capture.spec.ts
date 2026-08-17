import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { NAME_RE, PHONE_RE, captureLeadViaWidget, openWidget } from './helpers/widget.js'

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
    // this exercises the deployed widget rather than a local build. Both the
    // mount and the capture live in ./helpers/widget.ts, shared with
    // journey-whatsapp-full-loop.spec.ts so the two specs cannot drift into
    // driving the widget two different ways.
    await openWidget(page, botId)

    const leadId = await captureLeadViaWidget(page, { name: leadName, phone: leadPhone, email: leadEmail })

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
