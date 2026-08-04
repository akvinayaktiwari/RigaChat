# TODOS

## Frontend

### Add error handling to data-load effects app-wide

**What:** 13 pages (including `DashboardHome.tsx`, `LeadsPage.tsx`, `BotsPage.tsx`, `BotDetailPage.tsx`, `FormDetailPage.tsx`, `FormsPage.tsx`, `KnowledgeBasePage.tsx`, `LeadDetailPage.tsx`, `FormLeadsPage.tsx`, `NewBotPage.tsx`, `VoiceKnowledgeBasePage.tsx`, `VoiceAgentDetailPage.tsx`, `AuthCallbackPage.tsx`) load data via `Promise.all([...]).then(...)` with no `.catch()`. A rejected fetch leaves `loading` stuck `true` forever — the user sees an infinite skeleton with no error message and no way to retry.

**Why:** Any transient API failure (network blip, 500, expired session) currently fails silently and permanently on these pages. Discovered via a test-coverage audit while shipping the dashboard redesign — verified it's the same pattern on all 13 pages, not something that branch introduced.

**Context:** Needs a shared pattern, not a one-off fix per page — e.g. a small `useAsyncData` hook or a top-level `ErrorBoundary` plus a per-page error state, applied consistently. Fixing just 1-2 pages in isolation would leave the rest inconsistent and this exact gap would just resurface next time someone touches one of the other 11.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Build a unified leads dashboard across chat, form, and Meta sources

**What:** `LeadsPage.tsx` (chat leads) and `FormLeadsPage.tsx` (form leads) are separate pages today; the Meta Lead Ads integration adds a third source with its own bare-bones list page for MVP. An agency using all three sources has to check 2-3 separate pages to see their full pipeline.

**Why:** Better UX, and sets up cleanly for whatever the next lead source ends up being (Google Ads, TikTok Lead Ads, etc.) instead of accumulating one page per source indefinitely.

**Context:** Flagged as an Open Question in the Meta Ads design doc (`~/.gstack/projects/akvinayaktiwari-RigaChat/akvinayaktiwari-feature-meta-ads-integration-design-20260725-024416.md`) and deliberately deferred out of that branch — Meta leads land in their own table/API first, readable via a page mirroring `FormLeadsPage.tsx`, and this is the "actually make it nice" follow-up once that's landed.

**Effort:** M
**Priority:** P3
**Depends on:** Meta Lead Ads backend integration landing first

### Add a field-mapping UI for Meta Lead Ads custom questions

**What:** Meta Lead Ads forms have client-configurable custom questions with arbitrary labels. MVP does best-effort auto-mapping by label matching (e.g. a question labeled "phone" maps to `phone`) and stores anything unmatched as a raw custom field, same as `FormLead.customFields` does today. A dedicated mapping UI (mirroring how the form builder defines `FormField[]`) would let clients map Meta's question labels to `name`/`phone`/`email`/`propertyInterest`/`budgetRange` explicitly.

**Why:** Clean, correctly-populated CRM/WhatsApp-notification data from day one instead of relying on label-matching heuristics.

**Context:** Deferred pending evidence clients actually need it — many clients may use Meta's default lead form template as-is, in which case auto-mapping is sufficient indefinitely. Revisit if auto-mapping visibly mishandles real client forms.

**Effort:** M
**Priority:** P3
**Depends on:** Meta Lead Ads backend integration landing first

## Backend

### Introduce a backend test framework (vitest)

**What:** Zero test infrastructure exists in `backend/` today — no jest/vitest config, no test files, no `test` script in `package.json`. Every integration (Zoho, Gupshup, Razorpay, and now Meta) ships and is verified manually via `/qa`.

**Why:** Unlocks safe refactoring everywhere, including the CRM-sync retry-loop extraction the Meta integration branch is doing. Catches the class of bug this review found twice in one session (a Lambda-freeze bug with no visible symptom, and a webhook signature check whose failure mode is also invisible until exploited).

**Context:** Bigger, standalone initiative — retrofitting tests onto ~15+ existing untested files is real effort, not a quick config change. Recommend its own planning pass (possibly its own `/office-hours`) rather than deciding the scope here. vitest is the natural fit given the existing ts-node/ESM setup.

**Effort:** L
**Priority:** P2
**Depends on:** None, but ideally lands before large refactors like the CRM-sync extraction or the form-lead-service.ts fix above

