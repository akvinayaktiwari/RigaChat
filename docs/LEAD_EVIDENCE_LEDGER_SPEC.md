## Context

`LeadState.leadScore` (`backend/src/types/index.ts:964`) is documented as "0-100. Written by the qualification prompt, read by JourneyStep recheck." Neither half is true yet. Nothing writes it, and the journey branch that reads it returns `false` unconditionally. `services/journey-executor-service.ts:167` says so plainly:

> `lead_score` needs a scoring model nobody has specified. Returning false is honest about that; inventing a check that cannot mean anything would be worse.

`TODOS.md:361` poses the same open question and names the fork: where the state lives, and who writes it — "the chat pipeline... ? A human explicitly scoring a lead?"

This issue answers it. A model asked to grade its own certainty will produce a number, and it will be wrong in the direction that makes it look useful. Here that number does not merely fill a field: `recheckField: 'lead_score'` branches a live journey, so a hallucinated score sends real outreach to a real buyer, and the client cannot tell a wrong score from a right one.

The design is an **evidence ledger**: extractors report what they *observed*, never how confident they are. A weight table prices observations, bands decide whether a fact is written or offered to a human, and the 0-100 score is derived from applied facts rather than authored.

**Why now:** the writer does not exist yet. Building it evidence-first costs one extra type and a scoring module. Retrofitting after a prompt-scored implementation ships costs a migration plus every wrong score already acted on.

**Who is affected:** clients working the CRM queue (they see the score and must be able to defend it), and the journey engine (it branches on the score and sends outreach).

Prior art reviewed: `trycompai/crm` (`apps/agent/agent/lib/evidence.ts`, `lib/facts.ts`, `agent/skills/evidence.md`). Their kinds are identity-matching; ours are behavioural. The scoring shape, band gating, `fillsBlank` rule and settle-on-apply semantics are adopted deliberately.

## Current State

Verified 2026-08-13 against `main` @ `9b4959c`.

| Piece | Exists | Behaviour today | Gap |
|---|---|---|---|
| `LeadState.leadScore` | ✅ `types/index.ts:964` | Declared `number \| undefined` | Nothing writes it |
| `leadScore` validation | ✅ `lib/lead-state-validation.ts:63` | 0-100 or null, human-settable via PATCH | No provenance: human vs derived indistinguishable |
| `leadScore` persistence | ✅ `repositories/lead-state-repository.ts:23,34` | In `LeadStatePatch` + `PATCHABLE_FIELDS` | Never populated by any service |
| `recheckField: 'lead_score'` | ✅ `types/index.ts:614` | Declared on `WaitAndRecheckStep` | `journey-executor-service.ts:170` returns `false` for anything but `appointment_booked` |
| Threshold to compare against | ❌ | `WaitAndRecheckStep` has no threshold field | Nothing to compare a score to |
| `ConditionStep` on `lead_score` | ⚠️ `types/index.ts:620` | `operator: 'equals' \| 'not_equals'`, `value: string` | No numeric comparison; out of scope here |
| Chat tool-calling | ❌ | `openai-service.ts` has no `tools:` parameter anywhere | Extraction must be a separate structured pass |
| Structured extraction precedent | ✅ `openai-service.ts:262` `extractPageFacts` | temp 0, JSON out, `stripMarkdownFences` + `repairJson`, type guard, fail-soft catch | Pattern to copy |
| Evidence storage | ❌ | — | New table needed |
| Suggestion UI | ❌ | `LeadDetailPage.tsx` (479 lines) renders notes only | Needs a facts panel |

**Deterministic evidence sources that already exist** and need no new plumbing: `form_leads` answers, `meta_leads` answers, `appointment_requests.status === 'confirmed'`, `whatsapp_inbound_activity.lastInboundMessageAt`, `conversations` transcripts.

**Lambda env headroom, measured 2026-08-13:** `rigachat-api` carries 70 vars / 30 `DYNAMODB_TABLE_*`, ~3558 bytes by naive key+value accounting against AWS's 4KB ceiling. AWS's own accounting runs higher than this method (it reported 4119 bytes at the failure documented on 2026-08-10), so treat headroom as "one variable, verify at provision time" rather than 538 bytes of comfort. Three Lambdas must stay in lockstep: `rigachat-api`, `rigachat-api-streaming`, `rigachat-crawler`.

