# Per-resource connections: WhatsApp numbers and Meta Pages

**Status:** specced, not started. Nothing in this document has been built.
**Written:** 2026-09-02
**Verified against:** `main`, backend test suite at 712 passing
**Scope owner:** this is the RigaChat half. VyostraMobile is touched only by child M4.

---

## The one-sentence problem

Every external connection on `ClientRecord` is a singleton, while we sell an
`agency` plan (`backend/src/types/index.ts:459`). Most clients admin more than
one Facebook Page; agencies admin many. The data model cannot express that, and
the failures are silent.

```
ClientRecord
  crmConnection?                  singleton
  whatsappConnection?             singleton   (Gupshup - OUT OF SCOPE, being deprecated)
  metaDirectWhatsAppConnection?   singleton   <- W1/W2/W3
  metaConnection?                 singleton   <- M1/M2/M3/M4
  calComConnection?               singleton
  plan: 'starter' | 'growth' | 'agency'
```

---

## Verified findings

Every line reference below was read on 2026-09-02. Re-verify before editing —
this file will drift.

### F1. Meta Page selection is an array index, not a choice

`backend/src/providers/meta-provider.ts:229`

```ts
const page = pagesData.data?.[0]
```

`/me/accounts` returns every Page the person administers. We take the first,
discard the rest, and discard the long-lived user token with them. The client is
never shown a list.

### F2. Leads from unconnected Pages are dropped silently and permanently

`backend/src/services/meta-lead-service.ts:344`

An unmapped `pageId` logs `no client mapped for page …`, calls `markProcessed`,
and returns 200. No error, no dashboard row, no notification — and the
idempotency mark means **Meta never redelivers it**. For a client with 3 Pages
connected to 1, roughly two-thirds of Meta leads vanish with no signal anywhere.

This is the most severe bug in the product: the entire value proposition is
"tell the client a lead arrived."

### F3. The wrong-token bug is latent right now

`backend/src/services/meta-lead-service.ts:334`

```ts
pageAccessToken = await decrypt(client.metaConnection.pageAccessTokenEncrypted)
```

The token belongs to the *one* connected Page. The moment a client has more than
one, this is the wrong token for every Page but one.

**Making `metaConnection` an array does not fix this.** The token must be
reachable *from the `pageId`*, or the code stays wrong by construction. This is
the reason for decision D1.

### F4. `/me/accounts` is unpaginated — the picker would cap at 25

`backend/src/providers/meta-provider.ts:217-234` sets no `limit` and never
follows `paging.next`. Meta's default page size is 25. An agency admin'ing 40
Pages would be shown 25 and silently lose 15 — the same class of bug,
reintroduced inside the fix.

### F5. `discoverWhatsAppAccount` has the same bug three times

`backend/src/providers/meta-whatsapp-provider.ts:351-386`

```ts
const business = businesses.data?.[0]   // :353  me/businesses
const waba     = wabas.data?.[0]        // :363  {business}/owned_whatsapp_business_accounts
const phone    = phones.data?.[0]       // :376  {waba}/phone_numbers
```

**The one-number limit is ours, not Meta's.** `{waba}/phone_numbers` is a list
endpoint; Meta returns every number on the WABA and we throw all but the first
away. Multi-number is available today.

A client with two business portfolios also silently gets the wrong one, and the
error text at `:366-368` blames their consent screen when the cause is our array
index.

`getJson` (`:388-402`) sets only `fields` — same pagination ceiling as F4.

### F6. Inbound WhatsApp scans the whole clients table, per message

`backend/src/services/meta-whatsapp-webhook-service.ts:251-252`

```ts
const clients = await getConnectedWhatsAppClients()
const owner = clients.find((c) => c.metaDirectWhatsAppConnection?.phoneNumberId === phoneNumberId)
```

