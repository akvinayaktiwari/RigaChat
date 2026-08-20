# TODOS

## Frontend

### The frontend talks to two different API hosts, and OAuth state cookies fall through the gap

**What:** `VITE_API_URL` is the raw Lambda Function URL, but `vyostra.com/api/*` also
routes to the same Lambda through CloudFront. So the app has two working API origins and
uses both. That is harmless for `fetch`, and fatal for OAuth: an integration's connect
route sets a **host-only** CSRF state cookie (`setCookie` in `integration-routes.ts`
passes no `domain`), and the provider's redirect URI decides which host the callback
lands on. If those two differ, the cookie is never sent and the callback fails
`invalid_state`.

Meta hit exactly this — connect on the Lambda host, `META_REDIRECT_URI` on
`vyostra.com`, two different registrable domains. Every connect attempt failed with
"That connection link expired", invisible for days because Facebook Login was blocked
upstream and nothing reached the callback. Patched 2026-08-15 by sending only the Meta
connect navigation to `VITE_OAUTH_BASE_URL` (`https://vyostra.com`). Zoho was left on
`BASE_URL` because `ZOHO_REDIRECT_URI` already points at the Lambda host — the rule is
that connect and callback must match, not that either must be a particular domain.

**Why:** the current state is correct but load-bearing on a comment. Any new OAuth
integration picks a host by accident and gets a failure whose message ("that link
expired") points at session length rather than at cookie scope. Cal.com is next in line
and `CAL_COM_REDIRECT_URI` is currently unset.

**Context:** the real fix is one origin for everything — point `VITE_API_URL` at
`https://vyostra.com` and delete `VITE_OAUTH_BASE_URL`. Blocked on CloudFront: the
distribution-wide `CustomErrorResponses` map 403 and 404 onto `/index.html` with HTTP
200, and CloudFront applies them to **every** behaviour including `/api/*`, so every API
error would arrive as an HTML success and `apiClient` would parse it as one. Fixing that
means replacing the blanket error responses with a CloudFront Function doing SPA
rewrites on the default behaviour only, then flipping `VITE_API_URL` and re-testing every
integration.

**Effort:** M
**Priority:** P2
**Depends on:** None

### An expired session renders a dashboard that looks signed in and fails at everything

**What:** Cognito ID tokens last one hour. Nothing refreshes them and nothing reacts to a
401. `apiClient` (`frontend/src/services/api.ts`) parses the 401 body and returns it as an
ordinary `ApiResponse` — no redirect, no session clear, no retry. `useAuth` never
re-authenticates: Cognito hands back a `RefreshToken` and it is **thrown away**. Grep the
whole repo for `RefreshToken` and you get exactly one hit, the type annotation at
`hooks/useAuth.ts:250` that names it in the response shape it discards.

So an hour after signing in, the header still shows the user's name and avatar, the sidebar
still renders, and every single call underneath returns 401. Pages that guard on `data`
render empty; pages that guard on `error` show a generic failure. Nothing anywhere says
"you are signed out".

**Why:** Hit for real on 2026-08-15 while preparing the Meta App Review screencast — the
Leads page "wouldn't open", and twenty minutes went into checking the API, entitlements and
the page component before the actual cause (a six-hour-old token) surfaced. A customer who
leaves the tab open over lunch gets the same experience with no way to interpret it, and
the natural read is "your product is broken", not "sign in again".

**Context:** Two layers, and the cheap one is worth doing alone. **Minimum:** have
`apiClient` detect 401, clear the session and redirect to `/login` — turns a silent
failure into an obvious one, and is maybe an hour. **Proper:** keep the refresh token and
exchange it on 401, retrying the original request once, so an open tab simply keeps
working. Note the refresh token is a longer-lived credential than the ID token, so decide
deliberately where it lives — `useAuth.ts:58` documents why the session is in
sessionStorage rather than localStorage, and that reasoning applies more strongly here.

**Effort:** S (redirect on 401) / M (real refresh flow)
**Priority:** P2
**Depends on:** None

### A lead can never be deleted, by anyone

**What:** There is no delete path for a lead anywhere. No route in `lead-routes.ts`, no
service function, no repository function — `grep -rn "deleteLead"` across `backend/src`
returns nothing. Once a lead row is written it is permanent, for the client and for us.

**Why:** Every capture surface is public and unauthenticated by design — `POST /api/leads`
takes a `botId` and a body, and the Meta webhook writes whatever Meta delivers. So spam,
test submissions and mistakes all land in the same CRM the client works out of, and the
only available response is to ignore them forever. It also blocks honouring a deletion
request properly: `handleMetaDataDeletionRequest` records and acknowledges the request,
but nothing can actually remove the rows, which is why the submission doc carries a
"known weakness" paragraph admitting the purge is manual.

**Context:** Concrete today — the App Review reviewer account permanently holds six
`<test lead: dummy data...>` rows from screencast takes, and there is no way to tidy them. Design decisions needed before building: soft delete versus hard
delete (soft keeps the lead-cap accounting honest and is reversible); whether deletion is
per-lead, bulk, or filtered; and whether it needs a staff/admin path as well as a client
one, since the Meta deletion callback is answered by us, not by the client. Soft delete
plus a `deleted` filter on the unified inbox is probably the smallest honest version.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Add error handling to data-load effects app-wide

**What:** 15 pages (including `DashboardHome.tsx`, `LeadsPage.tsx`, `BotsPage.tsx`, `BotDetailPage.tsx`, `FormDetailPage.tsx`, `FormsPage.tsx`, `KnowledgeBasePage.tsx`, `LeadDetailPage.tsx`, `FormLeadsPage.tsx`, `NewBotPage.tsx`, `VoiceKnowledgeBasePage.tsx`, `VoiceAgentDetailPage.tsx`, `AuthCallbackPage.tsx`, `SchedulerPage.tsx`, `AppointmentsPage.tsx`) load data via a `.then((res) => setX(res.data ?? []))`-shaped effect with no check on `res.success` and no `.catch()`. Two distinct failure symptoms, same root cause: a genuinely rejected promise (network error) leaves `loading` stuck `true` forever (infinite skeleton); an HTTP error response that still resolves normally (e.g. a 500 with a well-formed `{success:false, error:...}` body) has its failure silently swallowed by `res.data ?? []`, showing a *misleading empty state* ("No schedules yet") instead of either an error or the truth.

**Why:** Any transient API failure (network blip, 500, expired session) currently fails silently on these pages, either hanging or lying about the actual state. Originally discovered via a test-coverage audit (13 pages); the empty-state variant was confirmed live on 2026-07-29 while browser-verifying `SchedulerPage.tsx` against a real (missing) DynamoDB table — the create-form path on that same page handles the identical error correctly (shows `res.error` inline), while its list-load path does not, on the very same page. Not a hypothetical.

**Context:** Needs a shared pattern, not a one-off fix per page — e.g. a small `useAsyncData` hook or a top-level `ErrorBoundary` plus a per-page error state, applied consistently. Fixing just 1-2 pages in isolation would leave the rest inconsistent and this exact gap would just resurface next time someone touches one of the other 13.

**Progress (2026-08-08, feat/lead-state-and-unified-inbox):** 3 of 15 done — `LeadsPage.tsx`, `LeadDetailPage.tsx`, `DashboardHome.tsx`. Each now distinguishes a failed load from an empty one, and `lib/api-error.ts`'s `describeApiError` is the beginning of the shared pattern this item asks for (logs the raw server string, renders a safe message). The remaining 12 pages are untouched, so this stays OPEN — and the fix landed exactly the way this item warns against, one page at a time.

**Effort:** M
**Priority:** P2
**Depends on:** None

### "Agents" now collides with the Agent identity model

**What:** The chatbot -> Agent rename put "Agents" directly above "Voice Agents" in the dashboard nav, while `CLAUDE.md:126` defines the `agents` table as the top-level cross-channel Agent identity whose bindings resolve to a botId AND a voice agentId. So an Agent is the PARENT of both nav items, and three distinct things now share the name (web bot, voice agent, and the identity that owns them). The Journeys page also offers a "prebuilt agent library", which is a fourth sense.

**Why:** The rename itself is right — "chatbot" undersells the product and "Agent" is the category customers now shop for. But a user reading the nav cannot tell what an Agent is, and the architecture already had a precise answer.

**Context:** Two ways out: give the web channel a channel-specific label ("Chat Agents" / "Voice Agents", parallel and unambiguous), or collapse the model so there is ONE Agents page listing Agents with channel badges, which is what the `agents` table was designed for and would make the nav match the data model. The second is more work and more correct.

**Effort:** M
**Priority:** P2
**Depends on:** None

### The journey layer is four nav items for one idea, and the Journeys page is scoped by the wrong unit

**What:** Three separate problems that all come from the same place — the dashboard nav
presents the post-lead-capture machinery at four top-level entries (Agents, Journeys,
Appointments, Scheduler) when it is one mental model.

1. **Wrong altitude.** `Appointments` and `Scheduler` are *outputs* of a Journey, shown at
   the same level as the thing that produces them. `AppointmentsPage.tsx` is read-only.
   `SchedulerPage.tsx` has exactly one self-serve action (the weekly report) and everything
   else on it is a read-only row a Journey created. Neither is a place a user goes to do
   work, and nothing in the UI draws the line from Journey -> reminder -> appointment
   except one sentence of body copy on the Scheduler banner.
2. **Wrong unit of organization, and this one produces a real error.** `JourneysPage.tsx`
   is scoped by **bot** — a bot dropdown, journeys listed per bot. But uniqueness is
   enforced per **Agent**: `triggerClaimKey` (`journey-trigger-claim-repository.ts:26`)
   returns `agent:<agentId>#<trigger>` and only falls back to `bot:<botId>` when the bot
   has no Agent. So for a client whose two bots sit under one Agent, the UI shows two
   independent journey lists and publishing `lead_captured` on the second bot is refused
   by a claim held by a bundle that is not on screen.
3. **The refusal has no UI.** `journey-trigger-claim-repository.ts:29` says the rejection
   "is the signal the route turns into an explicit 'this would replace your current
   lead-captured journey' decision for the client." That decision UI was never built. The
   route 409s (`journey-routes.ts:230`) and `handlePublish` toasts the raw string, so the
   user sees `Another published journey already handles this trigger (bundle 7f3a2b1c…)` —
   a UUID they have never seen, for a bundle under a bot they did not select.

**Why:** (2) and (3) are the urgent pair — together they turn a legitimate guardrail into
an unexplainable failure, and they get worse the moment a client has more than one bot per
Agent, which the Agent identity model exists to support. (1) is the slower cost: twelve
nav items with two the user cannot act on, and no visible relationship between the journey
that schedules a reminder and the page the reminder appears on.

**Context:** Found 2026-08-16 while reviewing the journey/scheduler UI ahead of the
Meta-transport seam test (`scripts/test-meta-journey-run.sh`). Deliberately NOT fixed then
— a nav refactor mid-test changes the thing being measured. The claim-vs-UI mismatch is the
part worth knowing before testing: run the seam test on a single-Agent, single-bot client
and a 409 will not appear.

Proposed shape, smallest honest version first:
- **(3) first, it is S.** Catch the 409 in `handlePublish` and render a real choice —
  name the journey currently holding the trigger and offer to replace it. The backend
  already carries `heldByBundleId`; the route just needs to return it structured rather
  than baked into a string.
- **(2) next.** Scope `JourneysPage` by Agent, falling back to bot for unwrapped bots —
  matching what `triggerClaimKey` already does. This is the same collapse
  ["Agents" now collides with the Agent identity model](#agents-now-collides-with-the-agent-identity-model)
  argues for, and doing them together is cheaper than doing either alone.
- **(1) last.** Appointments folds into the Leads inbox (it is lead data, and Leads already
  fans out across bots). The weekly report becomes a Settings toggle — one account
  preference is not a "Scheduler". Lead reminders surface on the lead's own timeline where
  the name and context already exist. Nav goes 12 -> 10.

(1) was blocked on the `lead_reminder` handler being real — folding reminders into a lead
timeline while they delivered nothing would only have moved the honesty problem to a more
prominent page. Unblocked on 2026-08-16: the handler now sends through
`notification-service.ts`, and the "Not delivered yet" badge came off `SchedulerPage` in the
same change.

**Effort:** S (3) / M (2) / L (1)
**Priority:** P2 — but (3) is P1-shaped the day a client has two bots under one Agent
**Depends on:** Nothing outstanding

### [RESOLVED 2026-08-11] Frontend has no test runner — runner added; three libs still uncovered

**What it was:** `frontend/` had no vitest/jest config and zero test files, so the frontend shipped with no automated cover at all while the backend had 300+ tests.

**Fixed:** vitest + jsdom + @testing-library/react, pinned to the same vitest version as the backend so both halves run the same way. `frontend/vitest.config.ts`, a `test` script, and a "Run frontend tests" step in `ci.yml`'s check-frontend job (which previously only type-checked and built). 28 tests land with it, covering `lib/subscription-cache.ts` and `hooks/useSubscription.ts`.

**Still open, narrower:** the three libs this item originally named remain untested — `lib/phone.ts` (E.164 normalization), `lib/lead-ref.ts` (URL <-> LeadRef round-tripping) and `lib/lead-display.ts` (the urgency tiers the lead queue is ordered by). They are pure functions, need no DOM, and `leadUrgency`'s tiers still have to agree exactly with `lead-inbox-service.ts`'s server-side sort with nothing enforcing it. The setup cost that used to block this is now zero.

**Effort:** S (runner done; the three libs are ~30 min of CC time)
**Priority:** P2
**Depends on:** None

### [RESOLVED 2026-08-14] Two traps in the subscription cache — one of them was live

**Correction:** this item claimed "Neither is a live bug" and that `usage` was read by no
page "(verified)". That was wrong. `Settings.tsx:67` takes `subscription` from
`useSubscription()` and passes it to `SubscriptionSection`, which renders
`usage.chatConversations` as "N of M used". Because the whole summary was cached for an
hour, that number could be an hour stale on any cache hit. Found by `tsc` refusing the
change, not by re-reading the code — the original grep missed it because the component
destructures `usage` out of a prop rather than reading `.usage` anywhere.

**Fixed:** `writeSubscriptionCache` now drops `usage` before storing, and
`SubscriptionSummary.usage` is optional to make that honest at the type level. The
provider revalidates on mount regardless (`useSubscription.ts:126`, "Revalidate either
way"), so a cache hit paints entitlements instantly and the counter arrives with the
request. `SubscriptionSection` shows "Loading" for that one request rather than a stale
number. Absent means not loaded yet, never zero — stated in the type, the cache and the
component. `getRoutes()` in `prerender-entry.tsx` now documents the `/` trap.

**What it was:** Neither was thought to be a live bug; both were things the next person could walk into.

1. **`usage.chatConversations` is cached.** `SubscriptionSummary` carries a usage counter and the whole object goes into sessionStorage. No page reads it from the provider today (verified), but a future "you've used 47 of 100 conversations" display fed from `useSubscription()` would show a stale number until the next revalidation.
2. **Prerender would throw if the landing page were ever added to it.** `useTierCheckout` now calls `useSubscription()`, which throws outside a provider. `prerender-entry.tsx` mounts only blog routes, so this cannot happen today; adding `/` to `getRoutes()` would fail the build with "useSubscription must be used within a SubscriptionProvider".

**Why:** Both fail in ways that point somewhere other than the cause — a wrong number on screen, or a build error in a file nobody edited.

**Context:** (1) was fixed by excluding `usage` from what gets cached. (2) was fixed by commenting `getRoutes()`, not structurally: wrapping the prerender tree in the providers is what the file deliberately avoids so Cognito/browser-only code stays out of the Node render, so prerendering `/` remains a real change rather than a one-line array addition.

**Effort:** done
**Priority:** was P3 — trap (1) was really a live bug, so this was underrated
**Depends on:** None

### Add a field-mapping UI for Meta Lead Ads custom questions

**What:** Meta Lead Ads forms have client-configurable custom questions with arbitrary labels. MVP does best-effort auto-mapping by label matching (e.g. a question labeled "phone" maps to `phone`) and stores anything unmatched as a raw custom field, same as `FormLead.customFields` does today. A dedicated mapping UI (mirroring how the form builder defines `FormField[]`) would let clients map Meta's question labels to `name`/`phone`/`email`/`propertyInterest`/`budgetRange` explicitly.

**Why:** Clean, correctly-populated CRM/WhatsApp-notification data from day one instead of relying on label-matching heuristics.

**Context:** Deferred pending evidence clients actually need it — many clients may use Meta's default lead form template as-is, in which case auto-mapping is sufficient indefinitely. Revisit if auto-mapping visibly mishandles real client forms.

**Effort:** M
**Priority:** P3
**Depends on:** Meta Lead Ads backend integration landing first

## Backend

### Deferred by the eng review of Epic A (2026-08-16)

Three items pushed out of [#16](https://github.com/akvinayaktiwari/RigaChat/issues/16)
during `/plan-eng-review`. None block the epic. Two were found by the codex outside
voice rather than by reading the plan.

**Make the `MessageChannel` interface real.** `types/index.ts:1-13` declares
`MessageChannel` / `ChannelMessage` / `ChannelContext` with **zero implementations**,
while CLAUDE.md rule 4 states that all incoming messages flow through it and future
channels are added as new implementations only. Both channels grew their own handling
instead, so the architecture doc is currently fiction. Deferred out of #11 because web
chat is revenue-carrying and must not sit in the blast radius of a feature that has
never run; #11 knowingly duplicates the compose logic as the price of that safety.
Do this once #11 is proven, implementing `WebWidgetChannel` and `WhatsAppChannel`.
**Depends on:** #11 shipping and running clean.

**An abuse record for messages dropped by the inbound cap.** #10's spam guard, as
corrected by this review, creates no lead and sends no reply when a client exceeds the
hourly inbound-lead cap. `lead_events` is partitioned by `leadId`, so a dropped message
has nowhere durable to go and the only trace is a CloudWatch line nobody greps. Needs a
separate audit/counter shape so an abuse event is queryable, and so a client can be told
"you hit the cap, here is when". **Depends on:** #10 defining the cap.

**Real cross-namespace RAG ranking.** `voice-routes.ts:288` does
`[...agentChunks, ...botChunks].slice(0, 5)`: it concatenates two Pinecone namespaces
and takes the first five, ignoring score ordering entirely. #11 is about to copy that
pattern to WhatsApp, which spreads a known-weak ranking from one channel to three.
Replace with real cross-namespace scoring honouring the project's stated retrieval
settings (topK 5, candidate pool 10, MMR lambda 0.7, threshold 0.7). Wants the eval
suite from #11 in place first so the change can be measured rather than guessed.
**Depends on:** #11's shared retrieval helper and eval suite.

**Effort:** M / S / M
**Priority:** P2
**Depends on:** all three depend on #11

### Deferred out of Epic A / Epic B (filed 2026-08-16)

Everything below was explicitly scoped OUT of [#16](https://github.com/akvinayaktiwari/RigaChat/issues/16)
(WhatsApp agent can hold a conversation) and
[#17](https://github.com/akvinayaktiwari/RigaChat/issues/17) (client can see it working),
so that each epic stays shippable. They are listed here rather than lost in an
issue's "Out of scope" section, because most of them are the difference between a
working product and an enterprise one.

**Ordered by value, highest first.**

**Datetime extraction into `book_appointment`.** `handleToolCall`
(`journey-executor-service.ts:138`) reads `requestedAt` from `event.toolInput`, a
value baked into the step at authoring time. Nothing parses "next sunday works"
into a datetime. Cal.com booking is real and connected; the only missing piece is
turning a human's words into a concrete slot. This is the demo moment that did not
land on 2026-08-16, and it is roughly a fifth of the work of full AI composition.

**KB citations under agent replies.** RAG already returns chunks with scores.
Rendering "answered from: Pricing page, Floor plans" beneath an agent message is
nearly free and is the most convincing single answer to an enterprise buyer's
hallucination question. Nobody in the WhatsApp CRM category does this.

**Quiet hours and per-lead rate caps.** Nothing stops a journey messaging a lead at
3am or twice inside a minute. This appears on procurement checklists, and on the
lead's side it is the line between helpful and harassment.

**Confidence-based handoff.** When RAG returns nothing above the 0.7 threshold, the
agent currently says it does not know and stalls. Handing off there converts the
weakest moment in the product into the most trustworthy one.

**Client digest and CRM webhook out.** `lead_events` (#9) makes both cheap: a daily
or weekly summary to the client's WhatsApp number, and an outbound webhook so an
enterprise client can push lead activity into their own CRM. The weekly report
scheduler already exists and currently carries only one action type.

**Human takeover of a conversation.** Deliberately deferred: read-only timeline
first (#13), takeover later. Once two people can send on one thread, collision
detection (showing when a colleague is already typing) becomes table stakes, as
does assignment and routing. That is a shared-inbox product and should be scoped as
its own epic, not bolted onto the timeline.

**Ref-code attribution / many Agents per one number.** Current rule is one WhatsApp
number to exactly one Agent, enforced by the atomic claim in
`agent_binding_lookup`. #10 leaves the resolver extension point in place
(`resolveAgentForInboundMessage` runs a ref-code strategy first, unimplemented),
so this becomes implementing one branch. Needed when a client wants several Agents
sharing one number, or per-source attribution on inbound.

**Retention policy for lead conversations.** `lead_events` has no TTL by design,
because it is the audit record. Combined with "a lead can never be deleted, by
anyone" (below) and inbound-created leads from any number (#10), an enterprise
client has no way to honour a deletion request. The lead delete path is the
prerequisite.

**Effort:** varies, S to L per item
**Priority:** P2, except datetime extraction which is P1-shaped for demos
**Depends on:** most depend on #9 (`lead_events`) landing first


### Backfill backend test coverage onto the pre-vitest services and repositories

**What:** The *framework* half of this item is done — `backend/vitest.config.ts` exists (with the module-import-time env var stubs services need), `package.json` has `"test": "vitest run"` and `vitest ^4.1.10`, and 13 test files / 85 tests pass today. What's left is coverage: **8 of 29 services and 2 of 25 repositories have a `.test.ts`**. Everything tested so far was written alongside new work (journeys, scheduler, agents, MCP, Cal.com, webhooks); nothing older was ever retrofitted. Untested services include the ones carrying the most external-integration risk: `crm-service.ts`, `meta-lead-service.ts`, `chat-service.ts`, `rag-service.ts`, `form-lead-service.ts`, `billing-service.ts`, `openai-service.ts`, `crawler-service.ts`.

**Why:** The original reasoning still holds, just narrowed — this catches the class of bug with no visible symptom (the Lambda-freeze un-awaited CRM sync, a webhook signature check whose failure mode is invisible until exploited). Those live in exactly the untested files listed above. It also unblocks safe refactoring of the Meta/CRM paths, which currently have zero regression cover.

**Context:** No longer a standalone initiative needing its own planning pass — the setup decision is made and proven, so this is now incremental and parallelizable. The practical rule is to stop treating tests as something new work brings along and start requiring one for any older file a change touches. Highest-value first pass: `crm-service.ts` and `meta-lead-service.ts`, since three separate open TODOs in this file (webhook idempotency, cross-tenant PII race, empty `field_data`) all propose changes to that pipeline and none of it is currently covered.

**Effort:** M (was L — framework setup is done)
**Priority:** P2
**Depends on:** None

### Meta Lead Ads: consent screen still answers "Feature Unavailable"

**What:** `Meta Ads -> Connect with Facebook` never reaches a consent screen. Meta
answers *"Facebook Login is currently unavailable for this app, since we are
updating additional details for this app. Please try again later."* First seen
2026-08-11 immediately after the app was published; still occurring 2026-08-12.

**Everything below is verified DONE and is not the cause:**
- App `1620710049625709` is **Published (Live)**; business verified as a **Tech
  Provider** (2026-07-27); Required Actions empty; Alert Inbox has no warnings.
- App-level webhook configured: object `page`, field `leadgen`, callback
  `https://vyostra.com/api/webhooks/meta`. Confirmed via
  `GET /{app-id}/subscriptions`. A dashboard test payload was delivered, passed
  signature verification, and was processed correctly.
- `vyostra.com/api/*` now routes to the Lambda — CloudFront `E2ZWB77M7V8J9X`
  (NOT `E24Z9D4G4FY8PH`, which serves `beepboop.drsyeta.in`) had zero cache
  behaviors, so every `/api/*` path returned the SPA. Fixed with an `/api/*`
  behavior onto the Lambda Function URL origin.
- Deauthorize + Data Deletion callback URLs set (both were EMPTY at publish time).
- Valid OAuth Redirect URIs, `META_REDIRECT_URI` (prod), `META_WEBHOOK_VERIFY_TOKEN`
  (prod matches local), `META_LOGIN_CONFIG_ID` on both Lambdas — all correct.
- **Facebook Login on this app WORKS.** Proven 2026-08-12 via the WhatsApp
  Embedded Signup flow: `FB.login()` opened a popup and the SDK logged
  `client_login_start` -> `client_login_end` -> `client_login_complete_heartbeat`.
  So this is NOT an app-wide gate and NOT a Meta outage.

**Leading hypothesis (untested as of 2026-08-12):** the Lead Ads Login for
Business configuration `1581255013395833` requests **`pages_manage_ads`**, which
this app cannot request — the App Review "Allowed usage" list contains
`pages_manage_metadata`, `pages_show_list`, `business_management`,
`leads_retrieval`, `public_profile` and the two WhatsApp permissions, and **no
`pages_manage_ads`**. Requesting a permission the app does not hold is the only
difference found between the working WhatsApp configuration and the failing Lead
Ads one. (`pages_manage_ads` was added on the strength of Meta's Lead Ads docs;
the dashboard is the authority and disagrees.)

**Next action:** edit configuration `1581255013395833` to remove
`pages_manage_ads`, leaving `pages_show_list`, `pages_manage_metadata`,
`pages_read_engagement`, `leads_retrieval`. Retry the connect. If the permission
cannot be edited after creation, create a new configuration and update
`META_LOGIN_CONFIG_ID` on `rigachat-api` and `rigachat-api-streaming`. The code
side is already done (`9da0425` removed the scope; a test asserts its absence).

**If that fails:** file a Platform Bug Report under **Facebook Login** (draft text
was prepared but MUST be rewritten — it claimed an app-wide Login failure, which
is now disproven). Tech Provider status also grants Direct Support.

**Still needed for App Review regardless:** a screencast. `leads_retrieval` and
`public_profile` are already complete in the submission; the other five
permissions each need "Upload screencast showing the end-to-end user experience",
and the two WhatsApp ones also need API test calls. One recording can serve
several permissions. See `docs/META_APP_REVIEW_SUBMISSION.md` and
`scripts/record-meta-screencast.sh`.

**Effort:** S to test the hypothesis; M if it goes to Meta support
**Priority:** P0
**Depends on:** Meta admin account 4512644655638994 (dashboard-only work)

### Meta deletion requests have no un-notified listing, and Meta retries duplicate them

**What:** Two gaps in the new `meta_deletion_requests` table, both surfaced by Codex's adversarial pass on 2026-08-10:

1. **No way to find abandoned requests.** When SES fails (or is unconfigured) the row is stored with `notified=false` and nobody is emailed. `contact_messages` has a `recordType-createdAt-index` GSI for exactly this recovery path; `meta_deletion_requests` has none, so finding un-notified rows needs a full table Scan. There is no retry worker, alert, or admin console view either — a request can sit unprocessed indefinitely while the status page keeps telling the person it completes within 30 days.
2. **Meta retries create duplicate cases.** `handleMetaDataDeletionRequest` mints a fresh random code per delivery, and the `attribute_not_exists(confirmationCode)` guard only prevents code collisions, not duplicate *source* requests. Meta redelivers on timeout, so one person's request becomes N rows, N ops emails, and N status URLs — completing one leaves the others reading "pending" forever.

**Why:** Both undercut the promise the status page makes. The whole point of the 2026-08-10 change was that the callback stops fabricating success; these are the two remaining ways it can still quietly fail to deliver on it.

**Context:** Fix for (1) is a GSI mirroring contact_messages (`recordType-createdAt-index`) plus an admin listing, which also gives the `status: 'completed'` transition somewhere to live — nothing writes `'completed'` today, so closing a request means hand-editing DynamoDB. Fix for (2) is the same atomic-claim idempotency pattern already filed for the Meta leadgen webhook below; the natural key is the signed request's `user_id` plus a time bucket. Worth doing together, since both touch the same table.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Public deletion-status lookup is unauthenticated and unthrottled

**What:** `GET /api/webhooks/meta/data-deletion/:code` does a DynamoDB point read for any caller-supplied code before returning 404. Codex flagged it as a cost/concurrency amplification vector on 2026-08-10.

**Why:** Recorded rather than fixed, because the severity does not survive comparison with what is already exposed. `POST /api/chat` (public, calls OpenAI), `POST /api/leads` and `GET /api/bots/public/:botId` are all unauthenticated on the same Function URL, and a DynamoDB point read on a tiny table is the *cheapest* of them. Enumeration is not the risk either — the code is 128 random bits. So this is a general "public API has no rate limiting" gap that happens to have been noticed here.

**Context:** The repo already has the mechanism: `redis-repository.ts`'s `tryAcquireContactAttempt` does per-ip/email limiting for the contact form. Applying the same per-ip limiter across the public route surface is the real fix, and is broader than this one endpoint.

**Effort:** M (whole public surface, not just this route)
**Priority:** P3
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

**Progress (2026-08-09):** The `/data-deletion-status` page now exists and is routed (`frontend/src/pages/DataDeletionStatus.tsx`). It takes the second option deliberately — it reports that the request was received and verified and is completed manually within 30 days, and does NOT claim the data has been deleted, because `handleMetaDataDeletionRequest` still performs no purge.

**Progress (2026-08-10):** The "fabricates" half is fixed. `handleMetaDataDeletionRequest` is now async and persists a real record to the new `meta_deletion_requests` table (PK `confirmationCode`) before responding, emails ops via the same best-effort SES path contact-service uses, and issues a 128-bit random `mdr_<hex>` code instead of `meta-deletion-${Date.now()}` — which was both guessable to the second and collision-prone within a millisecond. A public `GET /api/webhooks/meta/data-deletion/:code` backs the status page, so a code that was never issued now says so instead of rendering an identical success page; the endpoint deliberately does not return the stored `metaUserId`. 10 tests in `meta-deletion-service.test.ts`. **Not yet provisioned** — run `scripts/provision-meta-deletion-requests.sh`.

**What is still open:** the actual purge. Meta's signed request carries only an app-scoped `user_id`, and Lead Ads `field_data` (name/email/phone) carries no such id, so there is still no key to correlate a request to stored leads — deletion remains a human reading the notification email. Closing this properly needs either a correlation design (store something Meta-scoped at ingest) or acceptance that manual-within-30-days is the permanent answer. Dropped to P2: the callback is now honest and durable, which is what a reviewer tests.

**Effort:** M
**Priority:** P2 (was P1 — the dishonest-response half is fixed)
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

### [RESOLVED 2026-08-20] Design the Journey step-list data model + Step Functions compiler

**What:** A dedicated design pass for how a client's step-list Journey (trigger → action → wait → condition → action, per the "no graph builder" UX decided in the Agent Scheduler & Journey Flow architecture session) gets stored in DynamoDB and compiled into a real AWS Step Functions Amazon States Language definition at runtime. Must include two guardrails surfaced during that session's outside-voice review: (1) the compiler must reject/forbid unbounded or tight-interval polling patterns (e.g. "check every 5 minutes for 90 days") in favor of a single long Wait state for "wait until X" semantics — realistic Journey shapes land around 200-500 Step Functions execution-history events, nowhere near the 25,000 ceiling, but a naive polling-loop compile pattern could approach it; (2) the Agent config schema must separate channel-specific fields (e.g. WhatsApp's pre-approved message-template requirement, which doesn't apply to the web widget) from channel-agnostic fields (tone, tool palette, qualification logic) from day one, so adding a channel later means adding a config block, not restructuring the fused Journey+Agent+toolbox bundle.

**Why:** Today's session decided the UX shape (step-list, not graph canvas) and the bundling model (fused Journey+Agent+toolbox, one editable unit) but not the data model underneath either. This is the actual translation layer between "client-friendly form" and "Step Functions JSON" — skip this and the builder UI has nothing real to save to, and skip the two guardrails above and they surface mid-implementation instead of at design time.

**Context:** Builds on the approved `agents-schedulers-journeys` design (2026-07-26) and the Agent Scheduler & Journey Flow session (2026-07-29, `plan-eng-review`) that resolved that doc's Open Question #7 (the visual Journey builder was never named as its own deliverable). Still-open from the original design and not resolved by this TODO: Journey-edit-while-in-flight semantics (what happens to a lead's in-progress execution when the client edits the Journey), and the translation from raw Step Functions execution state into the client-facing "where is my lead right now" timeline view.

**Resolved:** Shipped. `backend/src/services/journey-compiler-service.ts` (391 lines) compiles a JourneyDefinition to Amazon States Language, and `journeys` is in `lib/table-names.ts`. Both guardrails from the design session are enforced in code: the compiler rejects backward references outright (`assertForwardReference`, line 117 -- "use a wait_and_recheck step to express try again, not a loop"), and channel-specific config is separated onto `AgentChannelConfig` rather than fused into the journey.

Still genuinely open from the original text, and NOT covered by the compiler: journey-edit-while-in-flight semantics. Partially answered since -- editing a published bundle releases its trigger claim and in-flight executions finish on the version they started on (`journey-service.ts:232`) -- and the UI now warns before that happens. The client-facing "where is my lead right now" timeline is served by `lead_events` + `GET /api/leads/events`.

**Effort:** L (done)
**Priority:** resolved
**Depends on:** None

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

**Progress (2026-08-08, feat/lead-state-and-unified-inbox):** `frontend/src/lib/phone.ts`'s `toWhatsAppNumber()` normalizes to E.164 for the lead workspace's wa.me link — drops the domestic trunk zero, applies +91 to bare 10-digit numbers. That is DISPLAY-time only and does not touch stored data or `phonesMatch()`, so this item stays open. It does establish the normalization rules the capture-time fix can reuse.

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

> **READ BEFORE RUNNING THE SCRIPT (checked 2026-08-20).** The script is still the
> right way to create the tables, roles and ARNs. Its ENV-VAR half is now wrong.
>
> It sets 9 `DYNAMODB_TABLE_*` variables (`AGENTS`, `AGENT_BINDING_LOOKUP`,
> `APPOINTMENT_REQUESTS`, `GUPSHUP_APP_LOOKUP`, `JOURNEYS`, `JOURNEY_EXECUTIONS`,
> `JOURNEY_PENDING_REPLIES`, `JOURNEY_TRIGGER_CLAIMS`, `SCHEDULED_ACTIONS`,
> `WHATSAPP_INBOUND_ACTIVITY`). **Nothing reads them any more** -- zero references
> in `backend/src`. Table names moved into `lib/table-names.ts` on 2026-08-16
> precisely because 30 such variables were eating 1250 of the Lambda's 4096-byte
> env budget, and `rigachat-api` was at 3597/4096. Setting them again puts that
> bloat back and walks toward the same ceiling that already blocked adding a table
> once.
>
> So: run the script for tables/roles/ARNs, then strip the `DYNAMODB_TABLE_*`
> entries it added. The three ARNs below are still genuinely required -- those are
> read at import time and still throw when unset. `DYNAMODB_TABLE_PREFIX` is the
> only table-related variable the code reads now, and only if you point the stack
> at a separate set of tables.

**What:** `scripts/provision-agent-journey.sh` does the whole thing in one run: creates all 8 DynamoDB tables, creates the EventBridge Scheduler execution role, grants the Lambda roles scheduler access, and sets all 11 env vars on all three Lambdas. It is idempotent (skips anything that already exists). Verified against account 291685935704 / ap-south-1 on 2026-08-06 — at that point **none** of it existed.

Run it, then `backend/scripts/backfill-agents.ts` (see the old note below).

**The scope is bigger than the tables**, which is easy to miss: `lib/eventbridge-scheduler.ts` and `services/journey-compiler-service.ts` both **throw at import time** when their ARNs are unset, exactly like a missing table env var. So three ARNs matter as much as the 8 tables:
- `SCHEDULER_TARGET_LAMBDA_ARN` and `JOURNEY_EXECUTOR_LAMBDA_ARN` — both are `rigachat-api`'s own ARN; one bundle serves HTTP, scheduled jobs, and the journey executor (see `backend/index.ts`'s event branching).
- `SCHEDULER_EXECUTION_ROLE_ARN` — **had to be created.** No role in the account was trusted by `scheduler.amazonaws.com`, and there were zero schedules. The app also needs `scheduler:Create/Update/DeleteSchedule` plus a scoped `iam:PassRole` for it.

Key schemas were read out of each repository's `Key:{}` / `KeyConditionExpression`, not from docs. **None of the 8 tables uses a GSI** — all primary-key access.

Do NOT add these as GitHub secrets: `ci.yml`'s env-var step merges a hardcoded allowlist and would silently ignore them (same trap documented in the contact-form entry).

---

Original note, still accurate for the backfill half:

**What:** The additive Agent umbrella (the code is on `main` -- `agent-repository.ts`, `agent-routes.ts`, and both tables in `lib/table-names.ts`; the old `feature/agent-journey-scheduler` branch was superseded and deleted on 2026-08-20) is code-complete and tested, but two things must happen at deploy before it works in production: (1) create the two new DynamoDB tables in AWS — `agents` (partition key `clientId`, sort key `agentId`) and `agent_binding_lookup` (partition key `resourceId`). ~~and add `DYNAMODB_TABLE_AGENTS` / `DYNAMODB_TABLE_AGENT_BINDING_LOOKUP` to every Lambda~~ — **no longer true, see the box above**: names come from `lib/table-names.ts` since 2026-08-16 and those variables are dead; (2) run `backend/scripts/backfill-agents.ts` once the tables exist, to wrap the existing client's chatbot + voice agent into one Agent.

**Why:** The repositories call `getTableName('agents')` / `getTableName('agent_binding_lookup')` at module load, so once anything imports agent-repository in production (the `/api/agents` routes do), a missing table env var throws on cold start. Nothing imports them yet in a hot path, but the Agent routes are live in the bundle. The backfill is what makes the existing client's bot + voice agent actually resolve to one Agent (so journeys/scheduler start stamping `agentId`); without it, the identity layer exists but no real data is wrapped in it yet.

**Context:** Same class of deploy-time infra step as the scheduler ARNs (`SCHEDULER_TARGET_LAMBDA_ARN` / `SCHEDULER_EXECUTION_ROLE_ARN`) already tracked in this file — table creation and env-var sync are not done by any code in this repo. The backfill is idempotent (skips already-bound resources) and conservative (skips any client with >1 bot or >1 voice agent rather than guessing a pairing), so it is safe to run and re-run. Run it manually from `backend/`: `TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm scripts/backfill-agents.ts`.

**Effort:** S (table creation + env-var sync + one backfill run)
**Priority:** P1
**Depends on:** the `feature/agent-journey-scheduler` branch merged/deployed

### [RESOLVED 2026-08-20] When merging feature/agent-journey-scheduler, the blog commit is already on main

**What:** The blog section (`ee2c2ce` on this branch — `/blog`, `/blog/:slug`, the prerender step, the pilgrimage-towns post) was cherry-picked onto `main` ahead of the rest of this branch, on 2026-08-02, as `ee0e77f` + a follow-up fix `808668a`. Both are pushed to `origin/main`. So when this branch is eventually merged, its blog commit is a duplicate of work main already has — do not treat the blog as new, unmerged work, and do not re-apply it.

**Why:** Most of the blog's files are byte-identical on both sides and will merge silently, but **one file will conflict and the resolution is not the obvious one**: `frontend/src/content/blog/posts/branded-budget-residences-pilgrimage-towns/meta.ts` was *added* by both sides with different content, so git sees an add/add conflict with no common base. Main's version has `{ value: '7', label: 'Towns screened' }`; this branch still has the original `'9'`. **Take main's `7`.** Resolving it the other way — or blindly accepting "ours" — silently reintroduces a wrong public-facing stat: the post's screening table only carries data for 7 towns (Ayodhya, Varanasi, Tirupati/Tirumala, Shirdi, Puri, Madurai, Ujjain), and `9` came from the source PDF's cover, which overcounts what its own table renders.

**Context:** The blog was split out early because this branch is ~20 commits of unrelated Agent/Journey/Scheduler/MCP work, and the blog only touched `App.tsx`, `Footer.tsx`, `package.json`, and `.gitignore` outside its own new files — cheap to lift out, and no reason to hold marketing content behind an infra branch. Verified on a main base at the time: `tsc --noEmit` clean and `npm run build` prerenders both blog routes. Note `npm run build` now runs `scripts/prerender.mjs` after `vite build` (client-only build is `npm run build:client`) — that change is already on main, so it is not new at merge time. The cleanest merge is to rebase this branch onto the updated `main` first, which drops the duplicated blog commit and leaves only the single `meta.ts` conflict to resolve.

Verified 2026-08-02 via `git merge-tree --write-tree main feature/agent-journey-scheduler`: the add/add on `meta.ts` is the only blog-related conflict. That same dry run also reported conflicts in `CLAUDE.md`, `TODOS.md`, `backend/index.ts`, and `backend/vitest.config.ts` — those are ordinary divergence between this branch and main, nothing to do with the blog, and are resolved normally. Re-run that command before merging for the current picture.

**Resolved:** There is no merge left to do. Measured 2026-08-20: `feature/agent-journey-scheduler` was **155 commits behind main and 0 ahead** -- every commit on it had already reached main by other routes, so the add/add conflict on `meta.ts` can never arise. The branch was deleted (local and remote) the same day.

Worth keeping from the original note: main's version of that post carries `{ value: '7', label: 'Towns screened' }`, and 7 is the correct number -- the screening table only has data for seven towns. The `9` came from the source PDF's cover, which overcounts its own table.

**Effort:** S (done)
**Priority:** resolved
**Depends on:** nothing
### [RESOLVED 2026-08-05] contact_messages table + SES sender provisioned

**What:** All three manual AWS steps for the contact form are done and verified live against account `291685935704` / `ap-south-1`:

1. **`contact_messages` table** — created, `ACTIVE`, partition key `messageId`, GSI `recordType-createdAt-index` (`recordType` HASH, `createdAt` RANGE) also `ACTIVE`. `DYNAMODB_TABLE_CONTACT_MESSAGES=contact_messages` set on all three Lambdas (`rigachat-api`, `rigachat-api-streaming`, `rigachat-crawler`).
2. **`SES_FROM_EMAIL=noreply@vyostra.com` + `CONTACT_NOTIFICATION_EMAIL=support@vyostra.com`** set on the same three Lambdas.
3. **`ContactFormSesSendPolicy`** (inline, `ses:SendEmail` scoped to `identity/vyostra.com` — not `*`) attached to `rigachat-api-role-4c9qsico` and `rigachat-api-streaming-role-625vca9z`. DynamoDB needed nothing: both roles already carry `AmazonDynamoDBFullAccess`.

End-to-end verified the same day against real infra: a submission wrote a real row and SES reported `Send: 1, Delivery: 1, Bounce: 0, Reject: 0` — the first email this account has ever sent. Test rows were deleted afterward (table back to 0).

**Two findings worth keeping, since both are easy to get wrong again:**

- **Do not add these as GitHub secrets.** `ci.yml`'s "Update Lambda environment variables" step merges a *hardcoded allowlist* (`WHATSAPP_*`, `REDIS_PROVIDER`, `UPSTASH_*`, `SQS_CRAWLER_QUEUE_URL`) onto whatever the function already has. No DynamoDB table name is in that list — every existing one lives directly on the Lambda and survives deploys only because of that `jq '. + {...}'` merge. A new GH secret would be silently ignored unless `ci.yml` is edited too. This applies to the pending Agent tables as well.
- **The SES sandbox (`ProductionAccessEnabled: false`) is not a blocker.** Sandbox restricts *destinations* to verified identities, and `vyostra.com` is verified with DKIM `SUCCESS` — so a `support@vyostra.com` destination works today. Production access is only needed if the notification address ever moves off a verified domain.

**Nothing still open.** `feature/contact-form` merged; `backend/src/routes/contact-routes.ts` is on `main` and `/api/contact` has been live in production since 2026-08-05.

**Effort:** S (done)
**Priority:** resolved
**Depends on:** nothing further

### Editing a knowledge base entry doesn't invalidate the 7-day answer cache

**What:** `redis-repository.ts` caches chat answers under `ans:<botId>:<hash of exact question text>` with `ANSWER_TTL = 7 days` (line 11). Nothing in the KB write path clears it. So after a client corrects a knowledge base entry, every question already asked keeps returning the **pre-edit answer for up to a week**, even though Pinecone now holds the corrected text. `runSuggestionPrewarm()` masks this for the ~10 questions it regenerates, which is why it isn't obvious.

**Why:** Editing an entry is what a client does *because* the bot said something wrong. The one action that is supposed to fix a wrong answer provably does not fix it for anyone who already asked. Found on 2026-08-07 while correcting the VyostraAI marketing bot, whose KB was denying three shipped features; the chunk half was fixable (see the `deleteChunksByEntryId` fix in `kb-service.updateKBEntry`) but the cached answers were not, and had to be deleted one known question at a time via `scripts/clear-cached-answer.ts`.

**Context:** `RedisProvider` (`providers/redis/redis-provider.interface.ts`) exposes only `get`/`set`/`delete`/`setNX` — no `scan` or pattern delete — so `ans:<botId>:*` cannot be swept without extending the interface across both the Upstash and ElastiCache providers. Preferred fix is a per-bot cache generation instead: store `kbgen:<botId>`, include it in the answer key (`ans:<botId>:<gen>:<hash>`), and `INCR` it on any KB create/update/delete. That invalidates a bot's whole answer cache atomically with no scanning, and stale keys age out on their own TTL. Cost is one extra Redis GET on the cached-answer read path, which should be measured before committing to it — the alternative is adding pattern-delete to both providers. Applies equally to the voice-agent KB path, which shares this cache.

**Effort:** M
**Priority:** P2
**Depends on:** None

## Completed

### Build a unified leads dashboard across chat, form, and Meta sources

**What:** `LeadsPage.tsx` (chat leads) and `FormLeadsPage.tsx` (form leads) are separate pages today; the Meta Lead Ads integration adds a third source with its own bare-bones list page for MVP. An agency using all three sources has to check 2-3 separate pages to see their full pipeline.

**Why:** Better UX, and sets up cleanly for whatever the next lead source ends up being (Google Ads, TikTok Lead Ads, etc.) instead of accumulating one page per source indefinitely.

**Context:** Flagged as an Open Question in the Meta Ads design doc (`~/.gstack/projects/akvinayaktiwari-RigaChat/akvinayaktiwari-feature-meta-ads-integration-design-20260725-024416.md`) and deliberately deferred out of that branch — Meta leads land in their own table/API first, readable via a page mirroring `FormLeadsPage.tsx`, and this is the "actually make it nice" follow-up once that's landed.

**Effort:** M
**Priority:** P3
**Depends on:** Meta Lead Ads backend integration landing first

**Completed:** 2026-08-08 (feat/lead-state-and-unified-inbox)


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

### [RESOLVED 2026-08-10] scripts/deploy.sh has drifted and would break login if used

**What it was:** the documented fallback for a CI outage would have shipped a broken dashboard. Verified against the real GitHub repo variables and live AWS on 2026-08-10, which turned up more than the original two divergences:

1. `VITE_COGNITO_REDIRECT_URI` defaulted to the retired `beepboop.drsyeta.in` — already corrected in an earlier commit.
2. `VITE_STAFF_COGNITO_CLIENT_ID` / `VITE_STAFF_COGNITO_REGION` were never emitted, so `useStaffAuth.ts:30` built with an undefined client and the staff console could not sign anyone in.
3. **New:** `CLOUDFRONT_DISTRIBUTION_ID` defaulted to `E24Z9D4G4FY8PH`, which is aliased to the retired domain. Two distributions serve the `rigachat-dashboard` bucket; the live one is `E2ZWB77M7V8J9X` (`vyostra.com`, `www.vyostra.com`). A manual deploy uploaded to S3 and then invalidated the wrong one — `vyostra.com` kept serving stale HTML while the script printed "Deployment complete!".
4. **New:** `form-widget.js` was never injected or uploaded, though CI does both — a manual deploy left it stale on the CDN.
5. **New:** the closing summary printed `https://d1gaddygcav1ob.cloudfront.net`, a hostname that no longer exists.

**Fix:** the seven `VITE_*` values now come from the same GitHub repo variables CI reads (`gh variable list`), falling back to exported env vars, and the script **aborts** rather than using a default when neither resolves — drift is now structurally impossible instead of merely corrected. The dashboard distribution is resolved by matching the login domain against distribution aliases. `form-widget.js` is handled, and the summary prints derived URLs. All three resolution paths (gh, exported-env, abort) were exercised.

**Also fixed:** the related CI health check. It hit `/api/bots/health-check/config`, which matches no route and returned 404 on every deploy while still passing, because the check only failed on >= 500. It now hits `/health` (a real route, verified 200 in production) and fails on anything other than 200.

**Still open, deliberately:** `backend/scripts/deploy.js` (`npm run deploy`) remains stale and two-Lambda — tracked separately in docs/DEPLOYMENT.md, untouched here.

**Effort:** S (done)
**Priority:** P2
**Depends on:** None