## Proposed Change

### 1. Evidence kinds and weights

New file `backend/src/lib/lead-evidence.ts`. Pure, no I/O, no DB access — it is a lib, not a service.

**Primary** kinds can carry a fact alone. Each identifies *this buyer stating this thing*, not merely something consistent with it.

| Kind | Weight | Primary | Label (shown to the operator) |
|---|---|---|---|
| `form.answered-field` | 0.95 | ✅ | they typed it into the form themselves |
| `meta.lead-form-answer` | 0.95 | ✅ | they answered it on the Meta lead form |
| `calendar.booking-confirmed` | 0.90 | ✅ | they booked and the slot is confirmed |
| `chat.stated-directly` | 0.85 | ✅ | they said so in chat, in their own words |
| `whatsapp.stated-directly` | 0.85 | ✅ | they said so over WhatsApp, in their own words |
| `chat.implied` | 0.40 | ❌ | implied by what they said, not stated |
| `whatsapp.replied-inbound` | 0.35 | ❌ | they replied at all |
| `page.visited` | 0.30 | ❌ | they viewed a page about it |
| `contradiction` | 0.00 | ❌ | another source disagrees |

`calendar.booking-confirmed` is primary for `intent` only; asserting it against any other field is a programming error and must throw.

```ts
export interface Evidence {
  kind: EvidenceKind
  // Read by a human in a tooltip. Write it for them: "said 'budget is around
  // 1.2 crore' on 12 Aug", not "budget match confirmed".
  detail: string
  observedAt: string
  // conversationId / formId / requestId. Where we saw it. NOT proof, and
  // deliberately not a URL a model can invent.
  sourceRef?: string
}
```

**No extractor may report a score, a confidence, or a band.** The tool schema must not accept one. Getting `kind` right is the extractor's whole job.

### 2. Scoring

Noisy-OR over independent observations, matching the prior art:

```
combined = Π (1 - weight_i)
score    = min(0.99, 1 - combined)
if any evidence.kind === 'contradiction': score = min(score, 0.45)
```

Bands: `verified` ≥ 0.85 **and** `hasPrimary`; `probable` ≥ 0.55; `possible` ≥ 0.30; below 0.30 → `null`, discard, do not store.

One entry per **independent** source. Two facts on the same page or in the same message are one observation. Splitting them double-counts a single source into false certainty, which is the arithmetic this whole design exists to avoid.

### 3. Field registry

```ts
export type LeadFactField = 'budget' | 'timeline' | 'propertyInterest' | 'location' | 'intent'
```

`budget` and `propertyInterest` mirror the existing optional fields on `Lead` (`types/index.ts:98`). The registry is a closed set enforced at the write path; an unknown field is rejected, not stored.

### 4. The decision table (the only write path)

`services/lead-fact-service.ts` is the single write path. These rules are enforced in code, not in a prompt:

| Condition | Outcome |
|---|---|
| Evidence contains `contradiction` | **always `proposed`**, never applied, whatever the score |
| An `applied` fact for this field has `decidedBy` set (a human settled it) | **refuse** — never overwrite a human |
| Same field + same canonical value was previously `dismissed` | **refuse** — never re-offer a dismissal |
| Same field + same canonical value already `proposed` | **refuse** at the write path (not deduplicated on read) |
| `band === 'verified'` | `applied` |
| Field is blank (no `applied` fact) **and** `hasPrimary` **and** `band >= 'possible'` | `applied` — this is `fillsBlank` |
| `band >= 'probable'` | `proposed` |
| `band === 'possible'` | stored, never shown |

`fillsBlank` relaxes the *score* threshold, never the *primary source* requirement. Approving a sourced guess into an empty field is a click that can only say yes, and a client with four hundred leads reads none of them. But a fact with no primary source is never written to the record regardless.

Contradiction never auto-applying is a deliberate divergence from a naive reading of `fillsBlank`. Two sources disagreeing is the exact case a human must settle; a blank field does not make it safe.