`getConnectedWhatsAppClients` (`backend/src/repositories/client-repository.ts:226-248`)
is a **full paginated DynamoDB Scan with a FilterExpression**. Its own comment
says it was written for weekly reports. It runs on **every inbound WhatsApp
message**, and cost grows linearly with total customer count forever.

The codebase already solved this exact routing problem twice —
`meta_page_lookup` and `gupshup_app_lookup` — with the pattern this path skips.

### F7. Connect cost vs the Lambda budget

`rigachat-api` is **60s timeout, 256MB** (verified live via
`aws lambda get-function-configuration`). Per Page, `connectMetaAds` does one
`subscribePageToWebhook` Graph call, one DynamoDB write, and
`prewarmFormSchemas` (another Graph call plus a Redis write per form). At ~300ms
per round trip, ~30 Pages is roughly 20s; ~60 Pages exceeds the budget and
half-finishes, leaving Pages mapped but not subscribed — which looks connected
and never delivers.

### F8. Redis swallows every error — unusable for pending OAuth state

Every helper in `backend/src/repositories/redis-repository.ts` is
`try { … } catch { return null }` (see `getCachedFormQuestions:177-186`).

Correct for a cache; **wrong for a pending OAuth session**, where `null` would
mean "your Facebook authorization vanished" and would strand a client who just
consented. Pending state goes in DynamoDB with a TTL attribute.

### F10. Meta holds Page grants at the USER level, not per-connection

Not found in our code -- found in vendor documentation during the 2026-09-02
research pass, and it is specific to an agency product.

Meta keeps the app's Page grant against the **Meta user**, not against our
`clientId`. If one person administers several of our clients and runs the connect
flow more than once selecting different Pages, Meta can overwrite the earlier
grant. Our `meta_page_lookup` row survives, so the dashboard keeps showing the
Page as connected while Meta has silently stopped delivering its leads.

`meta_page_lookup`'s claim model cannot detect this: the row is ours, the grant
is Meta's, and nothing reconciles them. Any design that treats "we have a row"
as "we are connected" inherits this. The reconciliation job is deliberately NOT
in the first cut (see M5), but the registry must carry a `lastVerifiedAt` from
day one so the job can be added without a migration.

### F9. No provisioning script exists for `meta_page_lookup`

`backend/src/lib/table-names.ts:47` registers the name; nothing in `scripts/`
creates the table. It was made ad hoc. The new GSI needs a script.

---

## What is ALREADY CORRECT — do not rebuild

This is the part that shrinks the work, and an earlier reading of this got it
wrong. **The agent-binding layer is finished.**

- `backend/src/services/agent-service.ts:35` — `CLAIMABLE_CHANNELS` includes `whatsapp` (since 2026-08-16)
- `backend/src/services/agent-service.ts:184` — writes `whatsapp: { resourceId: connection.phoneNumberId }`
- `backend/src/repositories/agent-binding-lookup-repository.ts:39` — `claimAgentBinding` enforces one-resource-one-Agent atomically
- `backend/src/services/inbound-agent-resolution-service.ts` — resolves inbound → Agent through that binding, with an ordered strategy chain and a deliberate empty `ref_code` seam at `:35`

**A `phoneNumberId` is already a valid claimable `resourceId`.** The binding
machinery works; it simply has only one number to bind, so it has nothing to
distinguish.

### Stale comment to delete

`backend/src/types/index.ts:1027-1033` claims:

> Absent for 'whatsapp', whose connection lives on the client record (no
> per-agent WhatsApp resource id exists today), so a whatsapp binding is a
> marker with no claimable resourceId.

**This is false** and contradicted by `agent-service.ts:35` and `:184`. Delete it
as part of W1 — it is actively misleading.

### Other invariants that must survive

Each of these has a comment explaining a real incident. Do not "simplify" them:

