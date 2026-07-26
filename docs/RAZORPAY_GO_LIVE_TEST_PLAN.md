# Razorpay Go-Live Test Plan

> Generated 2026-07-26. Scope: flipping Razorpay from test-mode to live-mode
> keys on `main` this week. Does NOT cover `feature/meta-ads-integration`
> (Meta Lead Ads, WhatsApp agent/journeys pilot) — that work is unmerged and
> unrelated to billing.
>
> Everything below was verified by reading the actual code on `main`
> (`backend/src/services/billing-service.ts`, `webhook-service.ts`,
> `razorpay-provider.ts`, `lib/razorpay.ts`, `.env.example`,
> `.github/workflows/deploy.yml`), not assumed.

## 🚧 CURRENT BLOCKER (as of 2026-07-26, evening): Subscriptions product not yet approved by Razorpay

**This is now the actual timeline driver, not engineering readiness.** Every
checkout attempt (test mode AND live mode) fails at Razorpay with:

```json
{"error":{"code":"BAD_REQUEST_ERROR","description":"Your payment was not
successful as the seller does not support recurring payments...",
"reason":"recurring_payment_not_enabled"}}
```

Confirmed via Razorpay's own API (zero payment records exist at all — every
attempt fails before Razorpay ever processes a card) and via the dashboard:
Razorpay's Subscriptions product for this account shows **"in the process
of going live"** — i.e. still under Razorpay's own review/activation
pipeline. This blocks recurring checkouts in *both* test and live mode,
which is why it wasn't caught by testing sooner — no amount of retrying
with different test cards would have worked.

**Nothing on the code side is blocked by this** — the webhook/activation
logic (payment.failed logging, invoice capture, the plan-not-updating fix)
is already built and verified via signed-webhook simulation, since a real
click-through literally cannot succeed until this clears. **Action item:
contact Razorpay support directly to ask for status/timeline**, since
"in the process of going live" has no visible ETA from the dashboard alone.

**Once this clears**: do one real click-through in test mode with the test
cards below to confirm the full loop end-to-end for real (not simulated),
then the one small live-mode transaction from the cutover sequence before
announcing the switch.

Razorpay's official test cards (test mode only — confirmed against their
own docs, not guessed): Visa `4100 2800 0000 1007`, Mastercard
`5500 6700 0000 1002`, RuPay `6527 6589 0000 1005`. Any future expiry, any
CVV. For the OTP step: 4-10 digits simulates success, fewer than 4 digits
simulates a decline (useful for testing the `payment.failed` fix for real).

## What's already built (main branch)

- **Subscription checkout**: `POST /api/billing/subscribe` (auth required) →
  `subscribeToTier()` creates a Razorpay Subscription (`total_count: 1200`,
  monthly), sets local `Subscription.status = 'pending_activation'`, returns
  a `razorpayKeyId` to the frontend.
- **Frontend checkout**: `useTierCheckout.ts` opens Razorpay's hosted
  checkout modal (`razorpay-checkout.ts`), then polls
  `GET /api/billing/subscription` every 3s (10 attempts / 30s) waiting for
  `status: 'active'`.
- **Resume-pending-checkout**: a second `/subscribe` call while
  `pending_activation` is still open returns `409 ALREADY_SUBSCRIBED` with
  enough data (`providerSubscriptionId`, `razorpayKeyId`) for the frontend
  to reopen the *same* Razorpay subscription rather than creating a
  duplicate.
- **Webhook**: `POST /api/webhooks/razorpay` — HMAC-SHA256 signature check
  (`timingSafeEqual`, not `===`), idempotency via `x-razorpay-event-id` +
  `webhook_events` table, `clientId` cross-checked against
  `subscription.notes.clientId` before any write, payment logged to
  `payment_history` on `subscription.charged`.
- **Three billing tiers**: starter (₹1,999), growth (₹5,499), agency
  (₹14,999) — `frontend/src/lib/pricingTiers.ts`. India-only real payment
  flow (`region: 'intl'` routes to a mailto link, never touches Razorpay).

## P0 — must fix or verify before flipping to live keys