**Canonical comparison** (`sameValue`): lowercase, collapse whitespace, and for `budget` normalise Indian numeric forms so `₹1.2Cr`, `1.2 crore` and `12000000` compare equal. Without this the panel offers back the value already on the record, which is the precise click this design removes. The **stored value is always what the source said**; only the comparison normalises.

**Applying settles siblings.** When a fact becomes `applied`, every other `proposed` fact on that field moves to `superseded`. They were all offers to fill the same blank; left alone, accepting one reveals the next, forever.

### 5. Storage

New table `lead_evidence`, PK `leadId`, SK `factId`. Matches the existing leadId-keyed side-table pattern (`whatsapp_inbound_activity`, `journey_pending_replies`) — chosen for the same reason: the three lead tables have three different partition keys, and `leadId` is the stable identity across all of them.

```ts
export type FactBand = 'verified' | 'probable' | 'possible'
export type FactStatus = 'applied' | 'proposed' | 'dismissed' | 'superseded'

export interface LeadFact {
  leadId: string
  factId: string
  clientId: string
  field: LeadFactField
  // What the source actually said, un-normalised.
  value: string
  score: number        // 0-1
  band: FactBand
  hasPrimary: boolean
  evidence: Evidence[]
  status: FactStatus
  // Cognito sub. Set only when a human settled it -- this is what makes
  // "never overwrite a human" checkable.
  decidedBy?: string
  decidedAt?: string
  observedAt: string
  supersededAt?: string
}
```

New env var `DYNAMODB_TABLE_LEAD_EVIDENCE` on all three Lambdas, plus a `TableKey` entry in `repositories/dynamo-client.ts:10`. New `scripts/provision-lead-evidence.sh` modelled on `scripts/provision-lead-state.sh`.

### 6. Derived score

```ts
const FIELD_WEIGHTS: Record<LeadFactField, number> = {
  budget: 0.30, timeline: 0.25, intent: 0.25, propertyInterest: 0.12, location: 0.08,
}
derivedScore = Math.round(100 * Σ_applied(FIELD_WEIGHTS[field] * fact.score))
```

Only `applied` facts count. A `proposed` fact is unresolved and must not inflate the score — otherwise an unread suggestion silently branches a journey.

**State plainly, in the type comment and in the UI: this measures qualification completeness, not likelihood to buy.** A lead scoring 90 means we know almost everything a qualifier asks about, sourced. It does not mean they will purchase. That is the claim the ledger can actually support, and it is why the number is defensible to a client.

Because weights sum to 1.0 and fact scores cap at 0.99, the score cannot reach 100. That is correct and intentional.

`LeadState` gains:

```ts
leadScore?: number                        // 0-100, unchanged shape
scoreSource?: 'derived' | 'human'         // absent means derived
scoreUpdatedAt?: string
```

Per D7: a human PATCHing `leadScore` sets `scoreSource: 'human'` and the rollup stops touching that lead. PATCHing `leadScore: null` clears both and returns the lead to derived scoring. Writes continue to go through the existing per-attribute UPDATE in `lead-state-repository.ts` — never a whole-item Put, for the reason already documented at line 48.

### 7. Evidence emitters

**Deterministic** (no model, cannot hallucinate) — each emits on an event that already fires:

| Source | Emits | Field(s) |
|---|---|---|
| Form lead submitted | `form.answered-field` | whichever registry fields the form maps to |
| Meta lead received | `meta.lead-form-answer` | same |
| `AppointmentRequest` → `confirmed` | `calendar.booking-confirmed` | `intent` |
| WhatsApp inbound message | `whatsapp.replied-inbound` | `intent` |

**Chat extraction** — a new `extractLeadObservations()` in `services/openai-service.ts`, built exactly like `extractPageFacts` (`openai-service.ts:262`): non-streaming `generateChatCompletion`, `temperature: 0`, JSON out, `stripMarkdownFences` + `repairJson`, a type guard, and a fail-soft catch that returns `[]`. It returns `{ field, value, kind, detail }[]` and **has no score field in its schema**.

Per D5 it fires twice per conversation: when `checkLeadTrigger` (`chat-service.ts:196`) captures a lead, and when the conversation closes. Both off the streaming path — a buyer never waits on it. A failed extraction degrades to no evidence and must never fail the chat turn.

