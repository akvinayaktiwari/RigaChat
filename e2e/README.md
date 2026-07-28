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