- `setPageClientMapping`'s `ConditionExpression` race guard (`meta-lead-repository.ts:126`)
- claim-before-release ordering in `connectMetaAds` (`meta-lead-service.ts:158-172`)
- the disconnect ownership check (`meta-lead-service.ts:210-217`)
- `MAX_EMPTY_FIELD_DATA_ATTEMPTS` empty-`field_data` retry gate
- per-item error isolation in `processMetaLeadWebhook`
- `subscribedApps` on the WhatsApp connection (`types/index.ts:382-388`) — credentials let you *send*, only the subscription lets you *receive*; losing it fails invisibly

---

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Page registry lives on `meta_page_lookup` (add `pageName`, `pageAccessTokenEncrypted`, `clientId` GSI); remove `metaConnection` from `ClientRecord` | Token reachable only via `pageId` — F3 becomes unwritable, not merely fixed |
| D2 | Drop `prewarmFormSchemas` from connect; cap one request at 25 Pages | ~8s of the 60s budget at 25; `loadFormSchema` already lazily covers the removed prewarm |
| D3 | Backfill script, no forced reconnect | Data is already in the client records; reconnect means a Facebook consent screen for people who did nothing wrong |
| D4 | Per-Page **and** disconnect-all | All-route is a loop over the one-route |
| D5 | `pageName` plumbed onto the lead, incl. VyostraMobile type re-copy | Multi-page without showing which Page is half a feature |
| D6 | Widen scope from "Meta multi-page" to "per-resource connections"; WhatsApp identity is the priority half | Same defect at two layers; fixing Meta alone gives an agency six Pages answered by one indistinguishable WhatsApp identity |
| D7 | Gupshup out of scope | Being deprecated |
| D8 | **Store the long-lived Meta user token, encrypted** (`meta_user_token` on the client, same KMS path as `pageAccessTokenEncrypted`) | Adding a Page weeks after connect needs a fresh `/me/accounts`, which needs the user token. We currently discard it at `meta-provider.ts:229`. Without it every Page change is a Facebook redirect. Cost accepted: a ~60-day credential whose expiry becomes a first-class UI state, not a silent failure. Decided 2026-09-02 (dec a50f3032) |
| D9 | Connect-time default is **all Pages pre-selected**, with deselect | The client already made the grant decision on Meta's consent screen; re-asking the same question in our UI is friction that produces the current bug's outcome (Pages approved but not connected). Matches bundle.social's documented pattern: grant broadly at Meta, curate in-app |

---

## Children

| # | Title | Priority | Effort (human / CC) | Depends on |
|---|---|---|---|---|
| **W1** | `whatsapp_number_lookup` registry; delete the inbound clients Scan | **Critical** | ~2d / ~35m | — |
| **W2** | Multi-number discovery + number picker (2-step OAuth) | **Critical** | ~2d / ~40m | W1 |
| **W3** | Per-agent number selection in the agent UI | High | ~1d / ~25m | W2 |
| **M1** | Page registry on `meta_page_lookup` + backfill | **Critical** | ~2d / ~35m | — |
| **M2** | Paginate `/me/accounts` + Page-list endpoint | **Critical** | ~1d / ~20m | — |
| **M3** | Page picker + multi-connect + per-Page disconnect | **Critical** | ~2.5d / ~50m | M1, M2 |
| **M4** | Source Page on the lead (incl. VyostraMobile re-copy) | High | ~1d / ~30m | M1 |
| **M5** | Token-expiry state + grant-drift reconciliation (F10) | High | ~1.5d / ~30m | M3 |

```
W1 ──> W2 ──> W3

M1 ─┬─> M3
M2 ─┘
M1 ──> M4
```

**Sequencing rationale.** W1 first and alone: it is the only child that fixes a
bug already costing money on every inbound message (F6), and it is invisible to
clients. W1 and M1 are the same change in two tables — do them back-to-back
while the pattern is loaded. M2 and W2 both fix Graph pagination in two
different providers: same bug, same test shape.

**Smaller first cut if 11.5 days is too much:** `W1 + M1` alone (~4 days) fixes
both silent-loss bugs and the table Scan with no UI work. The pickers follow.

---

### W1 — registry + delete the Scan