### 8. API

Routes call services only. New handlers in `routes/lead-routes.ts` alongside the existing `/detail`, `/state`, `/notes`:

```
GET  /api/leads/facts   -> LeadFact[] for one lead. LeadRef travels as query
                           params, matching GET /detail (lead-routes.ts:134).
POST /api/leads/facts/decide
     body: { leadRef, factId, decision: 'accept' | 'dismiss' }
     accept  -> status 'applied', decidedBy = caller sub, siblings superseded,
                score recomputed
     dismiss -> status 'dismissed', decidedBy = caller sub, never re-offered
```

Both require Cognito auth and both must call `assertLeadOwnedByClient` (`lead-inbox-service.ts:203`) before touching anything.

### 9. Journey branch

`isRecheckSatisfied` (`journey-executor-service.ts:170`) gains a `lead_score` arm reading `LeadState.leadScore`. This needs something to compare against, which does not exist today, so:

```ts
export interface WaitAndRecheckStep extends JourneyStepBase {
  // ...existing
  // Required when recheckField === 'lead_score', rejected otherwise.
  // Enforced by journey-compiler-service before ASL generation, alongside
  // the existing waitDays / maxIterations bounds.
  recheckThreshold?: number
}
```

Satisfied when `leadScore >= recheckThreshold`. A lead with no `lead_state` row, or no score, is **not** satisfied — absence is not a zero, and it must not be treated as a signal.

### 10. UI

`frontend/src/pages/LeadDetailPage.tsx` gains a facts panel above the existing notes section (notes render at line 421 and are the pattern to mirror):

- **Applied facts** — field, value, and a tooltip carrying each evidence `detail` and `label`. Never a raw score.
- **Pending suggestions** — one card per `proposed` fact with Accept and Dismiss. Show `detail` verbatim; that sentence is why the operator can decide in three seconds.
- **The score** — the number, `scoreSource`, and how many applied facts produced it ("62, from 3 facts" / "90, set by you"). A hand-set score gets a "return to automatic" control that PATCHes `leadScore: null`.
- `possible`-band facts are never rendered.

## Acceptance Criteria

1. `scoreEvidence([])` returns `{ score: 0, band: null, hasPrimary: false }`.
2. Two `chat.implied` observations (0.40 each) combine to 0.64 by noisy-OR, band `probable`, `hasPrimary: false`.
3. A single `form.answered-field` (0.95) yields band `verified` and applies to a blank field.
4. Any evidence array containing `contradiction` produces a fact with `status: 'proposed'`, never `'applied'`, even when the field is blank and the score would otherwise reach `verified`.
5. Score never exceeds 0.99 regardless of how many observations are supplied.
6. A `probable` fact against a field that already has an `applied` fact is stored `proposed`, not applied.
7. A `probable` fact against a **blank** field with `hasPrimary: true` is applied; with `hasPrimary: false` it is stored `proposed`.
8. Writing a fact whose field has a human-decided `applied` fact (`decidedBy` set) is refused and returns a typed error, not a silent no-op.
9. Writing a fact whose canonical value was previously `dismissed` on that field is refused.
10. A second `proposed` fact with a canonical value already pending on that field is refused at the write path.
11. `sameValue('₹1.2Cr', '12000000')` and `sameValue('1.2 crore', '₹1.2 Cr')` are both true for `budget`; the stored `value` remains the original string in each case.
12. Accepting a fact sets every sibling `proposed` fact on that field to `superseded` in the same operation.
13. `derivedScore` counts only `applied` facts; adding a `proposed` fact does not change the score.
14. PATCH `/api/leads/state` with `leadScore: 75` sets `scoreSource: 'human'`; a subsequent fact application leaves `leadScore` at 75.
15. PATCH `/api/leads/state` with `leadScore: null` clears `scoreSource` and the next recompute writes the derived value.
16. `isRecheckSatisfied` returns true for `recheckField: 'lead_score'` only when `leadScore >= recheckThreshold`; a lead with no `lead_state` row returns false.
17. `journey-compiler-service` rejects a `wait_and_recheck` step with `recheckField: 'lead_score'` and no `recheckThreshold`, with a message naming the step id.
18. `extractLeadObservations` returns `[]` and logs on unparseable model output; the chat turn still completes.
19. The extractor's JSON schema contains no score, confidence, band or probability field, and a model response carrying one is rejected by the type guard.
20. `GET /api/leads/facts` for a lead belonging to another client returns 403, not that client's facts.
21. `POST /api/leads/facts/decide` for a lead belonging to another client returns 403 and mutates nothing.
22. Fact writes use per-attribute DynamoDB UPDATE expressions; no code path issues a whole-item Put to `lead_state`.
23. No function added by this issue exceeds 40 lines; no `any` appears in any added type.
24. Tests written and passing; `npm run build` clean in both `backend` and `frontend`.
25. No degradation: existing `lead-inbox-service` and `lead-state-repository` tests continue to pass unchanged.

