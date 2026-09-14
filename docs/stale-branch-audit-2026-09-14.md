# Stale branch audit — 2026-09-14

Nine branches on `origin` are not merged into `main`. Eight of them predate this
week; the ninth is `refactor/one-voice-token-validator`, written on 11 Sep and
waiting on a merge, so it is not audited here.

The reason for looking: GitHub issues #17 and #28 both turned out to be **already
shipped and never closed**. A branch is the same failure with a worse shape —
nobody reads it, and its content may be on `main` by another route, half on
`main`, or genuinely missing. So every verdict below was checked against the code
on `main`, not against the branch name or the commit subject.

**`git cherry` is not sufficient and was not trusted.** It compares patch ids,
so a change that landed with one character of difference reads as unmerged. Four
of these branches report as unmerged by patch id and are fully present on `main`.

## Verdicts

| Branch | Last commit | Verdict |
|---|---|---|
| `fix/prerendered-html-cache-control` | 2026-08-30 | **Shipped elsewhere.** Delete. |
| `fix/meta-oauth-error-surfacing` | 2026-08-09 | **Shipped elsewhere.** Delete. |
| `fix/journey-p1s` | 2026-08-29 | **Shipped elsewhere.** Delete. |
| `feat/whatsapp-embedded-signup-register` | 2026-08-30 | **Shipped elsewhere.** Delete. |
| `test/frontend-lib-coverage` | 2026-08-14 | **Two thirds shipped; the rest recovered today.** Delete. |
| `spec/lead-evidence-ledger` | 2026-08-13 | **Genuinely unmerged, premise still holds.** Land it, with a staleness note. |
| `docs/meta-login-blocked-support-report` | 2026-08-14 | **Genuinely unmerged, and now historical.** Delete without landing. |
| `fix/razorpay-go-live-p0` | 2026-07-26 | **Genuinely unmerged, and must NOT be merged as-is.** |

## The four that are already on main

Nothing to do but delete the branch. Evidence in each case is a symbol or a
comment the branch adds, present in the working tree of `main`:

- **`fix/prerendered-html-cache-control`** — `scripts/deploy.sh` excludes `*.html`
  (not `index.html`) from the immutable-cache sync and rewrites every HTML file
  with `cp --recursive`; `frontend/vitest.config.ts` sets `pool: 'threads'` with
  the comment about forks silently running a smaller suite. Both present.
- **`fix/meta-oauth-error-surfacing`** — patch-identical to a commit on `main`
  (the only one of the eight `git cherry` marks as merged).
  `frontend/src/pages/DataDeletionStatus.tsx` exists. Note the branch name
  describes work its single commit does not contain, which is part of why it read
  as outstanding.
- **`fix/journey-p1s`** — `ResolvedConditionFields` and `JourneyExecutionEvent`
  are in `backend/src/types/index.ts` (and the latter in the frontend's too), and
  the orphaned-claim comment it adds sits in `journey-service.ts`.
- **`feat/whatsapp-embedded-signup-register`** — `registered`,
  `twoStepPinEncrypted` and `tokenExpiresAt` are on the connection type,
  `registerPhoneNumber` is in `meta-whatsapp-provider.ts`, and
  `meta-whatsapp-webhook-service` handles `account_update`.

## The one that was two thirds shipped

**`test/frontend-lib-coverage`** wrote tests for the three libs TODOS.md named as
uncovered. `lead-ref.test.ts` reached `main` with the inbox work, so the branch
looked landed — while `lead-display.test.ts` and `phone.test.ts` sat on it,
including the only assertion that the frontend's urgency tiers agree with the
order the server sorts the queue by.

Recovered today. They did not apply unchanged: `UnifiedLead` has since gained a
required `urgencyTier`, so every fixture failed `tsc` while `npm test` passed —
`npm test` does not typecheck. 45 tests; frontend suite 396 → 441.

## The three that are genuinely unmerged

### `spec/lead-evidence-ledger` — land it

A 350-line spec for scoring a lead from observed evidence rather than from a
model's self-reported confidence. Its premise still holds exactly: nothing on
`main` writes `LeadState.leadScore`, and `journey-executor-service.ts` still
says `lead_score` returns false because no scoring model has been specified.

Two facts in its "Current State" table have expired and would mislead a reader:

- It measures Lambda env headroom against **30 `DYNAMODB_TABLE_*` variables**.
  Those were removed on 2026-08-16; names live in `lib/table-names.ts` and the
  budget it treats as nearly full is not.
- It says `recheckField: 'lead_score'` has nothing to compare against. Condition
  resolution now merges `lead_score: String(state?.leadScore ?? 0)` into the
  execution state, so the read path exists; only the writer is missing.

Recommendation: merge the doc with a dated preamble saying what has moved, rather
than leaving a 350-line design invisible on a branch. Not done here — the spec is
a proposal nobody has accepted, and adopting it is a product decision.

### `docs/meta-login-blocked-support-report` — delete

A support report written for an app-wide Facebook Login block. The Vyostra Meta
app has since gone live and Lead Ads was approved on 2026-08-26, so the report
documents a resolved incident and its "what we need from you" section is
addressed to a support case that closed. Nothing on `main` is missing because of
it. If the incident is worth remembering, it belongs in a changelog entry, not
as a live support report.

### `fix/razorpay-go-live-p0` — do not merge as-is

37 lines added to `docs/RAZORPAY_GO_LIVE_TEST_PLAN.md` on 2026-07-26, absent
from `main`. **The content is out of date in a way that would cost someone a
day**, which is worse than the gap it fills:

- It names three Razorpay test cards as the ones to use. The card that was later
  verified as recurring-eligible is a different one, and at least one commonly
  cited card is **not** recurring-eligible — a tester following this doc would
  conclude the integration is broken.
- It describes the blocker as Razorpay's Subscriptions product awaiting
  activation. What has since been established is that the production account runs
  in **test mode**, which is a different blocker with a different fix.

The useful part is the shape of the report — "the blocker is not engineering
readiness" — not its contents. It should be rewritten against what is true now,
in the doc on `main`, and the branch deleted. That rewrite needs the current
Razorpay dashboard state, which is not readable from here.

## What to run

Nothing below was run. Deleting a branch is not reversible from a laptop that
never fetched it, and five of these are someone else's to delete.

```bash
# Shipped elsewhere, or recovered — safe to delete once you agree with the evidence above.
git push origin --delete fix/prerendered-html-cache-control
git push origin --delete fix/meta-oauth-error-surfacing
git push origin --delete fix/journey-p1s
git push origin --delete feat/whatsapp-embedded-signup-register
git push origin --delete test/frontend-lib-coverage

# Historical, nothing on main depends on it.
git push origin --delete docs/meta-login-blocked-support-report
```

Keep `spec/lead-evidence-ledger` until its spec is either landed or rejected, and
`fix/razorpay-go-live-p0` until its content is rewritten — deleting that one
loses the only record of the July investigation.

Local branches are a separate, larger pile (75 of them, 35 with no upstream).
They cost nothing and are not audited here.
