# TODOS

## Frontend

### Add error handling to data-load effects app-wide

**What:** 15 pages (including `DashboardHome.tsx`, `LeadsPage.tsx`, `BotsPage.tsx`, `BotDetailPage.tsx`, `FormDetailPage.tsx`, `FormsPage.tsx`, `KnowledgeBasePage.tsx`, `LeadDetailPage.tsx`, `FormLeadsPage.tsx`, `NewBotPage.tsx`, `VoiceKnowledgeBasePage.tsx`, `VoiceAgentDetailPage.tsx`, `AuthCallbackPage.tsx`, `SchedulerPage.tsx`, `AppointmentsPage.tsx`) load data via a `.then((res) => setX(res.data ?? []))`-shaped effect with no check on `res.success` and no `.catch()`. Two distinct failure symptoms, same root cause: a genuinely rejected promise (network error) leaves `loading` stuck `true` forever (infinite skeleton); an HTTP error response that still resolves normally (e.g. a 500 with a well-formed `{success:false, error:...}` body) has its failure silently swallowed by `res.data ?? []`, showing a *misleading empty state* ("No schedules yet") instead of either an error or the truth.

**Why:** Any transient API failure (network blip, 500, expired session) currently fails silently on these pages, either hanging or lying about the actual state. Originally discovered via a test-coverage audit (13 pages); the empty-state variant was confirmed live on 2026-07-29 while browser-verifying `SchedulerPage.tsx` against a real (missing) DynamoDB table — the create-form path on that same page handles the identical error correctly (shows `res.error` inline), while its list-load path does not, on the very same page. Not a hypothetical.

**Context:** Needs a shared pattern, not a one-off fix per page — e.g. a small `useAsyncData` hook or a top-level `ErrorBoundary` plus a per-page error state, applied consistently. Fixing just 1-2 pages in isolation would leave the rest inconsistent and this exact gap would just resurface next time someone touches one of the other 13.

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

### Backfill backend test coverage onto the pre-vitest services and repositories

**What:** The *framework* half of this item is done — `backend/vitest.config.ts` exists (with the module-import-time env var stubs services need), `package.json` has `"test": "vitest run"` and `vitest ^4.1.10`, and 13 test files / 85 tests pass today. What's left is coverage: **8 of 29 services and 2 of 25 repositories have a `.test.ts`**. Everything tested so far was written alongside new work (journeys, scheduler, agents, MCP, Cal.com, webhooks); nothing older was ever retrofitted. Untested services include the ones carrying the most external-integration risk: `crm-service.ts`, `meta-lead-service.ts`, `chat-service.ts`, `rag-service.ts`, `form-lead-service.ts`, `billing-service.ts`, `openai-service.ts`, `crawler-service.ts`.

**Why:** The original reasoning still holds, just narrowed — this catches the class of bug with no visible symptom (the Lambda-freeze un-awaited CRM sync, a webhook signature check whose failure mode is invisible until exploited). Those live in exactly the untested files listed above. It also unblocks safe refactoring of the Meta/CRM paths, which currently have zero regression cover.

**Context:** No longer a standalone initiative needing its own planning pass — the setup decision is made and proven, so this is now incremental and parallelizable. The practical rule is to stop treating tests as something new work brings along and start requiring one for any older file a change touches. Highest-value first pass: `crm-service.ts` and `meta-lead-service.ts`, since three separate open TODOs in this file (webhook idempotency, cross-tenant PII race, empty `field_data`) all propose changes to that pipeline and none of it is currently covered.

**Effort:** M (was L — framework setup is done)
**Priority:** P2
**Depends on:** None

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

### [RESOLVED 2026-07-29] Gupshup WhatsApp webhook signature verification — done via URL token, not HMAC

**What it was:** `POST /webhooks/gupshup` accepted any request with no check at all. The original TODO assumed Gupshup would follow the same HMAC pattern as Razorpay (`X-Razorpay-Signature`) and Meta (`X-Hub-Signature-256`) — confirmed against Gupshup's own docs (docs.gupshup.io/docs/what-is-a-webhook) that this assumption was wrong: **Gupshup does not sign webhook payloads at all.** Their only documented security mechanism is IP whitelisting (external, requires contacting their support team), and their dashboard only lets you configure the callback URL itself, not custom headers.

**Fix shipped:** `webhook-service.ts`'s `verifyGupshupWebhookToken()` checks an unguessable `?token=` query param against `GUPSHUP_WEBHOOK_TOKEN`, `timingSafeEqual`-compared. `POST /webhooks/gupshup` rejects with 401 before the body is ever parsed if the token is missing or wrong.

