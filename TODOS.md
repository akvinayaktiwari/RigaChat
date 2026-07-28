# TODOS

## Frontend

### Add aria-live region to Toast component

**What:** `frontend/src/components/Toast/Toast.tsx` has no `aria-live` region — confirmed via grep, zero matches for `aria-live` or `role=` in the file. Every toast notification in the app (success, error, info) is silent to screen-reader users.

**Why:** Surfaced during `/plan-design-review` of the WhatsApp Meta Direct card, where the Embedded Signup connect/error flow depends on toast feedback being announced (same pattern the existing Gupshup connect flow already uses) — but this is app-wide, not specific to that feature. Every existing toast call site is affected today.

**Context:** Small fix — add `aria-live="polite"` (or `"assertive"` for errors) to the toast container. Should land as its own change, not bundled silently into an unrelated feature PR.

**Effort:** S
**Priority:** P2
**Depends on:** None

### Add error handling to data-load effects app-wide

**What:** 13 pages (including `DashboardHome.tsx`, `LeadsPage.tsx`, `BotsPage.tsx`, `BotDetailPage.tsx`, `FormDetailPage.tsx`, `FormsPage.tsx`, `KnowledgeBasePage.tsx`, `LeadDetailPage.tsx`, `FormLeadsPage.tsx`, `NewBotPage.tsx`, `VoiceKnowledgeBasePage.tsx`, `VoiceAgentDetailPage.tsx`, `AuthCallbackPage.tsx`) load data via `Promise.all([...]).then(...)` with no `.catch()`. A rejected fetch leaves `loading` stuck `true` forever — the user sees an infinite skeleton with no error message and no way to retry.

**Why:** Any transient API failure (network blip, 500, expired session) currently fails silently and permanently on these pages. Discovered via a test-coverage audit while shipping the dashboard redesign — verified it's the same pattern on all 13 pages, not something that branch introduced.

**Context:** Needs a shared pattern, not a one-off fix per page — e.g. a small `useAsyncData` hook or a top-level `ErrorBoundary` plus a per-page error state, applied consistently. Fixing just 1-2 pages in isolation would leave the rest inconsistent and this exact gap would just resurface next time someone touches one of the other 11.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Point the remaining formatRelativeDate copies at the shared lib

**What:** `FormLeadsPage.tsx`, `KnowledgeBasePage.tsx`, and `VoiceKnowledgeBasePage.tsx` each still define their own local `formatRelativeDate`, identical to the one that used to live in `DashboardHome.tsx`/`LeadsPage.tsx` before the dashboard redesign branch extracted it to `frontend/src/lib/date.ts`. These 3 copies still have the original bug: a future-dated record (client/server clock drift) renders as `"-5 minutes ago"` instead of clamping to `"0 minutes ago"`.

**Why:** The fix already exists and is already in the codebase (`frontend/src/lib/date.ts`) — this is a pure find-and-replace (delete the local copy, import the shared one) plus getting the same bug fix for free in 3 more places.

**Context:** Low risk, mechanical. Deferred out of the dashboard-redesign PR because those 3 files were otherwise untouched by that branch and pulling them in would have been unrelated scope creep.

**Effort:** S
**Priority:** P3
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

### Fix un-awaited CRM sync in form-lead-service.ts (Lambda-freeze risk)

**What:** `captureFormLead` in `form-lead-service.ts` calls `syncFormLeadToCRM(...).catch(...)` without `await`, directly above a comment explaining that the next line's WhatsApp notification *must* be awaited because "AWS Lambda freezes the execution environment as soon as the handler's response promise resolves" — an un-awaited call gets aborted mid-flight. That reasoning applies equally to the un-awaited CRM sync call, meaning form-lead CRM syncs may be silently dropped on Lambda today.

**Why:** This is a real production risk affecting the CRM sync of every existing form lead for every live paying client, not a hypothetical — found while reviewing the Meta Lead Ads integration plan, not caused by it.

**Context:** One-line fix (add `await`). Deferred to its own follow-up PR rather than bundled into the Meta branch, since it's unrelated to Meta specifically and there's no test coverage to verify the fix doesn't change timing-sensitive behavior elsewhere.

**Effort:** S
**Priority:** P1
**Depends on:** None

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

### Gupshup WhatsApp webhook has no signature/authenticity verification

**What:** `POST /webhooks/gupshup` (`webhooks.ts`) accepts any request with no HMAC or signature check at all, unlike the Razorpay and Meta webhooks defined in the same file, which both verify a signature before trusting the payload.

**Why:** Today the impact is small — the handler only logs incoming events. Once the Agents/Schedulers/Journeys pilot wires this endpoint to a real conversational agent that can book site visits and send WhatsApp messages, an unverified request means anyone who discovers the URL can inject fake messages that trigger real agent actions.

