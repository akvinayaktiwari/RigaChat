# Week plan — Tue 8 Sep to Sun 13 Sep 2026

## STATUS as of 11 Sep 03:30 (+04) — read this first

Everything below Day 3 is still to do. Days 1-3 are **merged to main and deployed**, CI green.

| Day | State |
|---|---|
| 1 — voice branch coverage | **DONE, merged.** Found two real bugs, not just gaps. |
| 2 — trim the relay bundle | **DONE, merged.** 3.5MB -> 244K. |
| 3 — keyed read for the identity join | **HALF DONE.** Design written, pagination fixed. **Blocked on your decision.** |
| 4 — one token validator, kill the hardcoded URL | not started, needs nothing from you |
| 5 — relay hardening | not started, needs nothing from you |
| 6 — consent gate, code half | not started, needs counsel's answer for part 2 |

### What Days 1-3 actually found

Three bugs, all the same shape — a `voice` case added to one half of a mirrored pair with
nothing covering it:

1. **A voice lead survived its own erasure.** `eraseLead`'s switch had no voice case, so the
   row lived while its events, state, pending replies and counters were destroyed first --
   and the report said the erasure succeeded. On the endpoint documented as irreversible
   erasure, for someone exercising a deletion right. Now fixed, with a `never`-guard so a
   fifth lead source fails the build.
2. **An inbound match scoped form and meta candidates to the clientId** instead of their form
   or Page, via an inline ternary that fell through. Latent, now routed through the shared
   `leadRefScopeId`.
3. **A client's lead list silently truncated at 1MB.** `getLeadsByClientId` ignored
   `LastEvaluatedKey`, so the identity join answered "no match" for someone whose lead sat in
   the unread part -- a returning caller became a stranger, no error anywhere. Now paginated,
   bounded at 50 pages, and loud if that guard ever fires.

