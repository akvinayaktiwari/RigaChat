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