**Context:** Found during `/plan-eng-review` of the Agents/Schedulers/Journeys pilot design (`akvinayaktiwari-agents-schedulers-journeys-design-20260726-033818.md`). Gupshup's specific verification mechanism (shared secret, HMAC scheme, etc.) wasn't confirmed from public docs during that review — needs a look at Gupshup's own dashboard/developer docs to find the actual mechanism before implementing, following the same pattern already used for Razorpay (`X-Razorpay-Signature`) and Meta (`X-Hub-Signature-256`).

**Effort:** S (once the mechanism is confirmed)
**Priority:** P1
**Depends on:** Should land before the WhatsApp conversational agent pilot handles meaningful volume.

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

### Implement the real journey-executor send_message channel integration

**What:** `journey-executor-service.ts`'s `handleSendMessage()` is a deliberate stub — it logs the intent (bot/bundle/lead/channel/step/messageHint) and returns `{ sent: false, stub: true }` without ever sending anything. The real implementation needs to route through the bot's existing chat/RAG pipeline (`chat-service.ts`/`rag-service.ts`) and dispatch via the right `MessageChannel` implementation for whatever `channel` the Journey execution carries.

**Why:** This is what makes a Journey's `send_message` step actually do something instead of a no-op. Scoped out of the executor pass deliberately (per the Agent Scheduler & Journey Flow session's explicit agreement: prove the Journey/Step-Functions loop end-to-end with stubs before building the real send integration).

**Context:** The existing `MessageChannel` interface (`receiveMessage`/`sendResponse`) was designed around a user-initiated message triggering a response, not a Journey-initiated send with no prior inbound message — needs its own design pass to confirm the interface still fits a Journey-initiated send, or whether it needs a new method/variant. Also depends on the channel actually being safe to send on: WhatsApp send needs the Gupshup webhook signature fix (P1, tracked separately) and the request-authenticity TODO above if going through `/api/chat`-adjacent infra.

**Effort:** M
**Priority:** P2
**Depends on:** Gupshup webhook signature verification (if targeting WhatsApp); /api/chat request-authenticity TODO above (if targeting the web widget with real-world-action tool-calling)

### Build the real MCP toolbox (booking, quotation, brochure, reminder)

**What:** `journey-executor-service.ts`'s `handleToolCall()` is a deliberate stub — logs the tool name/input and returns `{ stub: true }` without calling anything real. Per the approved agents-schedulers-journeys design, these should be Vyostra-owned MCP capability route groups (`/mcp/booking`, `/mcp/quotation`, etc.) on the existing single Lambda, using MCP's Streamable HTTP transport (stateless mode), each capability scoped per-request by client the same way Pinecone queries are scoped by `botId` today.

**Why:** `tool_call` steps and bounded agent toolboxes (`AgentConfig.mcpToolbox`) are core to the approved architecture's "agent can take a real action" requirement — without real tools, every prebuilt agent bundle can only send messages and wait, not actually book anything.

**Context:** This is real, net-new protocol work (MCP session handshake, capability discovery, JSON-RPC framing), not just routing — flagged as such in the original design ("not new infrastructure" undersold implementing MCP itself). The design doc's own recommendation to use the real MCP protocol rather than a lighter internal tool-calling registry was never validated against this codebase with a technical spike; treat as provisional until one is done. Needs its own scoping pass — likely its own `/office-hours` given the size.

**Effort:** L
**Priority:** P2
**Depends on:** None technically, but low value until send_message (above) is real too — a Journey that can book but can't message a lead about it is incomplete

### Implement a real wait_and_recheck satisfied-check

**What:** `journey-executor-service.ts`'s `handleWaitAndRecheckCheck()` hardcodes `satisfied: false` unconditionally — checking whether a lead has actually replied, or their real `lead_score`/`appointment_booked` state, needs data that doesn't exist on any record yet (`Lead` has no `replied` or `lead_score` field; there's no booking record since `tool_call` is stubbed above).

**Why:** Right now every `wait_and_recheck` step in a compiled Journey will always run to `maxIterations` and hit `onExhausted`, never `onSatisfied` — the primitive compiles and executes correctly, but can't reflect real lead state yet.

**Context:** Needs a real design decision on where `replied`/`lead_score`/`appointment_booked` state lives (new fields on `Lead`? A separate `LeadJourneyState` record?) and who writes it (the chat pipeline marking `replied` when an inbound message arrives during a Journey execution? A human explicitly scoring a lead, per the original design's Premise on manual vs. AI scoring?). Blocked on send_message being real first, in most cases — "has the lead replied" needs a real send to have gone out.

**Effort:** M
**Priority:** P2
**Depends on:** send_message channel integration (above), for the `replied` check specifically; the MCP toolbox (above), for the `appointment_booked` check specifically

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

## Completed
