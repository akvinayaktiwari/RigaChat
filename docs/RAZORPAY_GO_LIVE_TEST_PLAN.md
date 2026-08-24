# Razorpay Go-Live Checklist

> Rewritten 2026-08-22, replacing the 2026-07-26 plan. That version's P0 list
> is now either fixed or superseded; what remains of it is folded in below.
>
> Everything here was verified against the running system on 2026-08-22 — live
> API calls, CloudWatch, DynamoDB and the deployed bundles — not inferred from
> the code.

**Current state (2026-08-24): production runs Razorpay in TEST mode.**
`RAZORPAY_KEY_ID` is `rzp_test_...` on all three Lambdas, so the `RAZORPAY_PLAN_ID_*`
values are test-mode plans and **no real payment can be taken**. Test mode works
end to end; live mode is entirely unverified.

---

## 1. Where things actually stand

### Verified working in test mode (2026-08-22, 14:51 UTC)

A real test-mode payment ran the whole path with no manual step:

```
14:51:19  payment.authorized      delivered, signature verified
14:51:22  payment.captured        delivered, signature verified
14:51:32  subscription.charged    -> payment_history row written
14:51:34  subscription.activated  -> status flipped to active
```

Account went `trialing/free` -> `active/starter` in **15 seconds**, inside the
frontend's 30s polling window. `payment_history` has its first real rows.

### Nothing in live mode has ever been exercised

Not the keys, not the plan IDs, not the webhook, not the secret. Assume each is
wrong until checked — three of them almost certainly are (see §2).

---

## 2. Cutover checklist

Do these in order. Steps 1–4 are all-or-nothing: a partial cutover leaves
checkout broken in a way that looks like a code bug.

### Step 1 — Create live-mode Plans

Live and test mode hold **separate Plan objects**. The current
`RAZORPAY_PLAN_ID_*` values (`plan_TFl5GSmRUtfMdr`, `plan_TFl6Ni0ElGMJ53`,
`plan_TFl7V2GGsEeYPV`) are **test-mode plans and do not exist in live mode**.

Create Starter / Growth / Agency in live mode at the same prices
(₹1,999 / ₹5,499 / ₹14,999, monthly) and record the new `plan_...` ids.

Verify each resolves before going further:

```bash
curl -u "$LIVE_KEY_ID:$LIVE_KEY_SECRET" https://api.razorpay.com/v1/plans/<plan_id>
```

### Step 2 — Point the live webhook at the Lambda

Live mode has its **own webhook with its own secret**. Check where it currently
points: the test-mode one was aimed at `beepboop.drsyeta.in`, a retired domain,
and had been silently swallowing every event for roughly a month (see §3).

- **URL:** `https://vyostra.com/api/webhooks/razorpay`
  (`/api/*` is routed to the Lambda — verified 2026-08-22. Prefer this over the
  raw Function URL, which changes if the Lambda is replaced.)
- **Events — all 8 mapped by `RAZORPAY_STATUS_MAP` in `webhook-service.ts`:**
  `subscription.activated`, `subscription.charged`, `subscription.pending`,
  `subscription.halted`, `subscription.paused`, `subscription.resumed`,
  `subscription.cancelled`, `subscription.authenticated`
- **Plus `payment.failed`**, handled explicitly for logging.
- **Do NOT add the other `payment.*` events.** They carry no subscription
  entity, so each one logs at ERROR and writes a dedup row for nothing.
- **Secret is mandatory.** With no secret Razorpay sends no
  `X-Razorpay-Signature` and every delivery is rejected.

Razorpay's webhook create/edit/delete API is **Partner-only** — a standard
account gets `404 no Route matched` on `PATCH` and `DELETE`. All of this is
dashboard work. `GET /v1/webhooks` does work for verification.

#### Do not copy the test webhook's event list

The **test** webhook currently subscribes **22** events (verified 2026-08-24) —
it includes `payment.authorized`, `payment.captured`, and all six
`payment.dispute.*` plus three `payment.downtime.*`. Only 9 of those matter.
Mirroring it into live re-creates the noise this doc warns about two bullets up:
every unmapped event logs at ERROR and writes a dedup row for nothing. Subscribe
the 9 listed above and nothing else.