**Operational step still needed (not code):** the callback URL registered in each client's Gupshup app dashboard must be updated to include `?token=<GUPSHUP_WEBHOOK_TOKEN value>` — existing connected clients' webhooks will silently start getting rejected (401, logged) until their dashboard config is updated. Since this is a single shared token across all clients (one central callback URL, per this codebase's existing "clients connect their own Gupshup app but we host one webhook endpoint" model), this is a one-time platform-level config change, not per-client work — but it must happen before/at deploy, not after.

**Follow-up (real network-level hardening, not blocking):** IP whitelisting was the option not taken here (needs Gupshup support to hand over their inbound IP ranges, plus extra work to reliably extract the true client IP behind a Lambda Function URL with no API Gateway in front). Worth revisiting once/if the URL-token approach proves insufficient (e.g., token leaks via logs/proxies) — track as its own item if it becomes a real priority, not scheduled now.

**Depends on:** None further — this was the prerequisite for the "Build real inbound WhatsApp message tracking" item below, which is now unblocked.

### WhatsApp Meta Direct — PR #2 (webhook routing, disconnect/migration UX, token lifecycle)

**What:** Follow-up to the Meta Direct WhatsApp integration (PR #1: provider, Embedded Signup, DB fields, dispatch wiring). Three pieces deferred out of PR #1: (1) webhook routing / phone-number lookup table for identifying which client an inbound WhatsApp message belongs to, (2) disconnect/migration UX for moving a client between Gupshup and Meta Direct (or back), (3) Meta access-token lifecycle handling — expiry, refresh, and what happens on client-initiated disconnect or Meta-initiated revocation.

**Why:** Currently these only exist as Open Questions in a design doc (`akvinayaktiwari-feature-whatsapp-meta-direct-design-20260727-173508.md`) that stops being anyone's active focus the moment PR #1 ships. Without a tracked item, this relies on someone remembering a design doc months later.

**Context:** The webhook routing table's exact payload shape is still unverified against real Meta Cloud API webhooks (should reuse the `meta_page_lookup` atomic-claim pattern from `meta-lead-repository.ts` as the model, per the design doc's Premise 6). Re-verify whether this is still needed before building — if the Agents/Journeys pilot (the intended consumer) hasn't started within a few months of PR #1 shipping, treat the routing-table shape as provisional and re-check it against whatever that work actually needs.

**Effort:** M
**Priority:** P2
**Depends on:** PR #1 (WhatsApp Meta Direct provider + Embedded Signup) shipped and proven first.

### Design the Journey step-list data model + Step Functions compiler

**What:** A dedicated design pass for how a client's step-list Journey (trigger → action → wait → condition → action, per the "no graph builder" UX decided in the Agent Scheduler & Journey Flow architecture session) gets stored in DynamoDB and compiled into a real AWS Step Functions Amazon States Language definition at runtime. Must include two guardrails surfaced during that session's outside-voice review: (1) the compiler must reject/forbid unbounded or tight-interval polling patterns (e.g. "check every 5 minutes for 90 days") in favor of a single long Wait state for "wait until X" semantics — realistic Journey shapes land around 200-500 Step Functions execution-history events, nowhere near the 25,000 ceiling, but a naive polling-loop compile pattern could approach it; (2) the Agent config schema must separate channel-specific fields (e.g. WhatsApp's pre-approved message-template requirement, which doesn't apply to the web widget) from channel-agnostic fields (tone, tool palette, qualification logic) from day one, so adding a channel later means adding a config block, not restructuring the fused Journey+Agent+toolbox bundle.

**Why:** Today's session decided the UX shape (step-list, not graph canvas) and the bundling model (fused Journey+Agent+toolbox, one editable unit) but not the data model underneath either. This is the actual translation layer between "client-friendly form" and "Step Functions JSON" — skip this and the builder UI has nothing real to save to, and skip the two guardrails above and they surface mid-implementation instead of at design time.

**Context:** Builds on the approved `agents-schedulers-journeys` design (2026-07-26) and the Agent Scheduler & Journey Flow session (2026-07-29, `plan-eng-review`) that resolved that doc's Open Question #7 (the visual Journey builder was never named as its own deliverable). Still-open from the original design and not resolved by this TODO: Journey-edit-while-in-flight semantics (what happens to a lead's in-progress execution when the client edits the Journey), and the translation from raw Step Functions execution state into the client-facing "where is my lead right now" timeline view.

**Effort:** L
**Priority:** P1
**Depends on:** None, but blocks any Journey builder UI work

### Design request-authenticity / abuse-prevention for /api/chat before agents get real-world-action tool-calling