## Testing Plan

| Layer | What | Count |
|---|---|---|
| Unit | `lead-evidence.ts`: noisy-OR arithmetic, ceiling, contradiction clamp, `bandFor` incl. the primary requirement, `sameValue` canonicalisation incl. Indian currency forms | +14 |
| Unit | `lead-fact-service.ts` decision table: every row above, both directions | +12 |
| Unit | `derivedScore` rollup: applied-only, weight arithmetic, empty ledger | +4 |
| Integration | Fact write → read back → accept → siblings superseded → score recomputed | +3 |
| Integration | Human PATCH pins the score; fact application does not move it; null returns to derived | +3 |
| Integration | `isRecheckSatisfied` for `lead_score` across threshold boundary, missing row, missing score | +3 |
| Integration | Cross-client 403 on both new endpoints | +2 |
| Unit | `extractLeadObservations`: unparseable JSON, schema carrying a score field, empty transcript | +3 |
| E2E | Chat states a budget → lead captured → fact appears on LeadDetailPage → operator accepts → score moves | +1 |

Existing suites to keep green: `lead-state-repository.test.ts`, `lead-inbox-service.test.ts`, `journey-executor-service.test.ts`, `journey-compiler-service.test.ts`.

## Rollback Plan

Additive by construction. `LeadState.leadScore` keeps its existing type and validation range, so nothing that reads it today changes shape.

1. **Emitters:** revert the PR. No evidence is written; existing `lead_evidence` rows are orphaned but harmless.
2. **Score:** stop the recompute. `leadScore` reverts to what it is today — absent — and `isRecheckSatisfied` returns false for `lead_score`, exactly the current behaviour.
3. **Table:** `lead_evidence` can be left in place; it is read only by the new code. Delete after a retention window if abandoned.
4. **Env var:** removing `DYNAMODB_TABLE_LEAD_EVIDENCE` requires the same three-Lambda lockstep as adding it. CI's jq env-merge re-adds vars on deploy, so remove it there too or it returns.
5. **Journey steps:** any published bundle using `recheckField: 'lead_score'` must be republished or the branch reads a score that stopped updating. Land the emitters before advertising the branch.

## Effort Estimate

| Component | Effort |
|---|---|
| `lib/lead-evidence.ts` + unit tests | 3h |
| `repositories/lead-fact-repository.ts` | 2h |
| `services/lead-fact-service.ts` (decision table) + tests | 4h |
| Deterministic emitters (4 call sites) | 3h |
| `extractLeadObservations` + prompt + tests | 3h |
| Derived score + `LeadState` provenance | 2h |
| Routes + auth checks + tests | 2h |
| `recheckThreshold`: type, compiler validation, executor arm | 2h |
| Table provisioning + env var across 3 Lambdas + CI | 1h |
| `LeadDetailPage` facts panel | 4h |
| **Total** | **~26h** |

## Files Reference