#### Dashboard click path

1. **Confirm live mode is actually open.** Dashboard → top-left mode switch. If
   there is no **Live** option, or it prompts for KYC, stop — everything below
   is blocked until activation completes. This is the one step with an external
   dependency (Razorpay's review), so check it first.
2. Switch to **Live** mode. Every screen below is mode-scoped; the single
   easiest mistake here is editing the test webhook while believing it's live.
3. **Settings → API Keys → Generate Live Key.** The secret is shown **once**.
   That pair is `RAZORPAY_LIVE_KEY_ID` / `RAZORPAY_LIVE_KEY_SECRET`.
4. **Settings → Webhooks → Add New Webhook.**
   - URL: `https://vyostra.com/api/webhooks/razorpay`
   - Secret: generate a strong one; this is `RAZORPAY_LIVE_WEBHOOK_SECRET`.
     Record it now — like the API secret, it is not shown again.
   - Tick exactly the 9 events listed above.
5. Verify it registered, without trusting the UI:
   ```bash
   curl -s -u "$RAZORPAY_LIVE_KEY_ID:$RAZORPAY_LIVE_KEY_SECRET" \
     https://api.razorpay.com/v1/webhooks
   ```
   Expect one item, `active: true`, the vyostra.com URL, 9 events.

Then run `./scripts/razorpay-go-live.sh` (Step 3) — dry run first.

### Step 3 — Set the live env vars on ALL THREE Lambdas

`rigachat-api`, `rigachat-api-streaming`, `rigachat-crawler`.

| Var | Value |
|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_...` |
| `RAZORPAY_KEY_SECRET` | live secret |
| `RAZORPAY_WEBHOOK_SECRET` | the **live** webhook's secret from Step 2 |
| `RAZORPAY_PLAN_ID_STARTER/GROWTH/AGENCY` | the **live** plan ids from Step 1 |

**All three Lambdas, without exception.** `lib/razorpay.ts` reads the key at
**module load** and throws if absent, and all three run the same bundle with
`index.ts` importing the full route tree. Miss one and that Lambda crashes at
cold start entirely — the whole chatbot/leads/crawler pipeline on it, not just
billing.

Use the script. `aws lambda update-function-configuration --environment`
**replaces the entire variable map**, so a hand-rolled update silently deletes
`OPENAI_API_KEY`, the Cognito ids, everything:

```bash
export RAZORPAY_LIVE_KEY_ID=rzp_live_xxx
export RAZORPAY_LIVE_KEY_SECRET=xxx
export RAZORPAY_LIVE_WEBHOOK_SECRET=xxx        # the LIVE webhook's secret, from Step 2

./scripts/razorpay-go-live.sh                  # dry run: finds/echoes plans, changes nothing
./scripts/razorpay-go-live.sh --apply          # creates live plans + writes all three Lambdas
```

`razorpay-go-live.sh` does Step 1 and Step 3 together: it read-modify-writes all
six vars on all three functions, re-reads to confirm the key landed as
`rzp_live_`, and fails if the variable count changed (a replaced map that lost
`OPENAI_API_KEY` shows up as a count drop, not a silent success). It refuses a
`rzp_test_` key, and refuses `--apply` without the live webhook secret — live
keys plus a test webhook secret is the exact half-migration that rejects every
delivery.

The env budget is tight (~2350 / 4096 bytes). These are replacements, not
additions, so it does not move — but do not add new vars during cutover.

### Step 4 — Verify before taking money

```bash
# every Lambda cold-starts (a missing var crashes on import, not on request)
for f in rigachat-api rigachat-api-streaming rigachat-crawler; do
  aws lambda invoke --function-name $f --payload '{}' /tmp/out-$f.json >/dev/null && echo "$f ok"
done

# routing + signature rejection still correct
curl -s -X POST https://vyostra.com/api/webhooks/razorpay \
  -H 'X-Razorpay-Signature: bogus' -d '{}'      # expect {"message":"Invalid signature"}
```

Then **one real low-value payment** — Starter, your own card — and confirm all
three landed:

1. `subscriptions` row -> `active`, `plan` matching the tier
2. a new `payment_history` row with the right `paymentId` / `amount`
3. `subscription.charged` + `subscription.activated` in CloudWatch

Refund it in the Razorpay dashboard afterwards.

**Do not skip the real payment.** Everything upstream of it can look correct
while the webhook still fails — that is precisely what happened for a month in
test mode.

---

## 3. Traps that cost real time on 2026-08-22

Each of these was found the expensive way.

### CloudFront rewrites 404 to 200, so failures look like successes

The distribution's `CustomErrorResponses` map 403/404 onto `/index.html` with
**HTTP 200**. Consequences seen:

- The Razorpay webhook pointed at a retired domain served by the frontend
  distribution. Razorpay POSTed, got **200 + HTML**, marked every event
  delivered, and retried nothing. `payment_history` was empty for a month.
- A deploy shipped an `index.html` referencing a bundle that `--delete` had just
  removed. It would have 404'd -> 200 -> blank page, no error anywhere.

Already documented for `fetch` at `frontend/src/services/api.ts:76`. The real
fix is scoping `CustomErrorResponses` away from `/api/*`; until then, **assume a
200 from any endpoint proves nothing unless the body is what you expect.**

### Verifying a shared secret against itself proves nothing

Signing a probe with the secret read *from the Lambda* and confirming the Lambda
accepts it is circular — it only shows the Lambda agrees with itself. The
dashboard secret can still differ, and did. **Only real provider traffic, or a
payload signed with the secret read from the dashboard, tests the match.**
Symptom of a mismatch: repeated `Razorpay webhook rejected: invalid or missing
signature`.

### Most test cards are not eligible for recurring payments

`4111 1111 1111 1111` and `4100 2800 0000 1007` are refused with *"This card is
not eligible for recurring payments"*. Use **`5104 0600 0000 0008`**.

Check any card against the same endpoint Checkout uses — `recurring` in the
response predicts the modal exactly:

```
https://api.razorpay.com/v1/payment/flows?key_id=<key>&iin=<first 6 digits>
```

Account-level eligibility: `GET /v1/preferences?key_id=...` -> `methods.recurring`.

### Two CloudFront distributions serve the dashboard bucket

`E2ZWB77M7V8J9X` (vyostra.com, live) and `E24Z9D4G4FY8PH`
(beepboop.drsyeta.in, retired). `scripts/deploy.sh` resolves by alias — do not
hardcode an id, or you will invalidate the wrong one and keep serving stale
HTML while the script prints success.

### `total_count: 1200` is correct

100 years of monthly billing, Razorpay's documented maximum. Verified against
the API. It is not the cause of a failing `createSubscription`. Note customers
see an end date of 2126 on the checkout modal.

---

## 4. Repair tooling

All dry-run by default; pass `--apply` to write.

| Script | Use when |
|---|---|
| `backend/scripts/reconcile-razorpay-subscription.ts <clientId>` | Payment succeeded but the webhook never landed — writes status, plan, `currentPeriodEnd` and the `payment_history` row from Razorpay's own data. Skips payments already recorded, so it cannot double-record. |
| `backend/scripts/repair-missing-trial-subscriptions.ts` | A client has no `subscriptions` row (checkout 500s with `NO_SUBSCRIPTION_RECORD`). **Do not use `backfill-subscriptions.ts` for this** — it writes `status: active` with the client's paid plan, granting a free upgrade and turning the 500 into a 409. |
| `scripts/set-razorpay-webhook-secret.sh <secret>` | Rotating the webhook secret across all three Lambdas safely. |

### Detecting a stranded payment

Razorpay dashboard -> Payments (last 24h, captured) is the source of truth.
A captured payment with no matching `payment_history` row means the webhook
failed. `subscriptions` rows sitting in `pending_activation` more than a few
minutes after a successful charge mean the same.

Self-healing now covers some of this: a `pending_activation` hold older than 30
minutes is verified against Razorpay on the next checkout attempt, and if it was
in fact paid the row is corrected to `active`. It does **not** write the missing
`payment_history` row — use the reconcile script for that.

---

## 5. Known-open, not blocking cutover

**Razorpay webhook idempotency is still read-then-write.**
`processRazorpayWebhook` uses `hasProcessed()` + `markProcessed()`, so two
concurrent deliveries of the same event can both pass the read before either
writes — a duplicate `payment_history` row. `claimWebhookEvent()` in
`webhook-event-repository.ts` is the atomic, conditional version and already
exists; the Razorpay path simply does not use it. **Small fix, real money once
live — best fast-follow after cutover.**

**`computeEntitlements()` fails open on a missing subscription row.**
`entitlement-service.ts` returns `buildFullTrialEntitlements()` when the row is
null — a trial with no `trialEndsAt`, so it never expires. Deliberate
fail-open, but it grants access rather than denying it. Rows now self-heal
(`ensureTrialSubscription`), so this should rarely trigger; worth a conscious
decision rather than leaving it as an accident.

**No automated alerting on billing failures.** Watch CloudWatch manually for the
first 24–48h after cutover. Markers worth alerting on:
`[signup-integrity]`, `Razorpay webhook rejected`, `Billing subscribe failed`.

**Test-mode card tokens expire after 3 days**, so a recurring auto-debit can
only be exercised within 3 days of the token being created.

---

## 6. Test matrix

Run in test mode; repeat #1 once in live mode before announcing.

| # | Path | Verify |
|---|---|---|
| 1 | New subscription, payment succeeds | webhook fires -> row `active` -> frontend poll picks it up within 30s -> entitlements unlock |
| 2 | Declined card | Razorpay shows its own message; `payment.failed` logged with payment id and error code |
| 3 | Modal dismissed mid-payment | `ondismiss` -> clicking the same tier resumes the *same* subscription; only one subscription object in Razorpay |
| 4 | Page refresh after dismissing | `409 ALREADY_SUBSCRIBED` carries `providerSubscriptionId` + `razorpayKeyId`; frontend resumes |
| 5 | **Abandoned checkout, retried after 30 min** | hold released, old subscription cancelled at Razorpay, **new tier honoured** |
| 6 | Duplicate webhook delivery | second delivery short-circuits; no duplicate `payment_history` row |
| 7 | Renewal charge succeeds | `currentPeriodEnd` bumped, `payment_history` row added |
| 8 | Subscription cancelled in dashboard | local status -> `cancelled`, entitlements downgraded, re-subscribe still works |
| 9 | Invalid signature | `400`, event NOT marked processed, nothing mutated |
| 10 | `notes.clientId` mismatching `providerSubscriptionId` | cross-check no-ops instead of corrupting another account |
| 11 | Internal account subscribes | `409 INTERNAL_ACCOUNT_NO_BILLING`, no Razorpay subscription created |
| 12 | India region detection | `detectRegion()` (`frontend/src/lib/pricingTiers.ts:61`) routes to checkout, not the `intl` mailto |

Automated coverage exists for much of this: `billing-service.test.ts` (15),
`client-service.test.ts` (8), `razorpay-provider.test.ts` (10),
`webhook-service.test.ts` (10). The 2026-07-26 note that no backend test
framework existed is obsolete — the suite is 548 tests.

---

## 7. Accounts that cannot check out

Both refusals are correct behaviour, and both cost debugging time by looking
like bugs:

- **`isInternal: true`** -> `409 INTERNAL_ACCOUNT_NO_BILLING`, checked *before*
  status. As of 2026-08-22 this is the founder's own account and the Meta
  app-review account. Query for them rather than hardcoding addresses here:
  `aws dynamodb scan --table-name subscriptions --filter-expression isInternal=:t`
- **`status: active`** -> `409 ALREADY_SUBSCRIBED`.

**One email can map to two Cognito accounts** with opposite outcomes — one
internal and one not, in at least one real case — so signing in with the same
address twice does not guarantee the same account. When
checkout 409s, read `code` in the response body before assuming anything.