**What:** `/api/chat` is public/unauthenticated by design (per CLAUDE.md's API routes spec). That's fine today because the endpoint only does RAG-retrieval + OpenAI chat. Once a bounded MCP-tool-calling agent sits behind it (per the Agents/Journeys architecture) with real-world side effects — booking appointments, sending confirmations — a spoofed or scripted request could trigger those actions without ever going through a real user conversation.

**Why:** Surfaced during the Agent Scheduler & Journey Flow architecture session (2026-07-29) via outside-voice review: the session's original reasoning for building the pilot on the web widget first framed it as "safer" than WhatsApp's known-unauthenticated Gupshup webhook — but `/api/chat` has the same no-auth shape, just without a named/tracked gap. Web-first is still the right sequencing call (existing MessageChannel implementation, no new inbound plumbing), but it doesn't close this gap on either channel.

**Context:** Needs a real design decision, not a blanket auth requirement (the endpoint must stay public for the widget to work for anonymous site visitors) — likely some combination of rate limiting, bot-session binding (e.g. a widget-issued session token bound to the botId + origin), and/or scoping which MCP tools are reachable from an unauthenticated session vs. a verified one. Should land before any agent gets real-world-action tool-calling wired to a public endpoint, on whichever channel ships first.

**Effort:** M
**Priority:** P1
**Depends on:** Should land before the Agents/Journeys pilot wires tool-calling into /api/chat or the WhatsApp webhook

### [RESOLVED 2026-07-29] Real inbound WhatsApp message tracking — send_message session guard now works for real

**What shipped:** `webhook-service.ts`'s Gupshup inbound-message handler now resolves a real `leadId` for every genuine inbound message (via `gupshup_app_lookup`'s `app` -> `clientId` mapping, then a phone match — see below — across that client's leads) and records the timestamp in the new `whatsapp_inbound_activity` table. `whatsapp-service.ts`'s `hasActiveWhatsAppSession()` reads it and checks Meta's real 24h window. `journey-executor-service.ts`'s `handleSendMessage()` now actually sends for a lead who's messaged within 24h, instead of always refusing.

**Multi-tenant routing:** confirmed via Gupshup's real webhook docs that every inbound event carries a top-level `app` field naming the Gupshup app (matches `client.whatsappConnection.appName` at connect time) — this is what makes routing the single shared `/webhooks/gupshup` endpoint to the right client possible at all. `gupshup-app-lookup-repository.ts` mirrors `meta-lead-repository.ts`'s proven `meta_page_lookup` pattern exactly (atomic claim, same reasoning). `connectGupshup`/`disconnectWhatsApp` write/remove the mapping.

**Known limitation, tracked separately below:** phone matching is a best-effort heuristic (last-10-digits comparison after stripping formatting), not exact — see the new TODO immediately below for what a more rigorous fix looks like.

**Also known:** `appName` uniqueness is only guaranteed within one Gupshup account, not globally across every client's own separate account — a genuine, if unlikely, collision risk flagged in `gupshup-app-lookup-repository.ts`'s own comment, not silently assumed away.

### Normalize phone numbers to E.164 at lead-capture time (replace the last-10-digits heuristic)

**What:** `lib/phone-match.ts`'s `phonesMatch()` compares the last 10 digits of two phone numbers after stripping non-digit characters, because `Lead.phone` has no canonical format — whatever a client's lead-capture form or agent recorded goes in as-is. This is what `webhook-service.ts` uses to match an inbound Gupshup message's phone number to a lead.

**Why:** The heuristic is honest about its own limitation (documented in the file itself): it can produce a false match if two different real phone numbers happen to share the same last 10 digits (rare but not impossible), and a false negative for numbers with fewer than 10 significant digits.

**Context:** A real fix means normalizing to E.164 (`+<countrycode><number>`) at every point a phone number enters the system — the chat lead-capture form, the CRM, wherever a client can edit a lead's phone number — not just in the matcher. That's a bigger, cross-cutting change touching every lead-intake path in the app, not a one-file fix. Worth doing once real inbound-message volume shows the heuristic actually causing mismatches, not preemptively.

**Effort:** M
**Priority:** P3
**Depends on:** None

### Support real AI-composed send_message text (replace literal messageHint)

**What:** `handleSendMessage()` sends `event.messageHint` as literal text (falling back to a generic default if absent) rather than composing a message through the bot's chat/RAG pipeline using the bundle's `AgentConfig.systemPrompt` and knowledge base context, as originally envisioned ("Agent composes the actual message... messageHint is an optional steer, not a hard template" — see `SendMessageStep`'s own type comment).

**Why:** A literal/templated message is a real, useful v1 (a client can write "Hi {name}, checking in about your visit" as the hint), but doesn't use the bounded agent's actual conversational ability — a real implementation would sound more natural and could reference specifics from the lead's earlier conversation.

**Context:** Needs its own design pass on how a Journey-initiated compose call reuses `chat-service.ts`/`rag-service.ts` without a live inbound user message to respond to (those were built around request-response, not a cold outbound send) — same class of gap flagged for the web widget's `MessageChannel`, but here it's about message *generation*, not *delivery* (delivery via WhatsApp is already real).

**Effort:** M
**Priority:** P3
**Depends on:** None

### Design the real MCP auth model (replace the interim shared-secret)

**What:** `mcp-routes.ts` guards all four `/mcp/*` capability servers with a single shared bearer secret (`MCP_INTERNAL_SHARED_SECRET`), checked on every request. That's explicitly interim, not a real per-client/per-agent auth model — anyone who has the one shared secret can call any capability for any `botId`/`clientId` they put in the tool arguments, since the routes trust whatever scoping the caller's arguments claim.

**Why:** This was flagged as an open question in the original approved design (Open Question #2: "MCP server auth/security model for the future 'clients bring their own external MCP server' roadmap item is entirely undesigned") and deliberately not resolved when the MCP protocol layer was built (2026-07-29 session) — the shared secret only proves "this caller is inside our own infra," not "this caller is entitled to act on this specific botId/clientId."

**Context:** Today `journey-executor-service.ts` never actually calls these routes over HTTP (it calls `bookAppointment()`/`scheduleReminder()`/etc. directly, in-process — see `booking-mcp-server.ts`'s own comment on why), so the real-world exposure is currently limited to whoever has network access to call the Lambda's Function URL directly with the right secret. Gets more urgent the moment either (a) a real external MCP client integration is built, or (b) the shared secret needs rotation/scoping per capability. Needs a real design decision: per-request signed tokens scoped to a specific botId? Full mTLS? Something else?

**Effort:** M
**Priority:** P2
**Depends on:** None technically, but low urgency until an external MCP client actually exists

### Build real quotation and brochure logic

**What:** `quotation-mcp-server.ts`'s `get_quotation` and `brochure-mcp-server.ts`'s `send_brochure` are deliberate stubs — both return a canned `{ stub: true, message: '...' }` regardless of input. Unlike booking (persists a real `AppointmentRequest`) and reminder (creates a real `ScheduledAction`), neither has any real data model to build against yet.

**Why:** Two of the four MCP capabilities named in the approved design remain non-functional — a client's prebuilt agent bundle can request a quote or a brochure, but nothing happens.

**Context:** Quotation needs a real pricing-rule data model (per-property? per-client-configurable rules? a flat rate card?) — undesigned. Brochure needs document/asset management (which brochure maps to which property, how does a client upload/manage them) — also undesigned, and the actual "send" side shares the same undesigned channel-send gap as `send_message` (see the TODO above). Both are smaller, more contained builds than the MCP protocol layer itself was — each is plausibly its own short design-and-build pass, not a joint `/office-hours`-sized effort like the original "build the MCP toolbox" TODO this replaces.

**Effort:** M (each)
**Priority:** P3
**Depends on:** Brochure's send side depends on the send_message channel-integration TODO above

### Implement a real wait_and_recheck satisfied-check

**What:** `journey-executor-service.ts`'s `handleWaitAndRecheckCheck()` hardcodes `satisfied: false` unconditionally — checking whether a lead has actually replied, or their real `lead_score` state, needs data that doesn't exist on any record yet (`Lead` has no `replied` or `lead_score` field). `appointment_booked` is now checkable for real: the Cal.com integration (2026-07-29) gives `AppointmentRequest.status` a genuine `'confirmed'`/`'failed'` transition instead of always `'requested'` — `handleWaitAndRecheckCheck()` still needs to actually query for a `'confirmed'` `AppointmentRequest` on the lead and hasn't been wired up to do so yet, but the blocking data-model gap is closed.

**Why:** Right now every `wait_and_recheck` step in a compiled Journey will always run to `maxIterations` and hit `onExhausted`, never `onSatisfied` — the primitive compiles and executes correctly, but can't reflect real lead state yet.

**Context:** Needs a real design decision on where `replied`/`lead_score` state lives (new fields on `Lead`? A separate `LeadJourneyState` record?) and who writes it (the chat pipeline marking `replied` when an inbound message arrives during a Journey execution? A human explicitly scoring a lead, per the original design's Premise on manual vs. AI scoring?). `appointment_booked` no longer needs a design decision — just wiring `handleWaitAndRecheckCheck()` to look up the lead's `AppointmentRequest`(s) and check for `status === 'confirmed'`.

**Effort:** S (appointment_booked wiring) / M (replied, lead_score — still need the design decision above)
**Priority:** P2
**Depends on:** send_message channel integration (above), for the `replied` check specifically. `appointment_booked` has no remaining dependency.

### Migrate the global weekly-report EventBridge rule to per-client ScheduledActions

**What:** `backend/index.ts`'s Lambda handler still has the original hardcoded `'whatsapp-weekly-report'` branch, backed by a single global EventBridge rule (created outside this repo) that fires `sendWeeklyReportsForAllClients()` for every connected WhatsApp client on the same fixed cadence. The new `scheduler-service.ts`/`'scheduled-action'` branch (added alongside it, not replacing it) lets each client get their own `ScheduledAction` with its own cadence via `POST /api/scheduler`. The old rule is left running untouched.

**Why:** Per the approved agents-schedulers-journeys design, the hardcoded weekly-report feature is meant to "fold into" the general Scheduler primitive as one instance, not remain a permanent special case. Right now both paths coexist, which works but means two different code paths accomplish the same thing.

**Context:** Needs: (1) provisioning `SCHEDULER_TARGET_LAMBDA_ARN` and `SCHEDULER_EXECUTION_ROLE_ARN` (the real IAM role EventBridge Scheduler assumes to invoke the Lambda — not created by any code in this repo, a deploy-time/infra decision), (2) a backfill that creates a `weekly_report` `ScheduledAction` (7-day `interval_days` cadence) for every client currently connected via `getConnectedWhatsAppClients()`, mirroring the pattern `backend/scripts/backfill-quick-signup-email-verified.ts` used for the `activeWhatsappProvider` backfill, (3) deleting the old global EventBridge rule once the backfill is verified working, (4) removing the now-dead `'whatsapp-weekly-report'` branch and `sendWeeklyReportsForAllClients()`.

**Effort:** M
**Priority:** P3
**Depends on:** SCHEDULER_TARGET_LAMBDA_ARN / SCHEDULER_EXECUTION_ROLE_ARN provisioned in AWS first

### Fully remove Gupshup once Meta Direct is proven

**What:** Sunset the Gupshup WhatsApp connector entirely once the Meta Direct integration has real production usage and the cost/dependency thesis is validated.

**Why:** Stated founder intent during the Meta Direct design session ("i will remove gupshup entirely in future") — removes a third-party BSP dependency and its markup on top of Meta's own conversation fees. No tracking existed for this beyond the conversation itself.

**Context:** No committed timeline. Blocked on: Meta Direct (PR #1 + PR #2) shipped, proven with real client volume, and the actual Gupshup-vs-Meta cost delta confirmed (never quantified — see the design doc's Open Question 1). Revisit this item once those conditions are met rather than acting on a vague "eventually."

**Effort:** L (migrating existing connected clients, removing Gupshup code paths, updating docs/env vars)
**Priority:** P3
**Depends on:** Meta Direct PR #1 + PR #2 shipped and proven in production.

### Cal.com OAuth client is registered but pending Cal.com's approval

**What:** The Cal.com integration (`lib/cal-com.ts`, `services/cal-com-service.ts`, `routes/integration-routes.ts`'s `/cal-com/*` routes, the Settings page's Cal.com card) is fully built and tested, but `CAL_COM_CLIENT_ID`/`CAL_COM_CLIENT_SECRET`/`CAL_COM_REDIRECT_URI` in `backend/.env` are still local-dev placeholders. The real OAuth client was registered at `app.cal.com/settings/developer/oauth` and starts in a "pending" state — Cal.com admin approval is required before real `/cal-com/connect` flows will work end-to-end, and that turnaround is outside this repo's control.

**Why:** Same shape as the Meta WhatsApp Business App Review and Razorpay Subscriptions approval gates already tracked in this codebase's history — code-complete, but blocked on a third party's manual review before it's usable in production.

**Context:** Built in parallel with registration per the user's explicit sequencing choice ("you register now, I build in parallel"). Once Cal.com approves the OAuth client, swap the three placeholder env vars for the real values (client secret via KMS-adjacent secret handling, not committed) and do one live end-to-end verification: connect → pick an event type → book via the `booking` MCP tool → confirm a real Cal.com booking lands.

**Effort:** S (once approved — swap env vars + one live verification pass)
**Priority:** P2
**Depends on:** Cal.com's OAuth client approval (external, no ETA)

### KB query-time namespace aggregation for cross-channel Agents

**What:** Once the unified Agent umbrella ships (new `agents` table + channel bindings, see the `plan-eng-review` on 2026-07-29), make RAG retrieval for an Agent query the *union* of its channel bindings' existing Pinecone namespaces at query time, so a client's web chatbot and voice agent can answer from the same "brain." Aggregate-at-query only — do NOT merge namespaces or re-embed. Preserves the immutable botId-scoping (rule #5); generalizes the existing one-directional `VoiceAgent.botId` link into a first-class Agent property.

**Why:** This is the "one agent, one shared knowledge base across channels" half of the cross-channel vision. It was deliberately pulled out of the Agent-identity build batch (Step 0 scope reduction) because it rests on an unverified product premise: whether the client actually wants web chat and voice calls to answer *identically*, or intentionally differently (e.g. shorter voice answers). Building the retrieval change before that answer risks committing to the wrong aggregation model.

**Context:** Blocked on the design doc's Assignment — confirm with the one real client whether their web chatbot and voice agent should share knowledge or diverge. If "diverge," the shared-brain premise softens and this may not be needed at all; if "identical," build the aggregate-at-query union. The Agent identity, channel bindings, and journey/scheduler `agentId` targeting all ship first (this batch) and do not depend on this item. Approach detail: at retrieval time, resolve the Agent's bindings, collect each binding's namespace, and query across them, then MMR-merge — the retrieval settings (topK 5, candidate pool 10, MMR lambda 0.7, threshold 0.7) stay as specified in CLAUDE.md's RAG standards.

**Effort:** M (retrieval-layer change in rag-service + vector-repository; gated on the product answer, not the code)
**Priority:** P2
**Depends on:** Agent umbrella identity (this branch's build) shipped; client answer on shared-vs-divergent knowledge

### Provision the agent/journey infra — run scripts/provision-agent-journey.sh

**What:** `scripts/provision-agent-journey.sh` does the whole thing in one run: creates all 8 DynamoDB tables, creates the EventBridge Scheduler execution role, grants the Lambda roles scheduler access, and sets all 11 env vars on all three Lambdas. It is idempotent (skips anything that already exists). Verified against account 291685935704 / ap-south-1 on 2026-08-06 — at that point **none** of it existed.

Run it, then `backend/scripts/backfill-agents.ts` (see the old note below).

**The scope is bigger than the tables**, which is easy to miss: `lib/eventbridge-scheduler.ts` and `services/journey-compiler-service.ts` both **throw at import time** when their ARNs are unset, exactly like a missing table env var. So three ARNs matter as much as the 8 tables:
- `SCHEDULER_TARGET_LAMBDA_ARN` and `JOURNEY_EXECUTOR_LAMBDA_ARN` — both are `rigachat-api`'s own ARN; one bundle serves HTTP, scheduled jobs, and the journey executor (see `backend/index.ts`'s event branching).
- `SCHEDULER_EXECUTION_ROLE_ARN` — **had to be created.** No role in the account was trusted by `scheduler.amazonaws.com`, and there were zero schedules. The app also needs `scheduler:Create/Update/DeleteSchedule` plus a scoped `iam:PassRole` for it.

Key schemas were read out of each repository's `Key:{}` / `KeyConditionExpression`, not from docs. **None of the 8 tables uses a GSI** — all primary-key access.

Do NOT add these as GitHub secrets: `ci.yml`'s env-var step merges a hardcoded allowlist and would silently ignore them (same trap documented in the contact-form entry).

---

Original note, still accurate for the backfill half:

**What:** The additive Agent umbrella (branch `feature/agent-journey-scheduler`) is code-complete and tested, but two things must happen at deploy before it works in production: (1) create the two new DynamoDB tables in AWS — `agents` (partition key `clientId`, sort key `agentId`) and `agent_binding_lookup` (partition key `resourceId`) — and add `DYNAMODB_TABLE_AGENTS` and `DYNAMODB_TABLE_AGENT_BINDING_LOOKUP` to every deployed Lambda's environment via the same CI/CD env-var-sync path the other tables use; (2) run `backend/scripts/backfill-agents.ts` once the tables exist, to wrap the existing client's chatbot + voice agent into one Agent.

**Why:** The repositories call `getTableName('agents')` / `getTableName('agent_binding_lookup')` at module load, so once anything imports agent-repository in production (the `/api/agents` routes do), a missing table env var throws on cold start. Nothing imports them yet in a hot path, but the Agent routes are live in the bundle. The backfill is what makes the existing client's bot + voice agent actually resolve to one Agent (so journeys/scheduler start stamping `agentId`); without it, the identity layer exists but no real data is wrapped in it yet.

**Context:** Same class of deploy-time infra step as the scheduler ARNs (`SCHEDULER_TARGET_LAMBDA_ARN` / `SCHEDULER_EXECUTION_ROLE_ARN`) already tracked in this file — table creation and env-var sync are not done by any code in this repo. The backfill is idempotent (skips already-bound resources) and conservative (skips any client with >1 bot or >1 voice agent rather than guessing a pairing), so it is safe to run and re-run. Run it manually from `backend/`: `TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm scripts/backfill-agents.ts`.

**Effort:** S (table creation + env-var sync + one backfill run)
**Priority:** P1
**Depends on:** the `feature/agent-journey-scheduler` branch merged/deployed

### When merging feature/agent-journey-scheduler, the blog commit is already on main

**What:** The blog section (`ee2c2ce` on this branch — `/blog`, `/blog/:slug`, the prerender step, the pilgrimage-towns post) was cherry-picked onto `main` ahead of the rest of this branch, on 2026-08-02, as `ee0e77f` + a follow-up fix `808668a`. Both are pushed to `origin/main`. So when this branch is eventually merged, its blog commit is a duplicate of work main already has — do not treat the blog as new, unmerged work, and do not re-apply it.

**Why:** Most of the blog's files are byte-identical on both sides and will merge silently, but **one file will conflict and the resolution is not the obvious one**: `frontend/src/content/blog/posts/branded-budget-residences-pilgrimage-towns/meta.ts` was *added* by both sides with different content, so git sees an add/add conflict with no common base. Main's version has `{ value: '7', label: 'Towns screened' }`; this branch still has the original `'9'`. **Take main's `7`.** Resolving it the other way — or blindly accepting "ours" — silently reintroduces a wrong public-facing stat: the post's screening table only carries data for 7 towns (Ayodhya, Varanasi, Tirupati/Tirumala, Shirdi, Puri, Madurai, Ujjain), and `9` came from the source PDF's cover, which overcounts what its own table renders.

**Context:** The blog was split out early because this branch is ~20 commits of unrelated Agent/Journey/Scheduler/MCP work, and the blog only touched `App.tsx`, `Footer.tsx`, `package.json`, and `.gitignore` outside its own new files — cheap to lift out, and no reason to hold marketing content behind an infra branch. Verified on a main base at the time: `tsc --noEmit` clean and `npm run build` prerenders both blog routes. Note `npm run build` now runs `scripts/prerender.mjs` after `vite build` (client-only build is `npm run build:client`) — that change is already on main, so it is not new at merge time. The cleanest merge is to rebase this branch onto the updated `main` first, which drops the duplicated blog commit and leaves only the single `meta.ts` conflict to resolve.

Verified 2026-08-02 via `git merge-tree --write-tree main feature/agent-journey-scheduler`: the add/add on `meta.ts` is the only blog-related conflict. That same dry run also reported conflicts in `CLAUDE.md`, `TODOS.md`, `backend/index.ts`, and `backend/vitest.config.ts` — those are ordinary divergence between this branch and main, nothing to do with the blog, and are resolved normally. Re-run that command before merging for the current picture.

**Effort:** S for the blog conflict specifically (one file, known resolution); the branch merge overall is larger
**Priority:** P1
**Depends on:** nothing — read this before merging `feature/agent-journey-scheduler`
### [RESOLVED 2026-08-05] contact_messages table + SES sender provisioned

**What:** All three manual AWS steps for the contact form are done and verified live against account `291685935704` / `ap-south-1`:

1. **`contact_messages` table** — created, `ACTIVE`, partition key `messageId`, GSI `recordType-createdAt-index` (`recordType` HASH, `createdAt` RANGE) also `ACTIVE`. `DYNAMODB_TABLE_CONTACT_MESSAGES=contact_messages` set on all three Lambdas (`rigachat-api`, `rigachat-api-streaming`, `rigachat-crawler`).
2. **`SES_FROM_EMAIL=noreply@vyostra.com` + `CONTACT_NOTIFICATION_EMAIL=support@vyostra.com`** set on the same three Lambdas.
3. **`ContactFormSesSendPolicy`** (inline, `ses:SendEmail` scoped to `identity/vyostra.com` — not `*`) attached to `rigachat-api-role-4c9qsico` and `rigachat-api-streaming-role-625vca9z`. DynamoDB needed nothing: both roles already carry `AmazonDynamoDBFullAccess`.

End-to-end verified the same day against real infra: a submission wrote a real row and SES reported `Send: 1, Delivery: 1, Bounce: 0, Reject: 0` — the first email this account has ever sent. Test rows were deleted afterward (table back to 0).

**Two findings worth keeping, since both are easy to get wrong again:**

- **Do not add these as GitHub secrets.** `ci.yml`'s "Update Lambda environment variables" step merges a *hardcoded allowlist* (`WHATSAPP_*`, `REDIS_PROVIDER`, `UPSTASH_*`, `SQS_CRAWLER_QUEUE_URL`) onto whatever the function already has. No DynamoDB table name is in that list — every existing one lives directly on the Lambda and survives deploys only because of that `jq '. + {...}'` merge. A new GH secret would be silently ignored unless `ci.yml` is edited too. This applies to the pending Agent tables as well.
- **The SES sandbox (`ProductionAccessEnabled: false`) is not a blocker.** Sandbox restricts *destinations* to verified identities, and `vyostra.com` is verified with DKIM `SUCCESS` — so a `support@vyostra.com` destination works today. Production access is only needed if the notification address ever moves off a verified domain.

**Still open:** the branch itself. `/api/contact` stays 404 in production until `feature/contact-form` merges to `main` — infra is ready, code is not deployed.

**Effort:** S (done)
**Priority:** P1
**Depends on:** nothing further

## Completed

### Fix un-awaited CRM sync in form-lead-service.ts (Lambda-freeze risk)

`captureFormLead` now awaits `syncFormLeadToCRM(...)` (still error-swallowed, never fails lead capture), closing the Lambda-freeze window that could drop form-lead CRM syncs mid-flight. P1/S. Verified: build + 21 backend tests pass.

### Add aria-live region to Toast component

`Toast.tsx` container now has `aria-live="polite"`; error toasts escalate to `role="alert"` (assertive), success/warning use `role="status"`. Toasts are now announced to screen readers app-wide. P2/S. Verified: frontend typecheck passes.

### Point the remaining formatRelativeDate copies at the shared lib

Deleted the local `formatRelativeDate` copies in `FormLeadsPage.tsx`, `KnowledgeBasePage.tsx`, and `VoiceKnowledgeBasePage.tsx`; all three now import the shared `frontend/src/lib/date.ts`, which clamps future-drifted dates to "0 minutes ago". P3/S. Verified: frontend typecheck passes.

### Deleting a published journey can kill leads mid-flight

**What:** `deleteJourneyBundle` tears down the Step Functions state machine. Observed live on 2026-08-06: deleting a machine with a running execution FAILED that execution outright (`States.Runtime: State machine ... has been deleted`), while a second execution on the same machine kept running and held the machine in `DELETING` until it was stopped explicitly. The code previously carried a comment claiming the opposite — that in-flight executions are allowed to finish — which the evidence contradicts. Comments corrected; behaviour unchanged.

**Why:** A client deleting a journey they think is idle can silently drop every lead currently being nurtured by it, with no warning and no record of who was dropped. For a 60-90 day real-estate nurture that could be a large number of live prospects.

**Context:** Needs a product decision, not a quick patch. Options: (a) count running executions before delete and make the client confirm ("12 leads are mid-journey, delete anyway?"), (b) refuse to delete while executions are running and offer archive-instead, (c) stop executions explicitly and record the drop on each lead so it is at least visible. (c) pairs naturally with the ignition-outcome field, since "dropped because the journey was deleted" is the same kind of fact as "no journey matched".

**Effort:** M
**Priority:** P2
**Depends on:** ignition-outcome-on-lead landing first, if option (c) is chosen

### Ignition retry reporting is best-effort within ~10s

**What:** `startExecution` classifies a repeat ignition as `already_started` by comparing the returned execution's `startDate` against the call time, with a 10s skew tolerance. Two ignitions closer together than that both report `started`. Verified live on 2026-08-06 with back-to-back calls ~1s apart.

**Why:** Purely a reporting inaccuracy — the no-duplicate-journey guarantee is unaffected, because AWS returned the SAME `executionArn` both times and no second journey ran. But once ignition outcomes are stamped on the lead record, a fast retry would look like a fresh start.

**Context:** Real retries (Lambda async retry, Meta webhook redelivery) are minutes apart and classify correctly, so this only bites under artificial or pathological conditions. Making it exact needs a dedupe row keyed by execution name — real infrastructure bought to fix a log line rather than a behaviour, which is why it was not done. Revisit only if lead records start showing implausible duplicate starts.

**Effort:** S
**Priority:** P3
**Depends on:** None

### Third-party clients still throw at module load (Pinecone, OpenAI, Razorpay, Zoho)

**What:** `lib/pinecone.ts`, `lib/openai.ts`, `lib/razorpay.ts` and `providers/zoho-provider.ts` still read their credentials at module scope and throw on import if unset. The table-name/ARN class was converted to call-time resolution on 2026-08-06; these four were not.

**Why:** Same blast radius as the bug that nearly took production down during the 2026-08-06 deploy: `backend/index.ts` imports the whole route tree into one Lambda that also serves `/api/chat` on every client's live site, so one missing credential 500s every route on cold start rather than disabling one feature. These four are only safe today because all four are currently set in production — the protection is luck, not design.

**Context:** Deliberately excluded from the pre-deploy fix, which was scoped to what actually blocked the deploy (`CAL_COM_*` and `MCP_INTERNAL_SHARED_SECRET`, both unset in prod). Unlike those, these three export module-level *client instances* (`pineconeClient`, `openaiClient`, `razorpayClient`) consumed across many services, so converting them means touching every call site — a refactor of the RAG/chat/billing paths, which is not something to do minutes before a deploy with no coverage on those paths.

Approach when picked up: memoize a lazy accessor (`getOpenAiClient()`) and migrate call sites, or keep the export and construct on first property access. Verify with the same harness that caught the original: compile the route tree and import it with the credential deleted from the environment.

**Effort:** M
**Priority:** P2
**Depends on:** None

### scripts/deploy.sh has drifted and would break login if used

**What:** `docs/DEPLOYMENT.md` calls `scripts/deploy.sh` "the manual equivalent" of the CI deploy. It is not. Two concrete divergences from the values CI actually uses (GitHub repo variables, read 2026-08-06):

1. `VITE_COGNITO_REDIRECT_URI` defaults to `https://beepboop.drsyeta.in/auth/callback`; the real value is `https://vyostra.com/auth/callback`. A frontend built by this script sends users to the old domain after login.
2. It never emits `VITE_STAFF_COGNITO_CLIENT_ID` or `VITE_STAFF_COGNITO_REGION` at all, and `frontend/src/hooks/useStaffAuth.ts:30` reads the former. The staff console loses its Cognito config entirely.

**Why:** This is the documented fallback for exactly the situation it was reached for — GitHub Actions was in a major outage on 2026-08-06 and this was the obvious escape hatch. Using it would have shipped a broken dashboard to production in order to work around an outage. The next person under deploy pressure will reach for it too.

**Context:** Backend-only manual deploy is safe and was used instead: the script's Lambda half uses only `update-function-code` and never `update-function-configuration`, so it cannot disturb env vars. It is specifically the frontend half that is stale. Fix by sourcing the same values CI does rather than hardcoding fallbacks, or by deleting the frontend half and documenting the script as backend-only. Also worth re-checking the remaining defaults (`BACKEND_URL`, `VITE_CDN_URL`, CloudFront ids) against reality at the same time — only the two above were verified.

Related: CI's health check hits `/api/bots/health-check/config`, which matches no route (bot-routes exposes `/public/:botId`, not `/:id/config`). It 404s, and since the check only fails on >= 500 it passes anyway. It is a valid cold-start smoke test but proves less than its name suggests.

**Effort:** S
**Priority:** P2
**Depends on:** None