```
whatsapp_number_lookup   (PK: phoneNumberId)
  phoneNumberId, clientId, wabaId, businessAccountId,
  accessTokenEncrypted, displayPhoneNumber, notificationNumber,
  subscribedApps: boolean, connectedAt
  GSI  clientId-connectedAt-index   (projection ALL)
```

`meta-whatsapp-webhook-service.ts:251-252` becomes a `GetItem` on
`phoneNumberId`. `getConnectedWhatsAppClients` stays (weekly reports legitimately
need it) but loses its hot-path caller. Claim via the same `ConditionExpression`
as the other two lookups. Backfill script in the shape of D3. Delete the stale
comment at `types/index.ts:1027-1033`.

**Acceptance criteria**

1. Inbound resolves with one `GetItem` and **zero** Scans — assert the Scan is not called.
2. Two numbers on one client route to their own agents.
3. An unmapped number logs and drops, exactly as today.
4. Backfill is idempotent; `--dry-run` writes nothing and prints the row count.
5. `subscribedApps` survives the migration (F-note: load-bearing, not diagnostic).

### W2 — multi-number discovery + picker

`discoverWhatsAppAccount` splits into `discoverWhatsAppNumbers(token)` returning
**every** business × WABA × number, paginated (fixes F5 + the F4-shaped gap in
`getJson`). Two-step OAuth with a 10-minute TTL pending-session table — share one
`meta_connect_sessions` table with M3, the shapes are identical. Per F8, DynamoDB
not Redis.

**Acceptance criteria**

1. A token with 2 WABAs × 3 numbers returns all 6.
2. Connecting 3 writes exactly 3 rows.
3. A number claimed by another client is **skipped with a reason, not fatal** — one bad number must not lose the other selections.
4. `subscribed_apps` runs per WABA once, not per number.
5. An expired session returns a distinct reason code rendering as "that took too long, start again" — never the generic failure.

### W3 — per-agent number selection

Agent create/edit gets a dropdown of the client's connected, unbound numbers.
The binding path already exists (`agent-service.ts:184`); this is UI plus a list
endpoint.

**Acceptance criteria**

1. Two agents on two numbers each answer only their own inbound.
2. Binding a claimed number returns `AgentBindingConflictError` rendered as a usable message.
3. An agent with no number bound falls through to `resolveByOnlyAgent` exactly as today.

### M1–M4

Fully drafted in the session that produced this file. Summary:

- **M1** — mirror of W1 for `meta_page_lookup`: add `pageName` +
  `pageAccessTokenEncrypted` + `clientId-connectedAt-index`; new
  `MetaPageRegistration` / `MetaPageSummary` types; `meta-lead-service.ts:325/334/441`
  read the registration instead of `client.metaConnection`; provisioning script
  (F9) + idempotent backfill. **Do not remove `metaConnection` until M3 has been
  in production one week** — that keeps the revert to "redeploy previous Lambda."
- **M2** — `fetchAllManageablePages(userToken)` with `limit: '100'` and
  `paging.next` followed to a 10-hop / 500-Page safety stop (logged if hit).
- **M3** — split `GET /api/meta/callback` into callback → pending session →
  `POST /api/meta/pages`. New routes: `GET /api/meta/pending/:sid`,
  `GET|POST /api/meta/pages`, `DELETE /api/meta/pages/:pageId`, existing
  `DELETE /api/meta/disconnect` becomes disconnect-all. >25 rejected with a typed
  error; already-claimed Pages skipped not fatal; `prewarmFormSchemas` deleted
  from this path per D2. Frontend `MetaAds.tsx` "Connected Page" singular becomes
  a list with per-row disconnect.
- **M3 (extended 2026-09-02 per D8/D9)** — the connect flow stores the encrypted
  long-lived user token, and `GET /api/meta/pages` serves the live `/me/accounts`
  list from it rather than only from a transient pending session. That single
  change is what makes the picker work *after* connect as well as during it, so
  "add a Page three weeks later" is the same endpoint, not a second feature. The
  picker defaults every returned Page to selected (D9). Registry rows carry
  `lastVerifiedAt` for F10.
