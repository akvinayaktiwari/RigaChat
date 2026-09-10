# Design: a keyed read for the cross-channel identity join

Status: **options, for a decision.** No code written yet — the week plan asks for the
tradeoff first, and the two options differ in kind, not just effort.

## The problem, in one line

`findLeadByPhone` answers "is this phone number already someone we know?" by reading
**every lead a client owns** and filtering in memory, on every inbound WhatsApp message and
every phone call.

## Why it is two problems

**Cost and latency.** `getLeadsByClientId` is an unpaginated Query on `clientId-index`. It
grows with a client's lifetime lead count and sits in the message/call hot path — the
caller is on the line.

**Correctness, and this is the one that bites.** DynamoDB caps a Query response at 1MB and
`getLeadsByClientId` never follows `LastEvaluatedKey`. Past that size it returns a
*truncated, non-deterministic* subset. The join then reports "no match" for someone it
holds a lead for, and the caller becomes a stranger — a second lead, a second history, no
error anywhere. Capping with a `Limit` fixes the cost and leaves this hole exactly as it is.

**Not urgent yet, and worth sizing honestly.** Production today: 33 chat leads, 65 Meta, 26
form, 0 voice, the largest table 20KB. The truncation point is roughly 1MB, so this is
hundreds of times away for the current clients. This is work to do before it is reachable,
not a fire.

## Where it is reached from

```
WhatsApp inbound (Meta Direct + Gupshup) ─┐
                                          ├─> matchLeadForInboundMessage ─> findLeadByPhone
inbound phone call (voice-relay)         ─┘                                        │
                                                                                   ├─ chat leads   (leads, clientId-index)
                                                                                   └─ voice leads  (voice_leads, capped 100)
```

Note the join reads **two** of the four sources. Form and Meta leads are not searched, so a
person who came in through a Facebook lead ad and later sends a WhatsApp message is already
treated as a stranger. Any option below should say what it does about that.

## The four tables are shaped differently

| Table | Partition | Sort | Existing GSIs |
|---|---|---|---|
| `leads` | botId | createdAt | clientId-index, leadId-index |
| `form_leads` | formId | leadId | clientId-index, leadId-index |
| `meta_leads` | clientId | leadId | clientId-createdAt-index |
| `voice_leads` | clientId | leadId | clientId-createdAt-index |

Four partition keys, four shapes. That is the fact that decides this: any per-table index
has to be added four times and queried four times.

---

## Option A — a phone GSI on each lead table

Add a GSI keyed on a normalised phone to `leads`, `form_leads`, `meta_leads`, `voice_leads`.
The join becomes four keyed Queries instead of two table sweeps.

**For**
- No new table, no write path to keep in sync — DynamoDB maintains the index.
- A stale index is impossible; the projection follows the row.
- Deleting a lead removes its index entry for free, which matters for erasure.

**Against**
- Four GSIs to provision, four to backfill, four to keep consistent in shape.
- **The normalised phone has to exist as a real attribute on every row**, because a GSI can
  only key on a stored attribute. That is a schema change plus a backfill on four tables,
  and every writer must populate it or its lead silently stops being findable.
- Still four reads per inbound message, just cheap ones.
- Sparse by nature: a lead with no phone has no entry, which is correct but means the index
  count never matches the table count and that will look like a bug to someone later.

**Completeness: 9/10** — solves cost and truncation for all four sources.

## Option B — one `lead_phone_lookup` table

A dedicated table, partition key `phone` (normalised E.164), holding the `LeadRef` and
`createdAt` of every lead that has a phone. Shaped exactly like `voice_phone_lookup`, which
already does this job for DIDs.

**For**
- **One** point read answers the question, for all four sources at once.
- The join stops caring how the lead tables are keyed — which is the actual source of the
  mess.
- Extends to a fifth channel by writing one row, not adding a fifth GSI.
- Same pattern already in the codebase twice (`voice_phone_lookup`, `gupshup_app_lookup`,
  `agent_binding_lookup`), so it is a known shape rather than a new idea.

**Against**
- **A second write path that can drift.** Every lead-creating path must write the row and
  every erasure must delete it. Miss one and a lead is invisible to the join — silently,
  which is this codebase's recurring failure mode and the reason the erasure bug existed.
- One phone can belong to several leads, so the row is a list or the key is
  `phone#leadId` — either way the "pick the most recent / prefer a parked journey" ordering
  still needs `createdAt` carried on the row.
- Backfill reads all four tables once, and must be re-runnable.

**Completeness: 9/10** — same coverage, different failure mode.

---

## Recommendation: **Option B**, with the drift risk engineered out

The deciding argument is not performance, it is that Option A leaves the join knowing about
four table shapes and Option B leaves it knowing about none. Every future channel pays that
tax again under A.

The honest objection to B is drift, and it is a real one — this repo has been bitten by
exactly that class of bug three times in a fortnight (a `voice` case missing from
`unpackLeadRef`, from `eraseLead`, from the inbound scope mapping). So B is only the right
answer if the write path cannot be forgotten:

1. **One choke point.** Every lead is created through a repository `create*Lead` function.
   The lookup write goes *inside* those four functions, not in their callers.
2. **Erasure already has a `never`-guard** as of 2026-09-08, so a new source cannot be added
   without handling deletion. Extend the same guard to creation.
3. **A reconciliation script**, like `meta/pages/verify`: walk the lead tables, compare with
   the lookup, report and repair. Drift becomes detectable instead of silent.

Without all three, prefer Option A — a GSI that cannot drift beats a lookup table that can.

## Open questions for the decision

1. **Do form and Meta leads join too?** They are not searched today. B makes including them
   nearly free; A means two more GSIs. This is a product question — should a Facebook lead
   who later WhatsApps be recognised? I think obviously yes, but it widens the backfill.
2. **What happens to leads with no phone?** They can never be joined. Both options exclude
   them; worth stating so the counts do not read as data loss.
3. **Is the 1MB truncation worth fixing on its own, now?** Paginating
   `getLeadsByClientId` is a small, independent change that removes the silent-wrong-answer
   half of this today, regardless of which option lands later.

## What is NOT in scope

Deduplicating existing leads that share a phone. The join picks one by a documented rule
(parked journey first, then most recent); merging them is a separate feature with its own
UI questions.