### Meta webhook idempotency doesn't cover CRM sync / WhatsApp notify atomically

**What:** `hasProcessed`/`markProcessed` in `webhook-event-repository.ts` are check-then-act (a plain Get, then later a plain Put), and in the Meta pipeline (`meta-lead-service.ts`'s `processSingleLeadgenEvent`), `markProcessed` isn't called until after the Graph API fetch, CRM sync, and WhatsApp send all complete. Two concurrent deliveries for the same `leadgen_id` (Meta's own docs acknowledge redelivery is possible) can both pass `hasProcessed` before either writes, causing a duplicate `meta_leads` row, a duplicate CRM push, and a duplicate WhatsApp alert to the client.

**Why:** Same pattern already exists for Razorpay's webhook handling, so it's not unique to this branch — but the window here is proportionally wider (three external calls in between vs. Razorpay's DB-only tail) and now has a second customer-visible symptom (WhatsApp spam), not just a data question.

**Context:** Found during the adversarial pass of this branch's `/review`. Proper fix is an atomic claim (conditional-put-as-lock, done before any side effects) rather than the current read-then-eventually-write pattern — a cross-cutting change to `webhook-event-repository.ts` that affects Razorpay too, so it deserves its own scoped design pass rather than a quick patch inside the Meta branch.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Meta lead PII can leak across tenants during a Page reassignment race

**What:** If a `leadgen` webhook delivery fails transiently, it's deliberately left unmarked so Meta's redelivery (immediate, then decaying over ~36h) can retry it. If, in that window, the connected Page is disconnected from Client A and reconnected by Client B (the documented way to transfer a Page — see the "Page hijack" fix in this same branch), the eventual successful redelivery resolves `pageId → clientId` at *delivery time*, not capture time. Client A's original end-customer's name/phone/email would get written into Client B's `meta_leads`, CRM, and WhatsApp notification.

**Why:** A real cross-tenant PII exposure, though it requires a specific timing window (failed delivery + page reassignment before the retry succeeds) to trigger — not as immediately exploitable as the two bugs fixed directly in this branch (disconnect-without-ownership-check, non-atomic page claim), but a genuine gap.

**Context:** Found during the adversarial pass of this branch's `/review`. Needs a real design decision: e.g. stamp `meta_page_lookup` rows with a connection/generation id, and have the webhook handler bind each in-flight retry to the mapping generation that existed at first delivery attempt, rejecting (not redirecting) a redelivery whose generation has since changed.

**Effort:** M
**Priority:** P2
**Depends on:** None

### connectMetaAds' two writes aren't transactional

**What:** `connectMetaAds` claims the page mapping (`setPageClientMapping`) and then updates the client record (`updateClient` setting `metaConnection.connected = true`) as two independent, sequential DynamoDB writes, not a `TransactWriteItems`. If the second write fails after the first succeeds (transient DynamoDB error), the page mapping exists and points at this client, but the client's own record doesn't reflect it — `/meta/status` would show "not connected" while the routing row silently exists and could route real leads nowhere useful (no code path reads it in that state) or block a legitimate retry.

**Why:** A partial-failure edge case, not a security bug — the ordering fix already applied in this branch (claim the page mapping before touching the client record) makes the more dangerous ordering impossible, but true atomicity would close this residual gap.

**Context:** Found during the adversarial pass of this branch's `/review`. `TransactWriteItems` across `meta_page_lookup` and `clients` would close this; deferred since transient DynamoDB write failures are rare and the current ordering already avoids the worse failure mode.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Meta data deletion callback fabricates success without deleting anything

**What:** `handleMetaDataDeletionRequest` in `meta-lead-service.ts` verifies the signed request, then returns a fabricated `meta-deletion-${Date.now()}` confirmation code without looking up or deleting any data — there is no code path anywhere in the repo that purges a client's Meta-sourced data. The response also points the user at `{FRONTEND_URL}/data-deletion-status?id=...`, a page that does not exist in `frontend/src/pages` — the URL Meta's platform (and any end user who follows it) receives 404s.

**Why:** This is Meta's mandated data-deletion callback contract, and right now it always claims success without performing or being capable of performing the deletion (the codebase doesn't store a Meta user_id anywhere to correlate the request to a specific lead/client — the existing "KNOWN LIMITATION" comment on `parseSignedRequest` already flags the correlation gap; this TODO adds the concrete consequence: a broken confirmation flow, not just a missing auto-disconnect).

**Context:** Found during the adversarial pass of this branch's `/ship`. Needs a real design decision: either store enough Meta identifiers to actually locate and purge affected records (and build the `/data-deletion-status` page), or be upfront in the callback response about the manual process, rather than returning a URL that 404s. Relevant before submitting for Meta App Review, since reviewers may test this callback.

**Effort:** M
**Priority:** P1
**Depends on:** None

### Empty Graph API field_data on lead fetch is treated as a valid (empty) lead

**What:** `fetchLeadFieldData` in `meta-provider.ts` returns `data.field_data ?? []` — if Meta's Graph API responds before the lead's field data has propagated (a known eventual-consistency lag between webhook delivery and field_data availability), the lead is persisted as a real record with all fields empty and permanently marked processed, rather than retried.

**Why:** A silently degraded lead (name/phone/email all blank) is worse than a missing one — it shows up in the CRM/dashboard looking like real signal, and there's no path to backfill it later since the idempotency key is already marked processed.

**Context:** Found during the adversarial pass of this branch's `/ship`. Needs a decision on retry strategy (e.g., treat an empty `field_data` array as retryable for a bounded number of attempts before accepting it as genuinely empty) rather than a one-line fix.

**Effort:** S
**Priority:** P2
**Depends on:** None

### mapMetaFieldData silently truncates multi-value answers and has undocumented match precedence

**What:** `mapMetaFieldData` in `meta-lead-service.ts` always takes `values[0]` for a Meta Lead Ads field, silently discarding any additional values (e.g. a multi-select question). Its label-matching `if/else if` chain (phone before email before property before budget) also means a field name matching multiple branches resolves via chain order with no logging when that happens.

**Why:** Both are silent-data-loss risks that would be invisible without inspecting Meta's raw payload directly — a client whose Lead Ads form uses a multi-select question would never know their platform is only capturing the first answer.

**Context:** Found during the adversarial pass of this branch's `/ship`. Low urgency unless a client's actual form uses multi-value questions or ambiguous labels — revisit if real Meta lead data shows this happening.

**Effort:** S
**Priority:** P3
**Depends on:** None

### WhatsApp Meta Direct — PR #2 (webhook routing, disconnect/migration UX, token lifecycle)

**What:** Follow-up to the Meta Direct WhatsApp integration (PR #1: provider, Embedded Signup, DB fields, dispatch wiring). Three pieces deferred out of PR #1: (1) webhook routing / phone-number lookup table for identifying which client an inbound WhatsApp message belongs to, (2) disconnect/migration UX for moving a client between Gupshup and Meta Direct (or back), (3) Meta access-token lifecycle handling — expiry, refresh, and what happens on client-initiated disconnect or Meta-initiated revocation.

**Why:** Currently these only exist as Open Questions in a design doc (`akvinayaktiwari-feature-whatsapp-meta-direct-design-20260727-173508.md`) that stops being anyone's active focus the moment PR #1 ships. Without a tracked item, this relies on someone remembering a design doc months later.

**Context:** The webhook routing table's exact payload shape is still unverified against real Meta Cloud API webhooks (should reuse the `meta_page_lookup` atomic-claim pattern from `meta-lead-repository.ts` as the model, per the design doc's Premise 6). Re-verify whether this is still needed before building — if the Agents/Journeys pilot (the intended consumer) hasn't started within a few months of PR #1 shipping, treat the routing-table shape as provisional and re-check it against whatever that work actually needs.

**Effort:** M
**Priority:** P2
**Depends on:** PR #1 (WhatsApp Meta Direct provider + Embedded Signup) shipped and proven first.

### Fully remove Gupshup once Meta Direct is proven

**What:** Sunset the Gupshup WhatsApp connector entirely once the Meta Direct integration has real production usage and the cost/dependency thesis is validated.

**Why:** Stated founder intent during the Meta Direct design session ("i will remove gupshup entirely in future") — removes a third-party BSP dependency and its markup on top of Meta's own conversation fees. No tracking existed for this beyond the conversation itself.

**Context:** No committed timeline. Blocked on: Meta Direct (PR #1 + PR #2) shipped, proven with real client volume, and the actual Gupshup-vs-Meta cost delta confirmed (never quantified — see the design doc's Open Question 1). Revisit this item once those conditions are met rather than acting on a vague "eventually."

**Effort:** L (migrating existing connected clients, removing Gupshup code paths, updating docs/env vars)
**Priority:** P3
**Depends on:** Meta Direct PR #1 + PR #2 shipped and proven in production.

### Provision the contact_messages table + SES sender before /api/contact goes live

**What:** The marketing-site contact form (branch `feature/contact-form`) is code-complete and tested, but three manual AWS steps are needed at deploy. State below verified live against account `291685935704` / `ap-south-1` on 2026-08-04 — none of it is assumed:

1. **Create the `contact_messages` table** — partition key `messageId`, GSI `recordType-createdAt-index` (`recordType` HASH, `createdAt` RANGE), definition in `backend/src/lib/dynamo-schema.ts`. Confirmed absent today. Then set `DYNAMODB_TABLE_CONTACT_MESSAGES` **directly on all three Lambdas** (`rigachat-api`, `rigachat-api-streaming`, `rigachat-crawler`).
2. **Set `SES_FROM_EMAIL` + `CONTACT_NOTIFICATION_EMAIL`** on the same three Lambdas. Both confirmed unset. SES itself is in better shape than expected: `vyostra.com` is already a verified identity with DKIM `SUCCESS`, and sending is enabled.
3. **Add `ses:SendEmail` to the Lambda execution roles** — `rigachat-api-role-4c9qsico` (used by both `rigachat-api` and `rigachat-crawler`) and `rigachat-api-streaming-role-625vca9z`. Neither has any SES permission today. DynamoDB needs nothing: both roles already carry `AmazonDynamoDBFullAccess`, which covers the new table automatically.

**Why:** Step 1 is a cold-start hazard, not a feature gap: `contact-message-repository.ts` calls `getTableName('contact_messages')` at module load and the shared bundle imports the whole route tree, so a missing env var throws for *every* route on that Lambda, not just `/api/contact` (same failure mode as the Agent tables entry above). Steps 2-3 are not hazards — `getSesConfig()` is read lazily per send, so an unconfigured or unauthorized SES only means submissions are stored with `notified: false` and no email goes out. Nobody is alerted, but no message is lost; `getContactMessages()` in the repository reads them back.

**Context:** Same class of hand-provisioned infra step as the Agent tables and scheduler ARNs already tracked here — there is no IaC in this repo (see `docs/INFRASTRUCTURE.md`).

Two things that are easy to get wrong here:

- **Do not add these as GitHub secrets and expect them to land.** `ci.yml`'s "Update Lambda environment variables" step merges a *hardcoded allowlist* (`WHATSAPP_*`, `REDIS_PROVIDER`, `UPSTASH_*`, `SQS_CRAWLER_QUEUE_URL`) onto whatever the function already has. No DynamoDB table name is in that list — every existing one lives directly on the Lambda and survives deploys only because of that `jq '. + {...}'` merge. A new GH secret would be silently ignored unless `ci.yml` is edited too.
- **The SES sandbox (`ProductionAccessEnabled: false`) is not a blocker for this feature specifically.** Sandbox restricts *destinations* to verified identities, and `vyostra.com` is verified — so a `support@vyostra.com` destination works today. Production access is only needed if the notification address ever moves off a verified domain. Do not treat "get out of the sandbox" as a prerequisite for shipping this.

Also worth deciding at deploy time whether the ops console should surface these messages; the repository's `getContactMessages()` exists for exactly that but has no route or UI in front of it yet.

**Effort:** S
**Priority:** P1
**Depends on:** the `feature/contact-form` branch merged/deployed

## Completed

### Fix un-awaited CRM sync in form-lead-service.ts (Lambda-freeze risk)

`captureFormLead` now awaits `syncFormLeadToCRM(...)` (still error-swallowed, never fails lead capture), closing the Lambda-freeze window that could drop form-lead CRM syncs mid-flight. P1/S. Verified: build + 21 backend tests pass.

### Add aria-live region to Toast component

`Toast.tsx` container now has `aria-live="polite"`; error toasts escalate to `role="alert"` (assertive), success/warning use `role="status"`. Toasts are now announced to screen readers app-wide. P2/S. Verified: frontend typecheck passes.

### Point the remaining formatRelativeDate copies at the shared lib

Deleted the local `formatRelativeDate` copies in `FormLeadsPage.tsx`, `KnowledgeBasePage.tsx`, and `VoiceKnowledgeBasePage.tsx`; all three now import the shared `frontend/src/lib/date.ts`, which clamps future-drifted dates to "0 minutes ago". P3/S. Verified: frontend typecheck passes.