These aren't nice-to-haves. Each one either causes a silent money-handling
bug or an outage risk specific to *this week's* cutover.

### 1. `payment.failed` is an unmapped webhook event — failed renewals are invisible

`webhook-service.ts`'s `RAZORPAY_STATUS_MAP` only has entries for
`subscription.activated/charged/pending/halted/paused/resumed/cancelled/authenticated`.
A bare `payment.failed` event (a recurring charge failing on an
already-active subscription, before Razorpay's retry schedule eventually
fires `subscription.pending`/`halted`) falls into the "unmapped event type,
ignored" branch — `markProcessed()` runs, nothing else does.

**Concrete failure scenario:** a client's card is charged and declines on
renewal. Razorpay sends `payment.failed`. Your system does nothing.
`AdminAccountsPage.tsx` still shows `active` (it just renders
`account.status` — [AdminAccountsPage.tsx:158](../frontend/src/pages/admin/AdminAccountsPage.tsx#L158)).
The client keeps full access with a card that isn't actually charging them,
until/unless Razorpay's own retry schedule eventually sends
`subscription.pending` or `halted` days later — and you have zero visibility
into that gap.

**Fix before go-live:** either map `payment.failed` explicitly (log it,
surface it in the admin panel even if you don't change `status` yet), or at
minimum add logging so a failed charge isn't completely silent. This is a
few lines in `webhook-service.ts`, not a redesign.

### 2. No invoice/receipt feature exists in the codebase

Zero references to "invoice" anywhere in `backend/` or `frontend/`. If the
expectation is that clients get a downloadable invoice or an email receipt,
that doesn't exist yet — it's not a testing gap, it's missing scope.
**Action needed this week:** confirm what you actually promised
clients/pricing pages, and check your Razorpay dashboard settings — Razorpay
can auto-generate and email invoices for subscriptions depending on account
configuration, which may cover this without any code change. Verify that
setting specifically; don't assume either way.

### 3. Razorpay env vars are missing from `.env.example` and from `deploy.yml`'s automated merge

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`RAZORPAY_PLAN_ID_STARTER/GROWTH/AGENCY` appear in zero places outside the
source files that read them — not in `.env.example`, not in
`.github/workflows/deploy.yml`'s env-merge step (confirmed: `grep -i
razorpay .github/workflows/deploy.yml` returns nothing). That means these
vars are set **manually in the AWS Lambda console**, outside the deploy
pipeline, and nothing in CI/CD verifies they're correct or present.

**Why this is P0, not a documentation nit:** `lib/razorpay.ts` throws at
**module load time** — unconditionally, before any request is handled:

```ts
if (!keyId || !keySecret) {
  throw new Error('Missing required environment variables RAZORPAY_KEY_ID and/or RAZORPAY_KEY_SECRET...')
}
```

Per `docs/DEPLOYMENT.md`, all three Lambdas (main, streaming, crawler) run
the identical bundle and `index.ts` unconditionally imports the full route
tree — the same failure mode already documented there for Zoho's env vars.
**If you update `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` on the main Lambda
but forget the streaming or crawler Lambda, that Lambda crashes at cold
start entirely** — not just billing, the whole chatbot/leads/crawler
pipeline on that Lambda goes down. This is a real outage risk for a
same-week cutover done manually under time pressure.

**Action needed:** before flipping keys, write down (a) the exact list of 3
Lambda function names, (b) confirm all 4 Razorpay vars are set identically
on all 3, (c) after flipping, hit a lightweight endpoint on each Lambda to
confirm cold start succeeds (the existing deploy workflow already does a
health check against `/api/bots/health-check/config` post-deploy — do the
same manually post-cutover since this isn't going through `deploy.yml`).

### 4. Webhook idempotency is read-then-write, not atomic (already tracked, now higher stakes)

`webhook-event-repository.ts`'s `hasProcessed()` (Get) /
`markProcessed()` (Put) is not a conditional/atomic claim. Two near-
simultaneous deliveries of the same event (Razorpay does retry on non-2xx,
and webhook delivery can double-fire) could both pass `hasProcessed() ===
false` before either writes. This is already flagged in `TODOS.md` as a
cross-cutting issue affecting Razorpay. It was low-stakes while in test
mode; it's real-money risk once live. Doesn't need to block this week's
cutover if traffic is low, but should be the first fast-follow after go-live,
not indefinitely deferred.

### 5. No failure/reconciliation runbook exists (you confirmed this — "no plan yet")

If a client is charged by Razorpay but the webhook fails to process (crash,
timeout, bug), there's currently no way to notice except manually checking
the Razorpay dashboard against your DynamoDB `subscriptions` table. Minimum
viable runbook for this week:

1. **Where to look:** Razorpay dashboard → Payments (filter: last 24h,
   status: captured) is the source of truth for what was actually charged.
   Cross-reference against `payment_history` table entries for the same
   window.
2. **What "broken" looks like:** a payment in Razorpay's dashboard with no
   matching `payment_history` row, or a `subscriptions` row stuck in
   `pending_activation` more than a few minutes after a successful
   Razorpay-side charge.
3. **Manual fix path:** there's no admin action today to manually flip a
   subscription to `active` — check `AdminAccountsPage.tsx` / the admin
   routes for whatever override mechanism exists (`overrides` field on
   `Subscription` suggests one does), and confirm it can be used as a
   manual unstick lever before you need it under pressure.

## Test plan — critical paths

Run all of these against **Razorpay test mode first**, then repeat the
happy path once in live mode with a real low-value transaction before
announcing the switch.

| # | Path | Verify |
|---|---|---|
| 1 | New subscription, successful payment | `/subscribe` → Razorpay modal → test card success → webhook `subscription.activated`/`charged` fires → `subscriptions` row flips to `active` → frontend poll picks it up within 30s → entitlements unlock (`invalidateEntitlementsCache` actually clears stale cache) |
| 2 | New subscription, declined card | Checkout modal shows Razorpay's own decline message → confirm what event Razorpay sends (`payment.failed`? nothing?) → confirm current code behavior matches finding #1 above |
| 3 | User closes checkout modal mid-payment | `ondismiss` fires → `pendingCheckout` state set → clicking the same tier again resumes the *same* subscription (not a duplicate) → confirm in Razorpay dashboard only one subscription object was created |
| 4 | Page refresh after modal dismissed, no local `pendingCheckout` state | Second `/subscribe` call → `409 ALREADY_SUBSCRIBED` with `providerSubscriptionId` + `razorpayKeyId` in `details` → frontend recovers and resumes correctly (`tier: null` path in `useTierCheckout.ts`) |
| 5 | Duplicate webhook delivery (replay same event) | Second delivery hits `hasProcessed()` → short-circuits to `200 Already processed` → no duplicate `payment_history` row, no duplicate cache invalidation |
| 6 | Recurring renewal charge succeeds | `subscription.charged` → `currentPeriodEnd` bumped, `payment_history` row added with correct `paymentId`/`amount`/`currency` |
| 7 | Recurring renewal charge fails | See finding #1 — confirm actual Razorpay behavior and current code gap |
| 8 | Subscription cancelled (via Razorpay dashboard or API) | `subscription.cancelled` → local status → `cancelled`, entitlements correctly downgraded, no crash if client re-subscribes after |
| 9 | Webhook with invalid/missing signature | `400 Invalid signature`, event NOT marked processed, no state mutated — confirm this can't be used to spoof a fake "activated" event |
| 10 | Webhook payload where `notes.clientId` doesn't match any local subscription's `providerSubscriptionId` | Cross-check guard in `webhook-service.ts` correctly no-ops instead of corrupting a different account's row |
| 11 | Internal/staff account attempts to subscribe | `INTERNAL_ACCOUNT_NO_BILLING` 409, no Razorpay subscription created |
| 12 | Region detection routes India correctly | `detectRegion()` timezone heuristic — verify a real India-based signup actually reaches Razorpay checkout, not the `intl` mailto path |

## Live-mode cutover sequence (this week)

1. Confirm live-mode Razorpay Plan IDs exist for all 3 tiers (live and test
   mode have separate Plan objects in Razorpay — the `RAZORPAY_PLAN_ID_*`
   env vars must point to live-mode plan IDs, not the test-mode ones).
2. Set all 4 `RAZORPAY_*` vars on **all 3 Lambdas** (main, streaming,
   crawler) — see finding #3. Double-check, don't assume symmetry.
3. Register the live-mode webhook URL + secret in Razorpay's dashboard
   (live mode has its own separate webhook config from test mode) — set
   `RAZORPAY_WEBHOOK_SECRET` to the live-mode secret, not the test one.
4. Post-update, manually hit each Lambda to confirm cold start succeeds
   (no crash from missing/malformed env vars).
5. Run test #1 (happy path) with a real low-value live transaction —
   ideally your own card, smallest tier, then immediately cancel/refund via
   Razorpay dashboard.
6. Watch Razorpay dashboard + CloudWatch logs closely for the first 24-48h
   (per finding #5 — no automated alerting exists yet, so this is manual).

## Explicitly out of scope for this week

- Automated test coverage for billing (no test framework exists in
  `backend/` at all — tracked separately in `TODOS.md` as its own
  initiative, not a same-week blocker).
- The webhook idempotency atomicity fix (#4) — real but lower-probability;
  fast-follow, not a go-live blocker.
- Anything on `feature/meta-ads-integration` (Meta Lead Ads, WhatsApp
  agent/journeys) — unrelated, unmerged.

## Update 2026-07-26: fixes shipped + invoicing resolved + E2E verified

Branch `fix/razorpay-go-live-p0` (off `main`, not yet pushed/merged) closes
findings #1 and #3, and adds the GST invoicing gap from finding #2.

**Findings #1 and #3 fixed:**
- `webhook-service.ts` now logs `payment.failed` explicitly (payment id,
  Razorpay error code/description, resolved clientId if any) instead of
  silently dropping it. Deliberately does not touch subscription `status` —
  that stays driven by Razorpay's own lifecycle events, to avoid a race.
- `.env.example` now documents all 4 `RAZORPAY_*` vars plus the previously
  undocumented `DYNAMODB_TABLE_USAGE`, `DYNAMODB_TABLE_WEBHOOK_EVENTS`,
  `DYNAMODB_TABLE_PAYMENT_HISTORY`.

**Finding #2 (invoicing) resolved as: Razorpay issues the invoice, RigaChat
links to it.** Decision, not a guess — confirmed against Razorpay's actual
API docs before building: subscription charges carry a `payment.invoice_id`
in the webhook payload when the account's Razorpay settings have GST
details configured; `GET /v1/invoices/{id}` (`razorpayClient.invoices.fetch`)
returns a `short_url` — Razorpay's hosted, customer-facing invoice/receipt
page, tax-compliant per Razorpay's own account-level GST configuration.
RigaChat does not generate or store tax data itself.
- **Your action, not code**: add your GSTIN in the Razorpay Dashboard
  account settings. Without it, Razorpay won't generate invoices and
  `invoiceUrl` will just stay empty for every payment — the feature degrades
  gracefully (list still shows, no crash), it just won't have invoice links
  until that's configured.
- Shipped: `webhook-service.ts` fetches and stores `invoiceUrl` per payment
  (best-effort — a failed invoice lookup never blocks recording the
  payment itself). New `GET /api/billing/payments` route, `Billing` page in
  the client dashboard (nav entry added) showing date/amount/status/payment
  ID/invoice link per charge.

**E2E verified**, not just code-reviewed — ran a real local backend
(`npm run dev`, real test-mode Razorpay keys, real dev DynamoDB tables) and
POSTed correctly HMAC-signed webhook payloads covering all of these, all
passing:
invalid signature (400) · missing event-id header (400) ·
`subscription.activated` (status → active) ·
`subscription.charged` (payment_history row written, `currentPeriodEnd`
bumped, `invoiceUrl` correctly null when no `invoice_id` present) ·
duplicate event delivery (idempotent, no double-write) ·
`payment.failed` (logged, subscription status untouched) ·
subscription-id mismatch (ignored, no cross-account write) ·
unknown clientId (ignored, no crash) · unmapped event type (ignored) ·
`subscription.cancelled` (status → cancelled). Also verified
`getPaymentHistory` returns rows newest-first with `invoiceUrl` intact.

**Not yet E2E tested** (needs a real Cognito login, not just a script):
the actual browser checkout flow (`/api/billing/subscribe` → Razorpay
hosted checkout modal → activation), and the new Billing page rendering in
a real browser. Recommend running `/qa` against a real signup + checkout
before flipping to live keys.

**New finding, not yet fixed — hygiene, not urgent**: local `backend/.env`
has two different `RAZORPAY_WEBHOOK_SECRET=` lines (duplicate key, different
values). Node's `--env-file` silently uses the *last* one — confirmed by
testing, not assumed — so the server works, but this is confusing and worth
cleaning up locally: delete the stale line and confirm the remaining value
matches what's registered in Razorpay's dashboard for this webhook. Local
file only — doesn't affect the deployed Lambdas, which get their env vars
from the AWS Console directly, not from this file.

Also corrected: the webhook route is `POST /api/webhooks/razorpay`, not
`POST /webhooks/razorpay` as earlier in this doc — mounted under
`/api/webhooks` in `routes/index.ts`.

## Update 2026-07-26 (continued): live browser QA found a real billing bug

Ran `/qa` against this branch: provisioned a real throwaway Cognito account
(`admin-create-user` + `admin-set-user-password`, bypassing email
verification), logged into the actual dashboard, and drove the real
Upgrade-plan → Razorpay checkout flow in a browser. Confirmed real
Razorpay API calls, correct price/terms in the checkout modal, correct
"Test Mode" banner. The cross-origin Razorpay iframe couldn't be driven by
the browser tool (a tooling limitation, not a RigaChat issue), so
completing the card payment was simulated with a correctly-signed webhook
for that exact real subscription — standing in for what Razorpay's servers
send after a real card charge succeeds.

**Found: `Subscription.plan` is never updated anywhere in the subscribe →
activate flow.** After activation, `status` correctly flipped to `active`,
but `plan` stayed `free` — confirmed directly in DynamoDB, not just a UI
glitch. Since `entitlement-service.ts` computes limits via `PLANS[plan]`,
**a customer who pays for Starter/Growth/Agency would keep free-tier limits
(50 conversations/25 leads) indefinitely** despite being charged
correctly and `status` showing active. This is a pre-existing bug on
`main`, unrelated to this branch's other work — it surfaced now because
this was the first time anyone walked the full subscribe → activate loop
end-to-end instead of reviewing the webhook handler in isolation.

**Fixed**: `billing-service.ts`'s `subscribeToTier()` already sends
`{ clientId, tier }` as the Razorpay subscription's `notes` at creation
time, and Razorpay echoes `notes` back on every webhook for that
subscription — `webhook-service.ts` just never read `notes.tier` back out.
Now sets `Subscription.plan` from it whenever present and a recognized
billable tier.

**Re-verified after the fix**, in the same real browser session: re-sent a
signed `subscription.charged` webhook for the same real subscription,
confirmed `plan` flipped `free` → `starter` in DynamoDB, then confirmed in
the UI — Settings now shows "Starter / Active" with the correct 500
conversations/50 leads limits (was 50/25 before the fix), and the Billing
page correctly lists both payments (₹1,999.00, Paid, invoice column
gracefully shows "—" since no GSTIN is configured yet).

**No other bugs found.** Nav layout (desktop + mobile) verified clean with
the new Billing entry — an initial apparent mobile regression turned out to
be a testing artifact (resized viewport without navigating) rather than a
real bug; a fresh navigation at 375px collapses to the mobile hamburger
layout correctly, matching the rest of the app.

Test account, DynamoDB rows, and the Razorpay test-mode subscription were
all cleaned up after testing (Cognito user deleted, `subscriptions`/
`clients`/`payment_history` rows deleted, Razorpay subscription cancelled
via API). `webhook_events` rows from testing were left in place (90-day
TTL, same as production behavior, no cleanup needed).

**Given this finding, the recommendation changes**: this branch
(`fix/razorpay-go-live-p0`) should land before flipping to live keys, not
just be a nice-to-have. Going live without it means every paying customer
this week would be silently under-entitled relative to what they paid for.