- **M5 (new)** — token-expiry and grant-drift handling: surface an expired user
  token as an explicit "reconnect Meta" state rather than an empty Page list, and
  a reconciliation pass that re-reads `/me/accounts` and flags Pages Meta no
  longer grants (F10). Deliberately deferred out of the first cut, but M3 must
  leave `lastVerifiedAt` and a typed expiry error in place so M5 needs no
  migration. Effort ~1.5d / ~30m. Depends on M3.
- **M4** — `UnifiedLead.sourceLabel?: string` set from `registration.pageName`
  in `lead-inbox-service.ts:133-136` and `:314`.
  **Cross-repo:** VyostraMobile copies these types verbatim with a recorded SHA
  and CI fails on drift — the same change must re-copy the block, bump the SHA
  in `VyostraMobile/src/types/index.ts`, and tick the row in its `TODOS.md`.

---

## Definition of Done (epic)

1. One client, two WhatsApp numbers, two agents — a message to each number is answered by its own agent, with its own persona and knowledge base.
2. Inbound WhatsApp performs **zero** `clients` table Scans (asserted in test).
3. A client admin'ing 5 Meta Pages connects 3; a test lead on each of the 3 lands, notifies, and syncs to their CRM.
4. A test lead on the 2 unconnected Pages produces no record (correct — not connected).
5. A client admin'ing 40 Pages sees all 40 in the picker.
6. Every client connected before migration keeps capturing with **zero** action on their part.
7. Backend suite green, no reduction from 712.

---

## Out of scope

- **Gupshup** (D7). `whatsappConnection`, `gupshup_app_lookup`, and the `activeWhatsappProvider` switch are untouched.
- **Agency / end-client resource ownership transfer.** One Page or number maps to
  one Vyostra client, enforced by `ConditionExpression`. If an agency connects a
  resource and the end client later signs up wanting it, they get
  `MetaPageAlreadyConnectedError` / `AgentBindingConflictError` with no
  self-serve path. Real, predates this work, and agencies make it routine — but
  it needs a product decision about who owns a resource's leads, not just code.
  **File separately.**
- Ad-account-level anything. Lead Ads webhooks are per-Page; ad accounts are not
  a concept this system touches. Multiple ad accounts pointing at one Page
  already work correctly and need no action.
- `pages_manage_ads` / Meta App Review. Unchanged by this epic.
- `ref_code` strategy (many agents sharing one number). The seam exists at
  `inbound-agent-resolution-service.ts:35`; leave it empty.
- Per-Page / per-number notification preferences.
- Reassigning existing leads between Pages.

---

## Open questions

1. **Agent attribution on the lead.** M4 shows *which Page* a lead came from. The
   WhatsApp equivalent is showing *which agent/number* answered — the inbox shows
   neither today. Fold into W3, or separate follow-up? This is the one place the
   two halves of the epic are not symmetrical.
2. **Is the 25-Page cap per request or per client?** Currently specced
   per-request, so a client can connect 25 then 25 more. A true per-client
   ceiling changes the validation.
3. **Partial success UX.** W2 AC3 and M3 both make an already-claimed resource a
   *skip* rather than a failure, so one bad entry in 25 does not lose the other
   24. That means "connect" can partially succeed and the UI must explain it
   clearly. Needs a design pass.

---

## How to resume

Nothing is built. Start with W1 — it is independent, invisible to clients, and
fixes the only bug here that is already costing money on every message.

`/spec` was mid-flight when this was written: Phases 1–4 complete (decisions
D1–D7 locked, draft reviewed), Phase 4.5 (quality gate) and Phase 5 (file the
issue) never ran. **No GitHub issue exists for any of this.** Either re-run
`/spec` against this file to file the epic, or work straight from it.