(The fourth, found on 7 Sep: `packLeadRef` could write a voice ref that `unpackLeadRef`
could not read back, so the handoff alert's link was dead for phone leads.)

### BLOCKED ON YOU — three things, none of which I can do

1. **Call Plivo.** No account, no DID, Indian DIDs need KYC. Still the long pole; blocks
   every real call and nothing I do compresses it.
2. **Ask counsel about call-recording disclosure.** The P0 gate in `TODOS.md`. Day 6 builds
   the mechanism; only you can get the answer.
3. **Decide the identity-join index.** `docs/designs/phone-indexed-lead-lookup.md` lays out
   a phone GSI on each of the four lead tables vs. one `lead_phone_lookup`. I recommend the
   lookup, conditionally -- it adds a second write path that can drift, and this repo has
   been bitten by that exact class four times now. The doc says what must be true for the
   recommendation to hold. **Answering this finishes Day 3.**

### Also done this week, outside the plan

- **GitHub issues #17 and #28 closed** — both were already shipped and never closed.
  Verified against code, not the tracker, with the evidence in each issue's comment.
- **gstack upgraded** 1.79 -> 1.81; plan-tune hooks installed and `question_tuning` enabled.
- **Streak: 70 days unbroken, Jul 4 -> Sep 11.** The widget showing "1" was stale cache.
  Note the mechanic that caused the scare: commits on unmerged branches do not count toward
  the contribution graph at all. Merging on 11 Sep retroactively surfaced the 8th and 9th at
  their real dates.

### State of the world

- `main` deployed, CI green. Lambda + frontend only.
- **The relay box still runs its July bundle.** CI never deploys the relay. Telephony is
  fail-closed off (no `PLIVO_*` env), so nothing voice-related is live.
- The box still has `client-sfn`, `client-sesv2`, `client-sqs` installed. Harmless. Remove
  only after the 244K bundle is live and stays live.
- **8 older unmerged branches** exist, some from July. `fix/razorpay-go-live-p0` and
  `feat/whatsapp-embedded-signup-register` look worth a look -- the two GitHub issues turned
  out to be done-but-never-closed, and these may be the same story. Auditing them needs
  nothing from you and would fill a day if the week slips.

### To resume

Say "start day 4" (or 5). Day 3 finishes once you answer the index question above.

---

Six days of work you can run while travelling. Paste the day's prompt, and I do the
work and commit it.

Every item is real work off the verified backlog — the ship review on 7 Sep, the coverage
audit, and the AWS checks from that session. None of it is filler. That matters beyond
tidiness: a day of invented commits costs a day you could have spent on the things that
actually block the first phone call, and it leaves noise in the history you have to read
past later. The daily cadence is a by-product of the work being genuinely day-sized.

**Ordered so dependencies land first.** Day 2 shrinks the relay bundle, which makes Day 3's
change safe to deploy. Day 4 depends on nothing. Days 5 and 6 are independent, so swap them
if your week moves.

**Two things only you can do**, both calendar-bound, both worth starting before Tuesday:
- **Call Plivo.** No account, no DID, and Indian DIDs need KYC. This blocks the first real
  call and nothing I do this week compresses it.
- **Ask counsel about call-recording disclosure.** The P0 gate in `TODOS.md`. Day 6 builds
  the code half, but the answer to "what must we say" is a legal question, not a coding one.

---

## Tue 8 Sep — close the coverage gaps that share a shape with a real bug

**Why this first:** the ship review found a live bug where `packLeadRef` could write a
`voice` ref and `unpackLeadRef` could not read one back, so a staff member tapping the
handoff alert's link landed on nothing. The cause was a `voice` case added to one half of a
mirrored pair with no test covering it. The audit found the remaining instances of that
exact shape. This is the highest-value day of the week because the bug class is proven, not
theoretical.

```
Read the TODO "Voice branches added to shared code without matching tests" in TODOS.md.

Close those gaps, smallest blast radius first:
1. normalizeVoiceLead and readJourneyLead's voice case in lead-resolution-service
2. leadParentIdOf's voice case in journey-ignition-service
3. getUnifiedLeadDetail and getLeadTimeline for a voice-sourced lead in lead-inbox-service
4. A test file for backend/src/routes/voice-routes.ts covering every status-code branch of
   the phone-number routes: 400 invalid JSON, 400 missing field, 400 malformed number,
   404 not found, 409 conflict, 409 already-has-a-number, 200, 204
5. A test file for backend/src/repositories/voice-lead-repository.ts

For each, first check whether the branch is actually CORRECT before pinning it with a test
-- the deep-link bug got through because a test asserted the broken behaviour was intended.
If you find another mirror that has drifted, fix the code and say so.

deleteVoiceLead appears to have no production caller. Do not write a test that pins dead
code in place -- tell me whether to keep or delete it.

Commit in logical chunks. Run both suites and the typecheck before you finish.
```

## Wed 9 Sep — stop the relay bundle dragging in the whole services layer

**Why:** `build:relay` went 144KB → 3.5MB because the identity join imports `lead-service`,
which reaches everything. The relay now needs four AWS SDK clients it has no use for, and
deploying without them installed crashes it into a restart loop that takes browser voice
down too. Doing this before Day 3 means Day 3's change ships onto a smaller, safer bundle.

```
Read the TODO "The voice relay bundle pulls in the whole services layer" in TODOS.md.

Give lead-identity-service a narrow repository-level entry point for "leads for this client,
by phone" instead of importing lead-service. The lookup wants a query, not the service
layer's whole surface.

Then confirm it worked, do not assume:
  cd backend && npm run build:relay && du -h dist/voice-relay.js
  grep -oE 'require\("@aws-sdk/[a-z0-9-]+"\)' dist/voice-relay.js | sort -u

I expect kms, sesv2, sfn and sqs to disappear. If they do not, find out what else pulls
them in and tell me before changing more.

Do NOT remove those four packages from the EC2 box -- the currently deployed bundle is from
July and the deploy script's preflight checks against what the NEW bundle needs. Leave them.

Both suites and the typecheck must pass.
```

## Thu 10 Sep — make the identity join a keyed read

**Why:** `findLeadByPhone` sweeps every lead a client owns on every inbound WhatsApp message
and every phone call. The cost is the obvious half. The quiet half is correctness: DynamoDB
caps a Query page at 1MB, `getLeadsByClientId` never follows `LastEvaluatedKey`, and past
that size the join silently misses the lead it should have matched — a returning caller
becomes a stranger with nothing logged.

```
Read the TODO "Identity join reads every lead a client owns, on every inbound message"
in TODOS.md.

Design it first and show me the options before writing code -- a phone-indexed GSI on the
leads table versus a phone -> leadId lookup table shaped like voice_phone_lookup. I want the
tradeoff (write amplification, backfill cost, whether it works for the other lead sources
too), not just an implementation.

Then implement whichever you recommend, with:
- a provisioning script matching the style of scripts/provision-voice-phone-lookup.sh
- a backfill path for existing leads, since an empty index silently matches nothing --
  the same failure shape as the Meta page-counter backfill that shipped unseeded
- tests covering the join across all four lead sources

Do NOT run the provisioning script against AWS. Leave it for me.

Note phone normalisation already exists in voice-phone-lookup-repository -- reuse it rather
than writing a second normaliser, or the index and the lookups will disagree.
```

## Fri 11 Sep — one token validator, and kill the hardcoded backend URL

**Why:** two copies of the token validator now differ in capability — `auth.ts` gained a
signature scope on 7 Sep and the Lambda's copy did not. They agree today only because an
omitted scope is byte-compatible. The next token change splits them silently. Same day:
`session.ts` carries a hardcoded production Lambda URL because `BACKEND_URL` was never set
on the relay box, which is the same class of mistake that once shipped a login pointing at
a retired domain.

```
Two related jobs, separate commits.

1. Read the TODO "Two copies of the voice token validator" in TODOS.md. Extract the token
   logic to a dependency-free module under backend/src/lib/ that both the Lambda bundle and
   the relay's separate build import. It must not pull in the AWS SDK or any service -- check
   the relay bundle size does not grow (Wednesday's work makes this checkable).
   Add tests for the scoped and unscoped paths, including that a widget token (no scope)
   cannot authorise a transfer.

2. Remove FALLBACK_BACKEND_URL from voice-relay/session.ts and its TODO. Make BACKEND_URL
   required, failing loudly at startup like AWS_REGION and VOICE_AUTH_SECRET do -- a relay
   that cannot reach RAG should say so, not quietly answer without its knowledge base.
   Add BACKEND_URL to backend/.env.example and the relay section of docs/INFRASTRUCTURE.md.

   Tell me the exact line to add to the box's /home/ubuntu/.env. Do not SSH and set it --
   the relay is running and I am not there to watch it.
```

## Sat 12 Sep — relay hardening

**Why:** three loose ends from the infrastructure work, none urgent alone, all cheap
together. The security-group one is the real item: the box allows more inbound than a
machine serving one port needs, and SSM now means shutting the rest costs nothing.

```
Three independent jobs, separate commits.

1. The relay's security group is wider than a box serving one port behind Caddy needs.
   Work out the minimum inbound set, write scripts/provision-voice-relay-sg.sh to apply it
   in the style of the other provisioning scripts, and make it print what it WOULD change
   before changing anything. Do not run it. Note in the script that SSM is the reason
   closing SSH is now safe, and that it must be verified working before SSH is shut, or the
   box is unreachable.

2. The relay's package.json lives only on the EC2 box, so its dependency list has no source
   of truth outside the instance. Bring it into the repo -- decide where it belongs so the
   deploy script's preflight can check against it rather than against whatever happens to be
   installed. Do not change what is installed on the box.

3. Two functions exceed the 40-line rule in CLAUDE.md: handleOpenAIMessage in
   voice-relay/session.ts and handlePlivoAnswer in voice-relay/relay.ts. Split them so each
   reads as a short dispatch or pipeline. Behaviour must not change -- the existing tests
   should pass untouched, and if one needs editing to accommodate the split, that is a signal
   the split changed behaviour. Stop and tell me instead.
```

## Sun 13 Sep — the consent gate's code half

**Why:** a phone call records both halves into `lead_events` with no disclosure line
anywhere. It is the P0 gate before the first real call. Only the legal answer is blocking;
the mechanism can be built and left switched off.

**Needs from you first:** whatever counsel said. If you have not heard back by Sunday, do
Part 1 only — it is useful regardless of what the answer turns out to be.

```
Read the P0 GATE item in TODOS.md.

Part 1 -- build the mechanism, default OFF:
Add an optional disclosure line to the voice agent, spoken as the opening turn before
anything is recorded. Configurable per agent (a field on VoiceAgent), absent by default so
nothing changes for existing agents. Wire it through the relay's buildInstructions so the
browser and telephony paths cannot describe the same agent differently -- that bug has
already happened once on this file.

Part 2 -- only if I have given you counsel's answer:
Handle a caller who declines. "Say the line and record anyway" is not consent, so decide
with me whether declining means transfer-to-human or end-the-call, and build that branch.

Tests for: disclosure absent (unchanged behaviour), disclosure present and spoken first,
and the decline path if built.

Do not switch anything on for a live agent.
```

---

## If you get a spare hour on the trip

Two things worth more than any of the above, and neither is code:

- **Round 1.** `docs/voice-front-desk-observation-log.md` is still a blank template. It was
  meant to gate whether telephony was worth building. It is now the cheap check on whether
  the agent handles real questions before a stranger hears it — and it needs a phone and a
  colleague, not a laptop.
- **The Plivo call.** Ask whether you can hold unassigned Indian DIDs under your own KYC and
  what it costs to sit on them. That answer decides whether client #2 waits days to activate
  voice, and it is a sales question, not a research one.

## Ground rules I will follow all week

- I will not run provisioning scripts, SSH to the relay, or deploy it while you are away.
  Anything touching live infrastructure gets written, tested and left for you.
- If a day's work turns out to be wrong or already done, I will say so and stop rather than
  invent work to fill the day.
- Merging to main deploys to production. I will ask before doing that on any day this week
  unless you tell me otherwise.
