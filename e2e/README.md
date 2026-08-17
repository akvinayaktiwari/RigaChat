# E2E smoke tests

Local-only for now, run manually -- not wired into CI yet. A small, deliberately
short list of golden-path flows (real browser, real Cognito/DynamoDB, no mocking),
not a full test suite. If it's not "would this be embarrassing if it silently broke,"
it doesn't belong here -- add a backend unit test instead.

## Setup (one-time)

```bash
cd e2e
npm install
npx playwright install chromium
```

## Run

```bash
npm test
```

This starts `backend` and `frontend` in dev mode automatically if they're not
already running (reuses them if they are), against whatever `backend/.env` and
`frontend/.env` already point at -- no separate config. Any Cognito/DynamoDB
records a test creates are cleaned up by the test itself when it passes.

## Tests

- `signup.spec.ts` -- homepage -> quick-signup modal -> dashboard. Self-contained:
  creates its own account, deletes it afterward.
- `journey-lead-capture.spec.ts` -- widget -> two chat turns -> lead capture.
  Guarded, writes a real lead. See below.
- `journey-whatsapp-full-loop.spec.ts` -- the whole loop, with screenshots.
  Guarded, writes a real lead. See below.

Widget-driving logic lives in `tests/helpers/widget.ts`, shared by the two
journey specs so they cannot drift into mounting or driving the widget two
different ways.

## Adding more

Keep the same shape: self-contained where possible (create + clean up your own
data), scoped to one real end-to-end flow, no more than a handful of assertions.
Flows that need a pre-existing fixture (e.g. a seeded test bot for the widget
chat flow) should say so explicitly and skip gracefully if the fixture isn't
configured, rather than failing hard for anyone who hasn't set it up.

## Running against a deployment

`E2E_BASE_URL` points the suite at an already-running deployment instead of
localhost, and suppresses the local dev servers (spawning a localhost backend
while driving vyostra.com would make a pass meaningless).

### journey-lead-capture.spec.ts

Phase 1 of the Meta-transport journey seam test
(`scripts/test-meta-journey-run.sh`), driven through the real widget rather than
a direct `POST /api/leads`: widget mount -> two chat turns -> the server-side
lead trigger -> the three lead cards -> capture. It writes the resulting
`leadId` into `.test-journey-state.json`, which that script's `watch` phase
reads.

**This writes a permanent lead into a real CRM.** There is no delete path for a
lead anywhere in the product (see TODOS.md), so every run leaves a row that
cannot be removed. It is excluded from the default suite and refuses to run
without `JOURNEY_E2E=1`.

```bash
cd e2e
JOURNEY_E2E=1 \
E2E_BASE_URL=https://vyostra.com \
BOT_ID=ef67914c-18be-44f7-9761-7c1bc0d543cb \
LEAD_PHONE=+919999999999 \
LEAD_NAME="Journey Seam Test" \
npm run test:prod
```

`LEAD_PHONE` must be digits with an optional leading `+` and no spaces or
dashes, and `LEAD_NAME` letters and spaces only — the widget validates both
client-side (`validateFieldValue` in `frontend/public/widget.js`) and simply
never enables its submit button otherwise. The spec asserts these up front so a
bad value fails with a readable message instead of a timeout.

`test:prod` deliberately names the one spec: an unfiltered prod run would also
execute `signup.spec.ts`, creating a real account on the production Cognito
pool.

The WhatsApp half stays manual — the greet template lands on a real handset and
the reply has to come from one.

### journey-whatsapp-full-loop.spec.ts

The whole loop in one run: arm a journey, capture a lead through the real
widget, hold a two-turn WhatsApp conversation, and screenshot the dashboard
timeline showing all of it.

**The inbound side is a signed webhook, not a handset.** The spec POSTs
Meta-shaped payloads to `/api/webhooks/meta-whatsapp` with a real
`X-Hub-Signature-256`, which exercises everything from the webhook boundary
inward -- signature verification, lead resolution, the agent turn, KB
retrieval, the journey resume -- and stops short of only Meta's own delivery to
a phone. The handset version is `scripts/test-meta-journey-run.sh`, which stays
as the manual pre-release check.

**This writes a permanent lead into a real CRM**, same as the capture spec, and
refuses to run without `JOURNEY_E2E=1`.

#### Prerequisite: open the 24h session window first

**Send one real WhatsApp message from `LEAD_PHONE` to the business number
before running.** This is not optional and it is the most likely way a run
fails.

The spec forges the inbound webhook, which makes *our* records think the window
is open -- `recordInboundMessage` writes `whatsapp_inbound_activity`, and
`hasActiveWhatsAppSession` reads exactly that. Meta has no such record. So the
agent decides it may reply with free text, and Meta then rejects the send with
error 131047 (no open customer-service window).

Forging that half is not possible and should not be: the session window is a
Meta policy control, and a test that could bypass it would be testing a system
nobody runs. One real message from the handset opens a genuine 24h window, and
everything inside it then behaves exactly as production does.

```bash
cd e2e
JOURNEY_E2E=1 \
E2E_BASE_URL=https://vyostra.com \
BOT_ID=ef67914c-18be-44f7-9761-7c1bc0d543cb \
META_PHONE_NUMBER_ID=... \
LEAD_PHONE=+919999999999 \
LEAD_NAME="Loop E2E Test" \
E2E_ID_TOKEN=eyJ... \
npm run test:loop
```

`META_APP_SECRET`, `META_WABA_ID` and `AWS_REGION` come from `backend/.env`,
which `test:loop` loads. The app secret must be the one the TARGET deployment
verifies against -- if it is not, the webhook returns 400 and the spec says so
by name rather than failing three steps later.

`E2E_ID_TOKEN` is a Cognito **idToken** for the client that owns `BOT_ID`. There
is no programmatic sign-in for it: the account is Google-federated, so
`USER_PASSWORD_AUTH` cannot mint a token and the hosted UI needs a real consent
screen. Sign in to the dashboard and copy it:

```js
sessionStorage.getItem('bb_token')
```

It expires in **one hour** and nothing refreshes it. The spec checks `exp`
before opening a browser, so an aged-out token fails immediately with a message
saying so instead of bouncing to `/login` and looking like a broken dashboard.

`META_PHONE_NUMBER_ID` is how an inbound message resolves to a client -- it must
match `metaDirectWhatsAppConnection.phoneNumberId` on that client's record, or
the webhook logs "message on unmapped phone_number_id" and nothing else
happens.

**Screenshots** land in `e2e/screenshots/`, numbered in order
(`01-widget-open.png`, `02-lead-captured.png`, `03-dashboard-timeline.png`).
They are the deliverable as much as the pass or fail -- these are the frames
used in client meetings. Gitignored: collect them from disk. A failed run keeps
whatever it captured before failing.

**Cleanup** deletes the journey bundle (which releases its trigger claim) and
the parked `journey_pending_replies` callback token, and runs even when the test
fails -- a failed run that left its bundle published would keep owning the
trigger and block every run after it. Clearing the callback token shells out to
the `aws` CLI; without it the row TTLs out within 24h, and until it does, the
next journey on that lead fails with `PendingReplyConflictError`.

The **lead itself cannot be cleaned up**. There is no delete path for a lead
anywhere in the product (TODOS.md), so every run leaves a row in the CRM
forever. Worth knowing before pointing this at a real client account.