| File | Change |
|---|---|
| `backend/src/lib/lead-evidence.ts` | **New.** Kinds, weights, `scoreEvidence`, `bandFor`, `sameValue`, `FIELD_WEIGHTS`, `derivedScore` |
| `backend/src/repositories/lead-fact-repository.ts` | **New.** `lead_evidence` reads/writes, per-attribute UPDATE |
| `backend/src/services/lead-fact-service.ts` | **New.** The only write path; decision table; settle-on-apply |
| `backend/src/types/index.ts:964` | `LeadState`: add `scoreSource`, `scoreUpdatedAt`; correct the `leadScore` comment |
| `backend/src/types/index.ts:610` | `WaitAndRecheckStep`: add `recheckThreshold?: number` |
| `backend/src/types/index.ts` | Add `LeadFact`, `Evidence`, `EvidenceKind`, `LeadFactField`, `FactBand`, `FactStatus` |
| `backend/src/repositories/dynamo-client.ts:10,40` | Add `lead_evidence` `TableKey` + env var mapping |
| `backend/src/repositories/lead-state-repository.ts:23,34` | Add `scoreSource`, `scoreUpdatedAt` to patch type and `PATCHABLE_FIELDS` |
| `backend/src/lib/lead-state-validation.ts:63` | `parseLeadScore` sets `scoreSource: 'human'`; null clears it |
| `backend/src/services/openai-service.ts:262` | Add `extractLeadObservations` beside `extractPageFacts` |
| `backend/src/services/chat-service.ts:196` | Fire extraction at lead capture and conversation close |
| `backend/src/services/journey-executor-service.ts:170` | `isRecheckSatisfied`: add the `lead_score` arm |
| `backend/src/services/journey-compiler-service.ts` | Reject `lead_score` recheck with no `recheckThreshold` |
| `backend/src/routes/lead-routes.ts:134` | Add `GET /facts` and `POST /facts/decide` |
| `backend/src/services/form-lead-service.ts` | Emit `form.answered-field` |
| `backend/src/services/meta-lead-service.ts` | Emit `meta.lead-form-answer` |
| `backend/src/services/appointment-service.ts` | Emit `calendar.booking-confirmed` on `confirmed` |
| `backend/src/services/whatsapp-service.ts` | Emit `whatsapp.replied-inbound` |
| `scripts/provision-lead-evidence.sh` | **New.** Modelled on `provision-lead-state.sh` |
| `frontend/src/pages/LeadDetailPage.tsx:421` | Facts panel above notes; accept/dismiss; score provenance |
| `frontend/src/types/` | Mirror the new lead fact types |
| `CLAUDE.md` | Document `lead_evidence`, the new env var, and the two new routes |

## Out of Scope

- **Queue re-ordering by score.** `lead-inbox-service.ts` urgency tiers stay exactly as they are. Introducing scoring and changing queue ordering in one issue makes any regression impossible to attribute.
- **`ConditionStep` numeric operators.** `field: 'lead_score'` with `equals`/`not_equals` on a string stays unusable; adding `gte`/`lte` is a separate change.
- **Backfilling existing leads.** No historical transcripts are re-scored. Facts accrue from the emitters going forward.
- **Voice channel evidence.** `voice-service.ts` emits nothing here.
- **Auto-advancing `status`.** A score never moves a lead from `new` to `qualified`; that stays a human action.
- **The `DYNAMODB_TABLE_PREFIX` refactor.** The durable fix for the 4KB ceiling is collapsing 30 table vars into one composed prefix. It must land on all three Lambdas in lockstep and is its own issue. This issue adds one variable and verifies headroom at provision time.
- **Per-Agent field registries.** The registry is global (D6). Per-vertical registries wait until a non-property client needs one.
- **Re-scoring on template change.** Published bundles are not re-evaluated when weights change.

## Prerequisites

1. Verify env headroom before provisioning: `aws lambda get-function-configuration --function-name rigachat-api --region ap-south-1 --query 'Environment.Variables'`. If the update rejects at 4KB, the `DYNAMODB_TABLE_PREFIX` refactor becomes a blocking dependency rather than a follow-up.
2. Add `DYNAMODB_TABLE_LEAD_EVIDENCE` to CI's jq env-merge, or it is dropped on the next deploy and `getTableName()` throws at runtime while code, tests and CI all pass.

## Related

- `TODOS.md:357-363` — the `wait_and_recheck` satisfied-check gap this closes for `lead_score`
- Prior art: [trycompai/crm](https://github.com/trycompai/crm) — `apps/agent/agent/lib/evidence.ts`, `agent/skills/evidence.md`
