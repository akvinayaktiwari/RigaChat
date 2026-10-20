# Design: Voice Agent Telephony v2 (bring your own carrier)

Reviewed by /plan-eng-review on 2026-10-19
Branch: main (no implementation branch yet)
Repo: akvinayaktiwari/RigaChat
Status: IN REVIEW
Supersedes: docs/designs/voice-agent-telephony-v1.md (the routing, adapter and safety
decisions there still stand; what changes is WHOSE carrier account a call arrives on)

Review target: the bring-your-own-carrier plan drafted in the 2026-10-19 conversation,
reproduced unchanged below, then reviewed.

## Original plan (unchanged copy)

Vyostra is a wrapper over the client's own telephony account. It never rents numbers
or holds a shared carrier account at launch. The client keeps their numbers, their
carrier contract, their carrier bill, and their country's compliance. We connect their
calls to the voice agent and to everything already built: the CRM, WhatsApp follow-up,
Meta leads, journeys.

Decisions already made by the owner (2026-10-19, in conversation):
1. Client-owned carrier accounts only at launch. A shared or managed "Vyostra number"
   is deferred as a later paid add-on, added only when clients decline the product
   because they will not create a carrier account.
2. Plivo is the first carrier (it covers India and many other countries). The existing
   code in `backend/src/voice-relay/transports/plivo-*.ts` moves from the single
   env-var account (`voice-relay/server.ts:37`, `PLIVO_AUTH_TOKEN`) to per-client
   connections. Twilio second. Telnyx, Exotel, Vonage later as adapters.
3. A guided setup wizard is in scope: the client pastes credentials, we validate them,
   list their numbers, auto-configure the chosen number's answer URL through the
   carrier's API, and restore the previous configuration on disconnect.
4. We bill AI minutes only. Telephony is on the client's carrier bill.

Proposed architecture:
- A new per-client carrier-connections table holding KMS-encrypted credentials
  (`lib/kms.ts`, like the Meta Page tokens).
- A per-connection webhook URL, `/voice/{carrier}/{connectionId}/answer`, so the
  signature is verified with that client's own token.
- A `TelephonyCarrier` interface: verify signature, parse the call, build the stream
  response (XML/TwiML), transfer, configure a number.
- `voice_phone_lookup` gains `carrier` and `connectionId`.

Unchanged: the `VoiceSession` engine, RAG, the `voice_leads` / `lead_events` CRM flow,
the duration and concurrency caps, human handoff.

Still ours: the recording/transcript disclosure per agent, Arabic/Malay language
checks, abuse caps.

Target markets: India, UAE/Saudi, Singapore, Malaysia, US.

Order:
1. Per-client connections + carrier interface; Plivo moved behind it.
2. Dashboard connect flow for Plivo.
3. Twilio adapter.
4. Later: outbound calls (a journey step that rings a lead).

## Scope record

feature answers: none proposed (no feature cuts offered); structure: B, Smaller arrangement
(D1, answered 2026-10-19); accepted scope: the full feature list above, delivered as two
changes. Change 1 = carrier-connections table/repo/service/routes, TelephonyCarrier
interface, Plivo moved behind it, voice_phone_lookup gains carrier + connectionId, relay
per-connection webhook, dashboard wizard. Change 2 = Twilio provider, webhook, audio
adapter and their tests. pending remedies: none.
Scope Challenge result: scope accepted as-is (MODE: FULL_REVIEW).

## Decision ledger

### R1: Prove the Plivo path on one real call before the multi-client refactor
Finding: S1, P1, confidence 9/10, backend/src/voice-relay/transports/plivo-webhook.ts:8
("PLIVO CONTRACT SHAPES ARE UNVERIFIED AGAINST LIVE TRAFFIC (no account yet)") and
backend/src/providers/plivo-call-provider.ts:7 ("UNVERIFIED AGAINST A LIVE CALL"),
reviewer: plan-eng-review (Claude).
Plan baseline: original proposal, step 1 starts with the refactor; no live-call step.
Runtime evidence: no Plivo account exists; the relay box runs the 18 Jul bundle with no
telephony (memory voice-telephony-week-sep-2026, verified 2026-10-05). Unknown: whether
the signature scheme, <Stream> envelope and transfer request work at all.
Comparison grid:
| Choice | Current | A (Prove first) | B (Refactor first) |
|---|---|---|---|
| R1 first live call | none, never happened | before the refactor, on the existing env-var path, with the owner's own Plivo account | after Change 1 ships, on the new per-connection path |
| Structure (D1) | approved: two changes | unchanged | unchanged |
Question D2:
D2 - Make one real Plivo call work before rebuilding it for many clients?
Project/branch/task: voice telephony v2, Change 1 has not started.
ELI10: All the Plivo code was written from Plivo's documentation. No real call has ever gone
through it, because we never had a Plivo account. The code itself says the message formats
are the most likely thing to be wrong, and when they are wrong the call is just silent. If we
rebuild it for many clients first and then the first call is silent, we will not know whether
the old code or the new code is at fault.
Stakes if we pick wrong: a silent first call after a 15-file change takes days to untangle,
because two unknowns are mixed together.
Recommendation: A because bringing your own account means you can be client number one today:
open a Plivo account, rent one number in your own name, and call it through the code that
already exists. That turns the biggest unknown into a known before anything is rebuilt.
Completeness: A=10/10, B=6/10
Pros / cons:
A) Prove first (recommended)
  ✅ The first real call tests only Plivo's formats, so any failure has one place to look
  ✅ Needs no new code: deploy the relay, set three env vars, call the number
  ❌ A Plivo account, one number and its ID check come before the refactor starts
B) Refactor first
  ✅ No waiting on a Plivo account before writing code
  ❌ The first real call tests old formats and new routing at once, so a silent call is hard to trace
Net: about a day of setup buys certainty that the base layer works before ~15 files sit on top of it.
Header: Live call
Options:
A) Prove first (recommended)
Before Change 1: owner opens a Plivo account, rents one number, deploys the current relay from main, sets PLIVO_AUTH_TOKEN / PLIVO_AUTH_ID / VOICE_RELAY_PUBLIC_HOST, places test calls, and fixes any protocol mismatch in plivo-webhook.ts / plivo-audio-adapter.ts. Human ~1 day plus Plivo approval time / CC ~30min of fixes. Low risk; the env-var path is deleted later by Change 1.
B) Refactor first
Start Change 1 now; the first real call happens on the new per-connection path. Human 0 extra / CC 0 extra up front, higher debugging risk at first call.

State: approved
Actual answer: A) Prove first (D2, answered 2026-10-19)
Accepted scope: a Phase 0 before Change 1. The owner opens a Plivo account, rents one number,
deploys the current relay from main, sets PLIVO_AUTH_TOKEN / PLIVO_AUTH_ID /
VOICE_RELAY_PUBLIC_HOST, and places test calls. Any protocol mismatch is fixed in
plivo-webhook.ts / plivo-audio-adapter.ts / plivo-call-provider.ts on its own branch before
Change 1 begins.
History: none

### R2: A client may only claim a number their own carrier account holds
Finding: A1, P1, confidence 9/10, backend/src/repositories/voice-phone-lookup-repository.ts:82
(`ConditionExpression: 'attribute_not_exists(phoneNumber) OR agentId = :agentId'`) and
backend/src/routes/voice-routes.ts:382 (`voiceRoutes.put('/:id/phone-number', ...)` takes a
typed number), reviewer: plan-eng-review (Claude).
Plan baseline: original proposal says the wizard lists the client's numbers, but the claim
rule is unchanged: first writer wins, any E.164 string accepted.
Runtime evidence: today one Vyostra-owned account holds every number, so the typed number
could only be one of ours. Under bring-your-own-carrier, the routing table is still global
and keyed by phoneNumber, so a typed or forged number is the first claim on it.
Comparison grid:
| Choice | Current | A (Verify with carrier) | B (Keep first-writer-wins) |
|---|---|---|---|
| R2 claim rule | any E.164 string, first writer wins | claim only a number the connection's carrier API lists; store connectionId; a takeover is allowed only after the holding connection's API confirms it no longer has the number | unchanged |
| Structure (D1) | approved: two changes | unchanged | unchanged |
| R1 Phase 0 | approved | unchanged | unchanged |
Question D3:
D3 - Only let a client claim a phone number their own carrier account actually holds?
Project/branch/task: voice telephony v2, Change 1 design.
ELI10: The table that routes a call to an agent is shared by every client and keyed by the
phone number. Today anyone can type any number into it, and the first one to claim it wins.
That was fine when every number was ours. Once clients bring their own accounts, a client
could claim a number they do not own: a typo, or a competitor's number. The real owner then
cannot connect it, and calls to it would be answered by the wrong business.
Stakes if we pick wrong: a real business's number gets blocked, or worse, a stranger's call
reaches another client's agent and lands in their CRM.
Recommendation: A because the carrier's own number list is the only proof of ownership we
have, and we already call that API to show the wizard's list, so checking it costs one call.
Completeness: A=10/10, B=3/10
Pros / cons:
A) Verify with carrier (recommended)
  ✅ A number can only be claimed through an account that really holds it
  ✅ A number a client released and someone else rented can be re-claimed after one check
  ❌ Claims need the carrier API to be up; when it is down the wizard shows an error and retries
B) Keep first-writer-wins
  ✅ No extra carrier call when a number is assigned
  ❌ Any client can squat any number, and the real owner cannot fix it themselves
Net: one API call per assignment closes a cross-client routing hole.
Header: Ownership
Options:
A) Verify with carrier (recommended)
The connect flow claims only numbers returned by that connection's list-numbers call. voice_phone_lookup rows store connectionId. A claim on a number held by another connection succeeds only after that connection's carrier API is called and confirms it no longer holds the number. PUT /:id/phone-number stops accepting a free-typed number. Human ~1 day / CC ~40min including tests. Low maintenance.
B) Keep first-writer-wins
Claims stay as today. Human 0 / CC 0. Leaves number squatting and misrouting possible across clients.

State: approved
Actual answer: A) Verify with carrier (D3, answered 2026-10-19)
Accepted scope: the connect flow claims only numbers returned by that connection's
list-numbers call; voice_phone_lookup rows store connectionId; a claim on a number held by
another connection succeeds only after that connection's carrier API confirms it no longer
holds the number; PUT /:id/phone-number stops accepting a free-typed number. Required
mechanics of the approved per-connection webhook (no separate choice): the relay answers a
call only when the lookup row's connectionId equals the connectionId in the webhook URL.
History: none

### R3: Concurrency ceiling per client, not only for the whole box
Finding: A2, P1, confidence 9/10, backend/src/voice-relay/relay.ts:172
(`if (sessions.size >= config.maxConcurrentCalls) {`) and backend/src/voice-relay/server.ts:39
(`maxConcurrentCalls: Number(process.env.VOICE_MAX_CONCURRENT_CALLS ?? '10')`), reviewer:
plan-eng-review (Claude).
Plan baseline: original proposal keeps "the duration and concurrency caps" unchanged.
Runtime evidence: one in-memory SessionRegistry counts every call on the box, browser and
phone, across all clients. Default ceiling 10.
Comparison grid:
| Choice | Current | A (Per-client cap + box cap) | B (Box cap only) |
|---|---|---|---|
| R3 per-client ceiling | none | per-client limit, default 3 concurrent phone calls, configurable per client, checked in the answer webhook and at stream time | none |
| Box-wide ceiling | 10 (env) | unchanged, still enforced | unchanged |
| R2 claim rule | approved: verify with carrier | unchanged | unchanged |
Question D4:
D4 - Limit how many calls each client can run at once, as well as the whole server?
Project/branch/task: voice telephony v2, Change 1 design.
ELI10: The relay server answers at most 10 calls at a time, counting every client and the
website voice widget together. With many clients on their own numbers, one client's busy
hour, or a spam caller dialling one number again and again, can use all 10 slots. Every other
client's phone then says "all lines are busy", and their website voice stops working too.
Stakes if we pick wrong: one client's traffic silently takes the phone and website voice
agent down for every other client.
Recommendation: A because a per-client count is a few lines on the registry that already
exists, and it is the only thing that keeps one tenant from starving the rest on a single box.
Completeness: A=9/10, B=4/10
Pros / cons:
A) Per-client cap + box cap (recommended)
  ✅ A spam run or busy hour at one client cannot block calls for anyone else
  ✅ The per-client number doubles as a plan limit later (more lines on higher plans)
  ❌ A client with a real rush hits their own limit and callers hear the busy line sooner
B) Box cap only
  ✅ Nothing new to build or configure
  ❌ Any single client can fill all 10 slots, including the website widget's
Net: a small registry change turns one shared failure into a per-client limit.
Header: Call limit
Options:
A) Per-client cap + box cap (recommended)
SessionRegistry counts sessions per clientId. The answer webhook and the stream connect check the client's limit (default 3 concurrent phone calls, stored per client, changeable without a deploy) before the box-wide limit. Over the limit, the caller hears the existing busy line. Human ~half a day / CC ~25min with tests. Low maintenance.
B) Box cap only
Keep the single box-wide limit of 10. Human 0 / CC 0. One client can exhaust capacity for all.

State: approved
Actual answer: A) Per-client cap + box cap (D4, answered 2026-10-20)
Accepted scope: SessionRegistry counts sessions per clientId; the answer webhook and the
stream connect check the client's limit (default 3 concurrent phone calls, stored per
client, changeable without a deploy) before the box-wide limit of 10; over the limit the
caller hears the existing busy line.
History: none

Required mechanics recorded without a question (A3, P1, confidence 8/10): the relay must
decrypt each client's carrier credentials. backend/src/lib/kms.ts:18 reads
`requireEnv('WHATSAPP_KMS_KEY_ID')`, and docs/INFRASTRUCTURE.md:191 says the relay role
carries `AmazonDynamoDBReadOnlyAccess` plus narrow PutItem grants, with no KMS Decrypt.
Change 1 therefore includes: kms:Decrypt on that key in scripts/provision-voice-relay-iam.sh,
WHATSAPP_KMS_KEY_ID in the box's .env and in docs/INFRASTRUCTURE.md, and the relay's
PLIVO_AUTH_TOKEN / PLIVO_AUTH_ID / VOICE_RELAY_PUBLIC_HOST fail-closed check replaced by a
per-connection check (VOICE_RELAY_PUBLIC_HOST stays). Without the grant every call fails
closed at decrypt.

### R4: Twilio stream authentication from the start message, not the URL
Finding: A4, P2, confidence 6/10 (medium, verify), backend/src/voice-relay/relay.ts
`authenticate(ws, url, config)` reads `url.searchParams.get('token')` at connect time, and
relay.ts `buildPlivoStreamUrl` puts the token, from, to and callUuid in the stream URL's
query string. Twilio documents custom values for a <Stream> as <Parameter> children that
arrive in the `start` message's `customParameters`; whether a query string on the
<Connect><Stream> url survives was not confirmed by search (twilio.com/docs/voice/twiml/stream).
Reviewer: plan-eng-review (Claude).
Plan baseline: original proposal, "Twilio adapter" in Change 2; authentication path not stated.
Runtime evidence: unknown; no Twilio account, no live stream.
Comparison grid:
| Choice | Current | A (Auth on start message) | B (Query-string token) |
|---|---|---|---|
| R4 Twilio stream auth | not designed | token, from, to, callSid sent as <Parameter>; adapter holds the socket unauthenticated until `start`, then validates; closes if `start` is absent within 5 seconds or invalid | same URL query string as Plivo |
| Plivo stream auth | URL query string at connect | unchanged | unchanged |
| R3 per-client cap | approved | unchanged | unchanged |
Question D5:
D5 - For Twilio, check the caller's pass from the first stream message instead of the web address?
Project/branch/task: voice telephony v2, Change 2 (Twilio) design.
ELI10: When a call's audio connects to us, the relay checks a short-lived pass to prove the
call is real. For Plivo that pass rides in the web address. Twilio's documentation tells you
to send extra values inside the first message of the audio stream instead, and it is not
clear that a pass in the web address survives. If it does not, every Twilio call would
connect and then be hung up, with nothing obvious in the logs.
Stakes if we pick wrong: every Twilio call drops at connect, and it looks like a Twilio fault.
Recommendation: A because the start-message route is the one Twilio documents, and holding
the socket for one message before checking it costs nothing a caller can notice.
Completeness: A=9/10, B=5/10
Pros / cons:
A) Auth on start message (recommended)
  ✅ Uses Twilio's documented way to pass values, so it does not depend on an undocumented behaviour
  ✅ The from and to numbers ride inside the same message, so a forged web address carries nothing
  ❌ The socket is open for up to 5 seconds before it is checked, so that window needs its own test
B) Query-string token
  ✅ Same code path as Plivo, nothing new in the connect logic
  ❌ If Twilio drops the query string, every call fails at connect until someone notices
Net: one small change to when the check happens removes the most likely silent failure in Change 2.
Header: Twilio auth
Options:
A) Auth on start message (recommended)
The Twilio answer TwiML sends token, from, to and callSid as <Parameter> elements. The relay accepts a Twilio stream socket, waits for the start message (5-second limit), validates the token from customParameters, then builds the session; it closes the socket on a missing, late or invalid start. Plivo keeps URL auth. Human ~half a day / CC ~30min with tests. Low maintenance.
B) Query-string token
Twilio uses the same URL query-string auth as Plivo, checked at connect. Human 0 extra / CC 0 extra. Depends on unconfirmed Twilio behaviour.

State: approved
Actual answer: A) Auth on start message (D5, answered 2026-10-20)
Accepted scope: Twilio answer TwiML sends token, from, to and callSid as <Parameter>
elements; the relay accepts a Twilio stream socket, waits for the start message (5-second
limit), validates the token from customParameters, then builds the session; it closes the
socket on a missing, late or invalid start. Plivo keeps URL auth.
History: none

### R5: Tell the client when their carrier credentials stop working
Finding: C1, P1, confidence 8/10, backend/src/voice-relay/relay.ts:146-149
(`if (!verifyPlivoSignature(requestUrl, nonce, signature, config.plivoAuthToken)) {` ...
`console.warn('[VoiceRelay] Rejected Plivo webhook with an invalid signature')` ...
`res.writeHead(403)`), reviewer: plan-eng-review (Claude).
Plan baseline: original proposal stores credentials and verifies with them; no state for
"these credentials no longer work".
Runtime evidence: today a bad signature is a log line on the box and a 403 to the carrier.
With client-owned accounts, a client who rotates their Auth Token in Plivo or Twilio makes
every one of their calls fail this check. Nobody reads the box's logs, and the client is not told.
Comparison grid:
| Choice | Current | A (Detect + alert) | B (Log only) |
|---|---|---|---|
| R5 broken-credential handling | console.warn + 403 | connection gets status `healthy` / `credentials_invalid`; 3 signature failures in 10 minutes trigger one carrier API check with the stored credentials, and only a 401 from the carrier flips the status; dashboard banner plus one email to the client per flip; a daily check re-validates every connection and clears the status when fixed | console.warn + 403 |
| R4 Twilio auth | approved | unchanged | unchanged |
Question D6:
D6 - Warn the client when their phone account details stop working?
Project/branch/task: voice telephony v2, Change 1 design.
ELI10: We check every incoming call with the secret token from the client's Plivo or Twilio
account. If the client changes that token in their carrier dashboard, which people do for
security, every call they get starts failing our check. Today that failure is a line in a log
file on our server that nobody reads. Their phone just stops being answered, and they find out
from an angry customer days later.
Stakes if we pick wrong: a client's phone agent dies quietly after an ordinary security change,
and they blame Vyostra.
Recommendation: A because the failure is certain to happen eventually, and a status plus one
email is small next to a client losing calls for days.
Completeness: A=9/10, B=3/10
Pros / cons:
A) Detect + alert (recommended)
  ✅ The client sees "reconnect your Plivo account" in the dashboard and in an email within minutes
  ✅ A daily check catches broken credentials even on a day with no calls
  ✅ Fake requests cannot raise a false alarm: only the carrier itself saying 401 flips the status
  ❌ One more scheduled job and one email template to build and keep working
B) Log only
  ✅ Nothing new to build
  ❌ The phone agent goes silent with no signal to anyone until a customer complains
Net: a status field, a threshold and one email turn a silent outage into a fix-it prompt.
Header: Broken creds
Options:
A) Detect + alert (recommended)
Each connection carries status healthy / credentials_invalid. 3 signature failures within 10 minutes on that connection's URL trigger one carrier API check with the stored credentials; the status flips only when the carrier answers 401 (to that check or any other carrier call). The dashboard shows a reconnect banner and the client gets one email (SES, already used) per flip. A daily scheduled check re-validates every connection through its carrier API and clears the status when it passes. Human ~1 day / CC ~45min with tests. Low maintenance.
B) Log only
Keep console.warn + 403 per bad signature. Human 0 / CC 0. Credential rotation silently stops a client's calls.

State: approved
Actual answer: A) Detect + alert (D6, answered 2026-10-20)
Accepted scope: each connection carries status healthy / credentials_invalid; 3 signature
failures within 10 minutes on a connection's URL trigger one carrier API check with the
stored credentials; the status flips only on a carrier 401; dashboard reconnect banner and
one SES email per flip; a daily scheduled check re-validates every connection and clears the
status when it passes.
History: none

Required mechanics recorded without a question (C2, P2, confidence 8/10), part of the
approved "restore on disconnect" behaviour: when the wizard points a number at us it first
stores that number's previous configuration (Plivo app_id / Twilio VoiceUrl +
VoiceApplicationSid) on the connection, and the wizard says plainly that the number's current
answering setup will be replaced. Disconnect writes the stored configuration back. If the
carrier refuses (credentials_invalid), disconnect still removes our rows and shows the client
the exact setting to restore by hand, instead of failing.

### R6: Regression contract for the existing answer-webhook behaviour
Finding: T1, CRITICAL regression risk, confidence 9/10, backend/src/voice-relay/relay.test.ts:238-374
(`postAnswer({ To: '+912240000000', ... })` cases for signature, capacity, lookup failure,
unclaimed number, transfer-token scope), reviewer: plan-eng-review (Claude).
Plan baseline: original proposal moves the Plivo code behind an interface and changes the
route and the token source; no statement about which tested behaviour must survive.
Runtime evidence: relay.test.ts (769 lines) pins today's behaviour for /plivo/answer and
/plivo/transfer against one env-var account.
Comparison grid:
| Choice | Current | A (Shared carrier contract suite) | B (Port Plivo cases only) |
|---|---|---|---|
| Behaviour preserved | today's relay.test.ts cases | every case: bad signature 403, oversized body 413, no destination -> spoken reject, at box capacity -> busy line, lookup throws -> "unable to take your call", unclaimed -> "not in service", transfer token scoped to its number, browser socket path unchanged | same list |
| Intentional changes | n/a | route becomes /voice/{carrier}/{connectionId}/answer; signature checked with the connection's token; unknown or deleted connectionId -> spoken reject; lookup row's connectionId must match the URL's; env-var telephony gate removed | same list |
| How it is covered | Plivo-only cases | one table-driven contract suite parameterised by carrier, run for Plivo in Change 1 and for Twilio in Change 2 with the same assertions | Plivo cases ported in place; Twilio gets its own separate tests in Change 2 |
| R5 creds alert | approved | unchanged | unchanged |
Question D7:
D7 - How do we prove the calls that work today still work after the rebuild?
Project/branch/task: voice telephony v2, Change 1 tests.
ELI10: The current tests check the important refusals: a fake request is rejected, a full
server says the lines are busy, an unknown number says it is not in service. The rebuild moves
all of that behind a new carrier layer and new web addresses. We keep every one of those
checks; the question is how. Either one shared test list that every carrier must pass, or the
Plivo tests moved over as they are, with Twilio getting its own later.
Stakes if we pick wrong: with separate tests, Twilio can quietly skip a safety check Plivo has,
such as the busy line or the fake-request rejection.
Recommendation: A because the safety rules are the same for every carrier, and one shared list
makes a missing rule fail the build instead of relying on someone remembering it.
Completeness: A=10/10, B=7/10
Pros / cons:
A) Shared carrier contract suite (recommended)
  ✅ Twilio, and every carrier after it, must pass the same refusals before it can ship
  ✅ Adding a carrier means adding one row of test fixtures, not rewriting the tests
  ❌ The fixtures need a small fake for each carrier's signing scheme, which is extra test code
B) Port Plivo cases only
  ✅ Least test churn: the existing cases move with small edits
  ❌ Twilio's checks are written separately and can miss one of the refusals
Net: both keep today's behaviour; A also makes it impossible for a new carrier to ship without it.
Header: Regression
Options:
A) Shared carrier contract suite (recommended)
relay.test.ts cases become one table-driven suite parameterised by carrier (signing helper, request builder, expected response format). Every case listed above, plus the intentional changes, runs for Plivo in Change 1 and for Twilio in Change 2. Human ~1 day / CC ~45min. Low maintenance once built.
B) Port Plivo cases only
Existing relay.test.ts cases are edited in place for the new route and token source; Twilio writes its own tests in Change 2. Human ~half a day / CC ~25min. Twilio coverage depends on whoever writes it.

State: approved
Actual answer: A) Shared carrier contract suite (D7, answered 2026-10-20)
Accepted scope: relay.test.ts answer/transfer cases become one table-driven suite
parameterised by carrier (signing helper, request builder, expected response format). It
asserts every preserved behaviour and every intentional change listed in the grid, runs for
Plivo in Change 1, and runs unchanged for Twilio in Change 2.
History: none

### R7: Cache decrypted carrier credentials on the relay
Finding: P1-perf, P2, confidence 7/10, backend/src/lib/kms.ts:36-43 (`new DecryptCommand({
KeyId: keyId, CiphertextBlob: ... })`, one network call per decrypt) on the answer-webhook
path in backend/src/voice-relay/relay.ts `handlePlivoAnswer`, reviewer: plan-eng-review (Claude).
Plan baseline: original proposal stores KMS-encrypted credentials; how often the relay
decrypts is not stated.
Runtime evidence: KMS latency from the box is unmeasured [re-measure before gate]; a
Decrypt call is typically tens of milliseconds [estimated]. Each answered call would also
decrypt again for a transfer. Call volume: unknown.
Comparison grid:
| Choice | Current | A (5-minute in-memory cache) | B (Decrypt every time) |
|---|---|---|---|
| R7 credential decrypt | n/a (env var) | decrypted value kept in process memory per connectionId for 5 minutes; a signature failure or carrier 401 seen by the relay drops the entry at once; a dashboard update lands within 5 minutes; a deleted connection stops calls at once because the phone lookup (never cached) finds no row | one KMS Decrypt per answer webhook and per transfer |
| R5 creds alert | approved | unchanged | unchanged |
Question D8:
D8 - Keep a client's unlocked carrier key in memory for 5 minutes instead of unlocking it on every call?
Project/branch/task: voice telephony v2, Change 1 performance.
ELI10: Client carrier secrets are stored locked (encrypted). To check an incoming call, the
relay has to ask AWS to unlock the secret, which is a network round trip while the caller
waits for the first ring to be answered. Keeping the unlocked secret in memory for a few
minutes means a busy number pays that cost once, not on every call.
Stakes if we pick wrong: with no cache, every call waits on AWS and an AWS hiccup turns into
dropped calls; with a cache that never clears, a client who rotates their token keeps failing
until the box restarts.
Recommendation: A because a short, clearable cache removes the AWS round trip from almost
every call, and dropping the entry on the first failed check keeps a rotated token from sticking.
Completeness: A=9/10, B=7/10
Pros / cons:
A) 5-minute in-memory cache (recommended)
  ✅ Most calls skip the AWS round trip, so answering is faster and survives a brief KMS blip
  ✅ A disconnected number stops at once, and a failed check drops the cached key straight away
  ❌ An unlocked secret sits in the relay's memory for up to 5 minutes, and a re-pasted token takes up to 5 minutes to apply
B) Decrypt every time
  ✅ No unlocked secret is ever kept in memory
  ❌ Every call and every transfer waits on AWS, and a KMS outage fails every call
Net: a 5-minute, clearable cache trades a short in-memory secret for faster and sturdier call answering.
Header: Key cache
Options:
A) 5-minute in-memory cache (recommended)
The relay keeps decrypted credentials per connectionId for 5 minutes in a Map. A signature failure or carrier 401 on the relay drops the entry at once; a dashboard update lands within 5 minutes on the next cache miss; a deleted connection stops calls at once because the phone lookup is never cached. Human ~2h / CC ~15min with tests. Low maintenance.
B) Decrypt every time
One KMS Decrypt per answer webhook and per transfer. Human 0 / CC 0. Slower, and KMS availability becomes call availability.

State: approved
Actual answer: A) 5-minute in-memory cache (D8, answered 2026-10-20)
Accepted scope: the relay keeps decrypted credentials per connectionId for 5 minutes in a
Map; a signature failure or carrier 401 on the relay drops the entry at once; a dashboard
update lands within 5 minutes on the next cache miss; the phone lookup is never cached, so a
deleted connection stops calls at once.
History: none

## Outside voice (Claude subagent, native fallback)

Codex was unavailable (MODEL_UNUSABLE: gpt-6-astra not usable on this account). A Plan
subagent with no view of this conversation reviewed the plan and returned 12 findings
(OV1-OV12) within the time limit. Dispositions are recorded per row below.

Recorded without a question (factual corrections and required mechanics of approved behaviour):
- OV4b (High, confidence 8/10, plivo-webhook.ts / plivo-call-provider.ts): a Plivo number
  attaches to an Application, not to a bare answer URL; a Twilio number may point at a
  voice_url, a TwiML App, Studio or a SIP trunk. "Configure number" is therefore modelled per
  carrier, and the wizard creates Vyostra's OWN Application (Plivo) per connection and never
  edits an existing Application that other numbers may share.
- OV5 (Medium): disconnect restores the previous configuration only when the number still
  points at our Application/URL; otherwise it leaves the number alone and shows manual
  instructions. Refines the approved restore behaviour (C2).
- OV10 (Low, confidence 6/10, plivo-webhook.ts:15-26): the V3 signature may also cover the
  POST params; Phase 0 (D2) settles it, and the contract suite (D7) encodes the confirmed
  scheme rather than today's guess.
- OV11 (Low, confidence 8/10, docs/INFRASTRUCTURE.md:191): D6's status flip needs a write the
  relay role lacks; Change 1 adds a narrow UpdateItem grant on carrier_connections to the relay
  role (same pattern as voice-call-logs-write). The per-client cap (D4) is per relay process;
  noted, valid while there is one box.
- OV12 (Low): Phase 0's number (a voice_phone_lookup row with no connectionId) is migrated to a
  connection as the first step of Change 1; Plivo approval time goes on the schedule.
- OV3 (High): onboarding cost of client-owned accounts. The owner decided this explicitly on
  2026-10-19 with the guided wizard and forward-on-busy as mitigations, and a managed number as
  the later add-on. Recorded as a remaining disagreement, not reopened.

### R8: Scope the stream token to the call, before Change 1
Finding: OV1, Critical, confidence 9/10, reviewer: Claude subagent, verified by parent.
backend/src/routes/voice-routes.ts:179 (`voiceRoutes.get('/token', async (c) => {`, public) mints
`generateToken(agentId, process.env.VOICE_AUTH_SECRET ?? '')` with no scope; relay.ts
`authenticate` calls `validateToken(token, config.authSecret)` with no scope; relay.ts
handleConnection reads `from`, `to`, `callUuid` from the unsigned query string and passes
`callUuid` into `buildTransferCapability`, which calls `transferCall` with account credentials.
Plan baseline: D5 keeps Plivo URL-query auth unchanged.
Runtime evidence: telephony is off in production (no PLIVO_AUTH_TOKEN on the box), so this is
not exploitable today. Once any number is live, anyone can mint a widget token and open
/plivo/stream with a chosen from/to/callUuid: fake CRM leads, paid OpenAI minutes, and a
transfer request against an arbitrary callUuid. Under BYOC that request runs on the client's
own carrier credentials.
Comparison grid:
| Choice | Current | A (Apply) | B (Keep) | C (Investigate) | D (Defer) |
|---|---|---|---|---|---|
| R8 stream token | agentId only, unscoped, public mint works | stream token minted only by the answer webhook, scoped to connectionId + callUuid + from + to; relay validates with that scope; widget tokens open browser sessions only; lands in Phase 0's branch, before any number goes live | unchanged | bounded half-day check of exploitability, no change | unchanged, tracked as a TODO |
| D5 Twilio auth | approved | unchanged (customParameters carry the scoped token) | unchanged | unchanged | unchanged |
Question D9:
D9 - Lock the phone audio connection so only the call we answered can open it?
Project/branch/task: voice telephony v2, before Phase 0's number goes live.
ELI10: The independent reviewer found a real hole, and I checked it in the code. The pass that
opens a phone audio connection is the same pass the website widget gets, and anyone can get
one from a public address. The caller number, the dialled number and the call ID ride
alongside it unsigned. So someone could open a fake "phone call" with made-up numbers, creating
fake leads and running up AI cost, and could point our transfer feature at a call ID of their
choosing. With client-owned accounts, that transfer runs on the client's own carrier login.
Stakes if we pick wrong: the first live number opens a door for fake leads and for moving a
client's real calls with their own credentials.
Recommendation: A because the fix uses the scoped pass the transfer feature already uses, and
it must land before any real number goes live, which is Phase 0.
Completeness: A=10/10, B=2/10, C=5/10, D=3/10
Pros / cons:
A) Apply (recommended)
  ✅ Only the answer step can mint a phone pass, and it is bound to that one call and its numbers
  ✅ Reuses the existing scope support in voice-token.ts, so the change is small
  ❌ Phase 0 gains one more change before the first test call
B) Keep
  ✅ No change to the token code
  ❌ Fake calls, fake leads and transfer requests on a client's account stay possible
C) Investigate
  ✅ Half a day to confirm how far the hole reaches before changing code
  ❌ The answer is already visible in the code; this delays a fix that is needed anyway
D) Defer
  ✅ Phase 0 starts slightly sooner
  ❌ The first live number goes out with the hole open
Net: a small, known fix closes the one critical hole before any number is exposed.
Header: Stream auth
Options:
A) Apply (recommended)
Answer webhook mints a stream token scoped to connectionId|callUuid|from|to (voice-token.ts scope support). The relay validates the telephony stream with that scope and reads from/to/callUuid only from what the token covers. Widget tokens (no scope) open browser sessions only. Lands on Phase 0's branch with tests. Human ~half a day / CC ~30min.
B) Keep
Stream auth stays agentId-only. Human 0 / CC 0. Hole remains.
C) Investigate
Half-day check of exploitability and blast radius; no code change; remedy stays pending.
D) Defer
Leave unchanged now and add a TODO; remedy stays unresolved.

State: approved
Actual answer: A) Apply (D9, answered 2026-10-20)
Accepted scope: the answer webhook mints a stream token scoped to connectionId|callUuid|from|to
(dialled number in place of connectionId during Phase 0, which has no connections); the relay
validates telephony streams with that scope and reads from/to/callUuid only from what the
token covers; unscoped widget tokens open browser sessions only. Lands on Phase 0's branch with
tests, before any number goes live.
History: none

### R9: Which carrier is second, given the target markets
Finding: OV2, High, confidence 8/10, reviewer: Claude subagent; consistent with the parent's
own 2026-10-19 search (Plivo UAE local numbers: inbound "Not Supported", toll-free only at
$0.225/min; Twilio UAE: toll-free +971800 only; Saudi: toll-free only; Plivo SG/MY rentable on
Enterprise with documents). Correction on record: in conversation on 2026-10-19 the parent said
a UAE client "can integrate their existing Plivo"; that is true only for toll-free or
SIP-trunk setups, not ordinary local UAE numbers.
Plan baseline: owner decision, Plivo first, Twilio second, Telnyx/Exotel/Vonage later.
Runtime evidence: none in code; market facts from vendor pages and secondary blogs, not
confirmed with sales.
Comparison grid:
| Choice | Current | A (Apply) | B (Keep) | C (Investigate) | D (Defer) |
|---|---|---|---|---|---|
| R9 second carrier | Twilio, decided 2026-10-19 | chosen now from a country map: likely Telnyx or Exotel instead of Twilio | Twilio | a bounded 1-day carrier map (IN, AE, SA, SG, MY, US: which carrier gives inbound-capable numbers or SIP, with sources) BEFORE Change 2 starts; the owner then confirms or changes Twilio | Twilio, revisit later |
| Market claims | site says on-page voice only | unchanged until each market has a verified carrier path | unchanged | unchanged until the map lands | unchanged |
| Change 1 (Plivo) | approved | unchanged | unchanged | unchanged | unchanged |
Question D10:
D10 - Check which carrier actually works in each target country before building the second one?
Project/branch/task: voice telephony v2, before Change 2.
ELI10: The reviewer pointed out something I got partly wrong yesterday. In the UAE and Saudi
Arabia, ordinary local numbers from Plivo or Twilio cannot receive calls; only toll-free numbers
or a link through the local carrier work. In India many businesses use Exotel rather than
Plivo. So "Plivo first, Twilio second" may mostly serve the US and Singapore. A one-day check,
country by country, would tell us whether Twilio, Telnyx or Exotel should be the second carrier.
Plivo (Change 1) is not affected either way.
Stakes if we pick wrong: we spend Change 2 on a carrier that our Gulf and Indian clients cannot use.
Recommendation: C because one day of research, before any Twilio code exists, protects the whole
second change, and Change 1 can proceed meanwhile.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Apply
  ✅ The second carrier is picked right now from what we already know about each market
  ❌ Picks from blog-grade facts that nobody has confirmed with the carriers
B) Keep
  ✅ Twilio is the best-documented carrier and the US is its home market
  ❌ May leave UAE, Saudi and much of India without a working path
C) Investigate (recommended)
  ✅ A sourced country-by-carrier table before Change 2, with Change 1 unaffected
  ✅ The same table decides what the site may honestly claim per market
  ❌ One day of research, and Change 2 waits on its result
D) Defer
  ✅ Nothing to do now
  ❌ The question comes back later, after more is built around Twilio's assumptions
Net: one day of checking aims the second carrier at the markets you named.
Header: Carrier 2
Options:
A) Apply
Pick the second carrier now (Telnyx or Exotel instead of Twilio) from current knowledge. Human ~1h / CC ~10min. Higher risk of a wrong pick.
B) Keep
Twilio stays second as decided. Human 0 / CC 0.
C) Investigate (recommended)
Before Change 2: a 1-day sourced table for IN, AE, SA, SG, MY, US (which carrier offers inbound-capable numbers or SIP into a stream we can take, with cost and documents), saved to docs/voice-carrier-country-map.md. The owner then confirms Twilio or picks another. Change 1 proceeds meanwhile. Remedy (the choice of carrier) stays pending until then. Human ~1 day / CC ~1h.
D) Defer
Keep Twilio for now and revisit later; nothing changes now.

State: approved
Actual answer: A) Apply (D10, answered 2026-10-20), carrier settled by D11 = B) Exotel.
Accepted scope: Twilio is no longer the second carrier. Change 2 is Exotel. D5 (Twilio
start-message auth) and the Twilio half of D7 stay approved for whenever Twilio is built; they
are not part of Change 2.
History: D10's option A named "Telnyx or Exotel"; D11 resolved it.

### R9a: Telnyx or Exotel as the second carrier
Finding: OV2 follow-up to D10, reviewer: plan-eng-review (Claude).
Plan baseline: D10 = A, second carrier picked now, not Twilio.
Runtime evidence: none in code. From the 2026-10-19 searches: Telnyx sells local UAE +971
numbers (trade licence + Emirates ID, ~$150/month, per menugo.al, unconfirmed on Telnyx's own
page) and documents per-country requirements for international numbers; it offers SIP
trunking, so a Gulf client's e&/du/STC trunk can terminate on it. Exotel is the incumbent in
India and also sells in Southeast Asia and the Middle East [unverified]; its pricing is
sales-gated (docs/voice-calling-cost-and-pricing-plan.md:16) and its streaming product
(AgentStream) has a documented 10-second bot-response timeout and 60-minute session cap
(same doc, line 157).
Comparison grid:
| Choice | Current | A (Telnyx) | B (Exotel) |
|---|---|---|---|
| Second carrier | pending (D10: not Twilio) | Telnyx: self-serve API, global numbers, SIP trunking for Gulf clients' own carrier lines | Exotel: India-first, sales-gated pricing, AgentStream limits |
| Change 1 (Plivo) | approved | unchanged | unchanged |
| D5/D7 Twilio parts | approved for later | unchanged, later | unchanged, later |
Question D11:
D11 - Second carrier: Telnyx or Exotel?
Project/branch/task: voice telephony v2, Change 2 carrier.
ELI10: You chose to pick the second carrier now instead of Twilio. The two candidates suit
different markets. Telnyx is global and self-serve, and it can take calls from a Gulf client's
own UAE or Saudi phone line through a SIP link. Exotel is what many Indian businesses already
use, but you need a sales call to get pricing, and its audio streaming has time limits. Plivo
already covers India in Change 1.
Stakes if we pick wrong: Change 2 builds a carrier that does not reach the markets you are
targeting next.
Recommendation: A because India is already served by Plivo in Change 1, and Telnyx reaches the
Gulf, Singapore, Malaysia and the US through one self-serve API we can test without a sales call.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Telnyx (recommended)
  ✅ Self-serve signup and API, so we can build and test it without waiting on sales
  ✅ SIP trunking lets a UAE or Saudi client connect their own licensed carrier line
  ❌ Less known among Indian SMBs, and its UAE number terms come from a third-party blog
B) Exotel
  ✅ Many Indian businesses already have an Exotel account and number
  ❌ Mostly overlaps with Plivo's India coverage, and pricing and limits need a sales call
Net: Telnyx widens reach to the Gulf and SEA; Exotel deepens India, which Plivo already covers.
Header: Carrier 2
Options:
A) Telnyx (recommended)
Change 2 builds the Telnyx carrier: provider (number listing, configure/restore), answer webhook with Telnyx signature verification, media-stream adapter, and the contract suite rows. Human ~2 days / CC ~1.5h. Telnyx's message shapes are verified on a live call before merge.
B) Exotel
Change 2 builds the Exotel carrier on AgentStream: provider, webhook, adapter, contract rows. Needs an Exotel sales call for an account and limits first. Human ~2-3 days plus sales lead time / CC ~1.5h.

State: approved
Actual answer: B) Exotel (D11, answered 2026-10-20)
Accepted scope: Change 2 builds the Exotel carrier on AgentStream: provider (number listing,
configure/restore), answer/stream handling with Exotel's own authentication, the audio adapter,
and Exotel rows in the D7 contract suite. Dependency: an Exotel sales call for an account, rates,
and confirmation of the AgentStream limits (10-second bot-response timeout, 60-minute session
cap) before Change 2 starts. Message shapes verified on a live Exotel call before merge.
History: none

### R10: Accept only sub-account credentials, and say so in the wizard
Finding: OV4a, High, confidence 8/10, reviewer: Claude subagent, verified by parent.
backend/src/voice-relay/transports/plivo-webhook.ts:18-26 (`verifyPlivoSignature(url, nonce,
signatureHeader, authToken)`) needs the Auth Token that signs the account's webhooks, so a
restricted API key cannot replace it; the same credential can rent numbers and place calls.
Plan baseline: original proposal stores "the client's credentials", kind unspecified.
Runtime evidence: Plivo supports sub-accounts with their own Auth ID/Token [documented by Plivo,
not checked live]; Exotel credential model: unknown until the sales call.
Comparison grid:
| Choice | Current | A (Apply) | B (Keep) | C (Investigate) | D (Defer) |
|---|---|---|---|---|---|
| R10 credential kind | unspecified | Plivo: the wizard asks for a sub-account's Auth ID/Token and refuses a main-account Auth ID (Plivo main IDs start "MA", sub-accounts "SA"); the wizard explains why; Exotel: least-privilege credential confirmed in the sales call | any account credential accepted | bounded check of each carrier's sub-account model, no change yet | unchanged, TODO |
| D9 scoped stream token | approved | unchanged | unchanged | unchanged | unchanged |
Question D12:
D12 - Only accept a carrier sub-account's keys, not the client's main account keys?
Project/branch/task: voice telephony v2, Change 1 wizard and storage.
ELI10: To check incoming calls we must store the client's carrier secret token. With Plivo, the
main account token can also buy numbers and place calls, so if our database were ever breached,
an attacker could run up a client's phone bill. Plivo lets a client create a sub-account with
its own token, used only for the numbers they connect to us. Asking for that limits what a leak
could do. (A sub-account can still place calls itself, so this narrows a leak, it does not remove it.)
Stakes if we pick wrong: a breach of our database becomes a breach of every client's full phone account.
Recommendation: A because Plivo sub-account IDs are recognisable (SA... versus MA...), so we can
enforce this with one check and a sentence of explanation in the wizard.
Completeness: A=9/10, B=4/10, C=6/10, D=4/10
Pros / cons:
A) Apply (recommended)
  ✅ A leaked key reaches only the sub-account, not the client's whole carrier account and its other numbers
  ✅ Easy to enforce for Plivo: main and sub-account IDs look different
  ❌ One more setup step for the client: create a sub-account and move the number into it
B) Keep
  ✅ Simplest setup: paste the main account keys
  ❌ We hold keys that can buy numbers and place calls on every client's account
C) Investigate
  ✅ Confirms how each carrier's sub-accounts behave before committing the wizard
  ❌ Delays the decision; the Plivo answer is already documented
D) Defer
  ✅ Change 1 setup stays shorter
  ❌ Clients connect main accounts now, and moving them later means asking every client again
Net: one extra setup step caps the damage of a breach at the numbers a client gave us.
Header: Sub-accounts
Options:
A) Apply (recommended)
The Plivo wizard asks for a sub-account Auth ID/Token, rejects a main-account ID with an explanation and a link to Plivo's sub-account page, and lists only that sub-account's numbers. For Exotel, the least-privilege credential is confirmed in the sales call and enforced the same way. Human ~half a day / CC ~20min with tests.
B) Keep
Accept whatever credentials the client pastes. Human 0 / CC 0.
C) Investigate
Bounded check of Plivo and Exotel sub-account models; no change; remedy pending.
D) Defer
Accept main-account credentials now; TODO to require sub-accounts later.

State: approved
Actual answer: A) Apply (D12, answered 2026-10-20)
Accepted scope: the Plivo wizard asks for a sub-account Auth ID/Token, rejects a main-account ID
with an explanation and a link to Plivo's sub-account page, and lists only that sub-account's
numbers. For Exotel, the least-privilege credential is confirmed in the sales call and enforced
the same way.
History: none

### R11: Number takeover when the old holder's credentials are dead (reopens D3)
Finding: OV6, Medium, confidence 8/10, reviewer: Claude subagent. Reopens R2 (D3) for a concrete
new risk: D3 allows a takeover only after the holding connection's carrier confirms release, and
a holder in credentials_invalid (D6) can never confirm anything.
Plan baseline: D3 = A (approved 2026-10-19), takeover only after the holder's carrier confirms.
Runtime evidence: none; proposed behaviour.
Comparison grid:
| Choice | Current | A (Apply) | B (Keep) | C (Investigate) | D (Defer) |
|---|---|---|---|---|---|
| R11 takeover rule | D3: holder's carrier must confirm release | as D3, plus: when the holder is credentials_invalid, the new connection's carrier listing the number is enough; the old row is released and its owner gets one email saying the number moved | D3 unchanged; a stuck number needs us to fix it by hand | bounded check, no change | unchanged, TODO |
| R2 / D3 rest | approved | unchanged | unchanged | unchanged | unchanged |
| R5 / D6 status | approved | unchanged | unchanged | unchanged | unchanged |
Question D13:
D13 - Let a client take over a number when its previous holder's connection is broken?
Project/branch/task: voice telephony v2, Change 1 number claims.
ELI10: Earlier you approved: to take over a number another client had claimed, we ask that other
client's carrier whether they still hold it. But if their saved keys stopped working, we cannot ask,
so the number would be stuck forever, even though the new client's own account proves they now hold
it. This adds one rule: if the old connection is broken, the new account listing the number is proof enough.
Stakes if we pick wrong: a business that bought a released number cannot connect it, and only a
manual fix by us unblocks them.
Recommendation: A because the new account's own listing is current proof of ownership, and the old
holder is told by email, so nothing moves silently.
Completeness: A=9/10, B=5/10, C=5/10, D=4/10
Pros / cons:
A) Apply (recommended)
  ✅ No number can get stuck behind a dead connection
  ✅ The previous holder gets an email, so the move is never silent
  ❌ A client whose keys broke briefly could lose a number they still hold, if someone else's account also lists it
B) Keep
  ✅ The strictest rule: nothing moves without the holder's carrier saying so
  ❌ Numbers behind broken connections need us to step in by hand
C) Investigate
  ✅ Bounded look at how often numbers change hands between carrier accounts
  ❌ The deadlock exists regardless of how often it happens
D) Defer
  ✅ Nothing extra in Change 1
  ❌ The first stuck number becomes a support ticket with no tool to fix it
Net: one extra rule turns a permanent deadlock into an emailed handover.
Header: Takeover
Options:
A) Apply (recommended)
Keep D3, and add: if the holding connection is credentials_invalid, a claim succeeds when the new connection's carrier lists the number; the old row is released and its owner emailed. Human ~2h / CC ~15min with tests.
B) Keep
D3 unchanged; a number behind a broken connection stays stuck until fixed by hand. Human 0 / CC 0.
C) Investigate
Bounded check; no change; remedy pending.
D) Defer
D3 unchanged now; TODO for later.

State: approved
Actual answer: A) Apply (D13, answered 2026-10-20)
Accepted scope: D3 stays, plus: if the holding connection is credentials_invalid, a claim
succeeds when the new connection's carrier lists the number; the old row is released and its
owner gets one email saying the number moved.
History: R2 / D3 approved A on 2026-10-19; reopened because D6 created a state D3 did not anticipate.

### R12: Signature failures must not drop the key cache (reopens D8 and the D6 trigger)
Finding: OV7, Medium, confidence 8/10, reviewer: Claude subagent. Reopens R7 (D8) and R5 (D6):
a forged POST to /voice/plivo/{connectionId}/answer counts as a signature failure. Under D8 it drops
the cached key, so every forged request costs a DynamoDB read plus a KMS Decrypt; under D6 every 3
forged requests trigger a call to the client's carrier API. connectionIds are visible in the
client's carrier console, so they are not secret.
Plan baseline: D8 = A (cache dropped on signature failure or carrier 401); D6 = A (3 failures in
10 minutes trigger one carrier check).
Runtime evidence: none; proposed behaviour.
Comparison grid:
| Choice | Current | A (Apply) | B (Keep) | C (Investigate) | D (Defer) |
|---|---|---|---|---|---|
| Cache drop trigger | signature failure or carrier 401 | carrier 401 only | unchanged | bounded check, no change | unchanged, TODO |
| D6 carrier check | every 3 failures in 10 min | at most one carrier check per connection per 10 minutes, however many failures | unchanged | unchanged | unchanged |
| Rotated-token pickup | first failure drops cache | the D6 check's 401 drops it, so a rotated token is picked up within 10 minutes | unchanged | unchanged | unchanged |
| Rate limiting | pending (D15) | pending (D15) | pending (D15) | pending (D15) | pending (D15) |
Question D14:
D14 - Stop fake requests from wiping the key cache and spamming the client's carrier?
Project/branch/task: voice telephony v2, Change 1 relay.
ELI10: Two things you approved combine badly. Each request to a client's call address that fails our
check throws away the cached key, and every third failure makes us call the client's carrier to
ask whether their keys still work. Anyone who learns a client's call address, which shows in the
carrier's console, can send junk requests and make us do that work over and over. The fix: only a
real "keys rejected" answer from the carrier clears the cache, and we ask the carrier at most once
every 10 minutes per client.
Stakes if we pick wrong: junk traffic turns into AWS cost and a stream of calls to the client's
carrier account on our behalf.
Recommendation: A because it keeps both approved behaviours (fast answering, rotation detection)
and removes the part an outsider could trigger.
Completeness: A=9/10, B=5/10, C=5/10, D=4/10
Pros / cons:
A) Apply (recommended)
  ✅ Junk requests cost one cheap check against the cached key and nothing more
  ✅ A real token change is still detected, within 10 minutes, by the same check
  ❌ After a client rotates their token, calls can fail for up to 10 minutes before we notice
B) Keep
  ✅ A rotated token is picked up on the very next call
  ❌ Anyone with the address can make us decrypt keys and call the client's carrier repeatedly
C) Investigate
  ✅ Bounded look at the real cost of each forged request
  ❌ The amplification is clear from the design; measuring it changes little
D) Defer
  ✅ No change to the approved behaviour now
  ❌ Ships an outside-triggerable cost and carrier-API loop
Net: a 10-minute debounce and a 401-only cache drop close an abuse loop at the cost of slower rotation pickup.
Header: Abuse loop
Options:
A) Apply (recommended)
The cache is dropped only on a carrier 401. Signature failures still count, but trigger at most one carrier check per connection per 10 minutes; a 401 from that check drops the cache and flips the status. Human ~1h / CC ~10min with tests.
B) Keep
D8 and D6 stay as approved. Human 0 / CC 0.
C) Investigate
Bounded cost check; no change; remedy pending.
D) Defer
No change now; TODO.

State: approved
Actual answer: A) Apply (D14, answered 2026-10-20)
Accepted scope: the credential cache is dropped only on a carrier 401. Signature failures still
count, but trigger at most one carrier check per connection per 10 minutes; a 401 from that check
drops the cache and flips the status to credentials_invalid. Supersedes the "signature failure
drops the entry" part of D8 and the "every 3 failures" trigger of D6.
History: R7 / D8 and R5 / D6 approved A on 2026-10-20; reopened for an outside-triggerable cost loop.

### R13: Rate-limit the public answer endpoints
Finding: OV7 (second half), Medium, confidence 7/10, reviewer: Claude subagent.
backend/src/voice-relay/relay.ts createRequestHandler routes every POST starting with
`/plivo/answer` to `handlePlivoAnswer` with no per-IP or per-path limit; readBody caps size at
64KB only. Under BYOC, a request for an unknown connectionId still costs a DynamoDB read.
Plan baseline: none stated.
Runtime evidence: no limiter exists on the relay today.
Comparison grid:
| Choice | Current | A (Apply) | B (Keep) | C (Investigate) | D (Defer) |
|---|---|---|---|---|---|
| R13 rate limit | none | in-process limiter: 60 answer requests/min per source IP and 30/min per connectionId, over-limit answered 429 before any lookup; unknown connectionIds remembered as unknown for 60 s | none | bounded check, no change | none, TODO |
| D14 debounce | approved | unchanged | unchanged | unchanged | unchanged |
Question D15:
D15 - Put a speed limit on the relay's public call addresses?
Project/branch/task: voice telephony v2, Change 1 relay.
ELI10: The relay's call addresses are public, which they must be so the carrier can reach them.
Nothing limits how fast someone can hit them. With D14 a junk request is already cheap, but a
request for a made-up client address still makes us look it up in the database each time. A simple
speed limit per sender and per client address, plus remembering made-up addresses for a minute,
keeps a flood from turning into database cost or slowing real calls.
Stakes if we pick wrong: a flood of junk requests slows the box that answers every client's real calls.
Recommendation: A because a small in-process limiter costs little and protects the single box that
every phone and website voice call depends on.
Completeness: A=9/10, B=5/10, C=5/10, D=4/10
Pros / cons:
A) Apply (recommended)
  ✅ A flood is turned away before any database read or decryption
  ✅ Limits sit far above what a real carrier sends, so real calls are not affected
  ❌ A carrier sending many calls from one IP at once could hit the per-IP limit, so it needs a test at real volume
B) Keep
  ✅ Nothing to build
  ❌ Junk traffic reaches the database and competes with real calls on one box
C) Investigate
  ✅ Bounded look at carrier source IPs and real request rates first
  ❌ Delays a cheap guard on a public endpoint
D) Defer
  ✅ Change 1 stays smaller
  ❌ The endpoints go public unguarded
Net: a small limiter keeps junk traffic off the box that every live call shares.
Header: Rate limit
Options:
A) Apply (recommended)
In-process limiter on the relay: 60 answer requests per minute per source IP and 30 per minute per connectionId, answered 429 before any lookup; unknown connectionIds remembered as unknown for 60 seconds. Limits are config values. Human ~2h / CC ~20min with tests.
B) Keep
No limiter. Human 0 / CC 0.
C) Investigate
Bounded check; no change; remedy pending.
D) Defer
No limiter now; TODO.

State: approved
Actual answer: A) Apply (D15, answered 2026-10-20)
Accepted scope: in-process limiter on the relay: 60 answer requests per minute per source IP and
30 per minute per connectionId, answered 429 before any lookup; unknown connectionIds remembered
as unknown for 60 seconds; limits are config values; tested at a realistic carrier volume.
History: none

### R14: A dedicated KMS key for carrier credentials
Finding: OV8, Medium, confidence 9/10, reviewer: Claude subagent, verified by parent.
backend/src/lib/kms.ts:18 and :35 (`const keyId = requireEnv('WHATSAPP_KMS_KEY_ID')`) use one key
for every secret; the required relay grant (A3) would be kms:Decrypt on that key.
Plan baseline: A3 required mechanics: kms:Decrypt on WHATSAPP_KMS_KEY_ID for the relay role.
Runtime evidence: the same key encrypts WhatsApp/Meta tokens today; the relay box is public-facing,
has no deploy pipeline and no health check (memory relay-needs-backend-url-before-deploy).
Comparison grid:
| Choice | Current | A (Apply) | B (Keep) | C (Investigate) | D (Defer) |
|---|---|---|---|---|---|
| R14 key for carrier creds | WHATSAPP_KMS_KEY_ID (A3) | new key VOICE_CARRIER_KMS_KEY_ID; kms.ts takes the key id per call site; the relay role may decrypt only this key; the Lambda role may encrypt and decrypt it | shared key, relay can decrypt every secret | bounded check, no change | shared key now, TODO |
| A3 relay IAM grant | required | narrowed to the new key | unchanged | unchanged | unchanged |
Question D16:
D16 - Lock client carrier keys with their own encryption key, so the phone server cannot unlock anything else?
Project/branch/task: voice telephony v2, Change 1 security.
ELI10: All our stored secrets, like WhatsApp and Meta tokens, are locked with one encryption key.
To check phone calls, the relay server needs permission to unlock carrier keys. With one shared
key, that permission would let it unlock every other secret too. The relay is the most exposed
machine we run. A separate key for carrier secrets means a break-in there reaches only carrier keys.
Stakes if we pick wrong: one compromised server exposes every client's WhatsApp and Meta access, not only phone keys.
Recommendation: A because a second key costs about a dollar a month and one IAM line, and it keeps
the most exposed box away from every other client secret.
Completeness: A=10/10, B=4/10, C=5/10, D=4/10
Pros / cons:
A) Apply (recommended)
  ✅ A break-in on the relay cannot unlock the WhatsApp or Meta secrets stored under the existing key
  ✅ The relay's permission is exactly one key, which is easy to audit
  ❌ One more env var on a Lambda close to its 4KB env limit, and kms.ts gains a key parameter
B) Keep
  ✅ No new key or env var
  ❌ The relay can unlock every stored secret for every client
C) Investigate
  ✅ Bounded look at encryption-context grants as an alternative
  ❌ Delays a decision whose cheap answer is already clear
D) Defer
  ✅ Change 1 ships slightly sooner
  ❌ Re-encrypting stored carrier keys later is a migration with clients already connected
Net: a second key keeps the most exposed server's reach down to carrier keys only.
Header: KMS key
Options:
A) Apply (recommended)
Create VOICE_CARRIER_KMS_KEY_ID; kms.ts encrypt/decrypt take the key id from the caller; carrier credentials use the new key; the relay role gets kms:Decrypt on it only; the Lambda role gets encrypt/decrypt on it. Provisioned by a script and recorded in docs/INFRASTRUCTURE.md. Human ~half a day / CC ~25min.
B) Keep
Relay gets kms:Decrypt on WHATSAPP_KMS_KEY_ID as in A3. Human 0 / CC 0.
C) Investigate
Bounded check of encryption-context grants; no change; remedy pending.
D) Defer
Shared key now; TODO to split later with a re-encryption step.

State: approved
Actual answer: A) Apply (D16, answered 2026-10-20)
Accepted scope: create VOICE_CARRIER_KMS_KEY_ID; kms.ts encrypt/decrypt take the key id from the
caller; carrier credentials use the new key; the relay role gets kms:Decrypt on that key only
(replacing A3's grant on WHATSAPP_KMS_KEY_ID); the Lambda role gets encrypt/decrypt on it;
provisioned by a script and recorded in docs/INFRASTRUCTURE.md; the Lambda env-size budget is
checked before adding the var (memory lambda-env-4kb-ceiling).
History: none

### R15: SIP into OpenAI Realtime as a carrier-neutral path
Finding: OV9, Medium, confidence 5/10 (medium, verify: OpenAI Realtime SIP support and how tool
calls work over it were not checked in this review), reviewer: Claude subagent.
Plan baseline: one adapter per carrier on the relay (Plivo, then Exotel).
Runtime evidence: none. If it holds, a carrier or a client's own SIP trunk (e&, du, STC,
Exotel, Telnyx, Plivo) sends the call to one SIP address, and our server handles the session
events instead of carrying the audio. That moves where the session runs, so RAG tool calls,
barge-in, the call log and transfer would need re-checking.
Comparison grid:
| Choice | Current | A (Apply) | B (Keep) | C (Investigate) | D (Defer) |
|---|---|---|---|---|---|
| R15 SIP path | not considered | adopt SIP as the main path now, replacing per-carrier adapters | per-carrier adapters only | a bounded 1-day spike before Change 2: confirm OpenAI Realtime SIP, how our RAG tool call, transfer and call log work over it, per-minute cost, and whether Exotel and Gulf carrier trunks can reach it; written to docs/designs/voice-sip-spike.md; the owner then decides | adapters now, TODO to revisit |
| Change 1 (Plivo adapter) | approved | would be reworked | unchanged | unchanged | unchanged |
| Change 2 (Exotel) | approved | would be reworked | unchanged | starts after the spike | unchanged |
Question D17:
D17 - Spend one day checking a single "send your calls here over SIP" path before building Exotel?
Project/branch/task: voice telephony v2, before Change 2.
ELI10: Right now each carrier needs its own translator on our server. The reviewer pointed out that
OpenAI's voice service may accept phone calls directly over SIP, the standard way phone systems
connect. If so, any carrier or a Gulf client's own UAE or Saudi line could send calls to one address,
with no per-carrier code. I have not verified that it works with our knowledge-base answers and
transfers. Change 1 (Plivo) is unaffected by this check.
Stakes if we pick wrong: we build a translator for every carrier when one shared path might cover
all of them, or we switch to a path that cannot do what our agent needs.
Recommendation: C because one day of checking settles a choice that could replace most of the
per-carrier work, and Change 1 continues meanwhile.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Apply
  ✅ Commits now to the path that might cover every carrier and Gulf line at once
  ❌ Based on an unverified claim, and it reworks Change 1 before anything is proven
B) Keep
  ✅ The adapter approach is understood and Plivo's is already written
  ❌ May build carrier-by-carrier code that one SIP path would have made unnecessary
C) Investigate (recommended)
  ✅ One day answers whether SIP works for our RAG answers, transfer and call records
  ✅ Change 1 is untouched, and the result arrives before any Exotel code
  ❌ Change 2 waits a day, on top of the Exotel sales call it already needs
D) Defer
  ✅ No delay now
  ❌ The question returns after Exotel is built, when changing course costs more
Net: a one-day check before Change 2 decides whether every later carrier is an adapter or a SIP setting.
Header: SIP path
Options:
A) Apply
Adopt SIP into OpenAI Realtime as the main path now; per-carrier adapters reworked. Human ~1-2 weeks / CC ~1 day. High risk: unverified.
B) Keep
Per-carrier adapters only (Plivo, then Exotel). Human 0 / CC 0.
C) Investigate (recommended)
Before Change 2: a 1-day spike confirming OpenAI Realtime SIP support, how RAG tool calls, transfer and the call log work over it, cost per minute, and whether Exotel and Gulf carrier trunks can reach it. Written to docs/designs/voice-sip-spike.md; the owner decides afterwards. Change 1 proceeds. Human ~1 day / CC ~1h.
D) Defer
Adapters now; TODO to revisit SIP later.

State: approved
Actual answer: A) Apply (D17, answered 2026-10-20)
Accepted scope: SIP into OpenAI Realtime becomes the main phone path now; per-carrier audio
adapters are reworked. Each client's carrier (Plivo number, Exotel trunk, a Gulf client's
e&/du/STC trunk) sends calls to our OpenAI project's SIP address; OpenAI fires
`realtime.call.incoming` to our webhook; we accept with the agent's session config, keep a
sideband WebSocket for tool calls (RAG, booking) and the call log, and transfer with SIP REFER.
History: none

Post-answer evidence (parent search, 2026-10-20): OpenAI documents Realtime SIP
(developers.openai.com/api/docs/guides/realtime-sip): SIP traffic to the project fires a
`realtime.call.incoming` webhook, the server accepts or rejects with session config, a per-call
WebSocket carries events, and transfer is a REFER. A community thread (~May 2026) reports SIP
calls failing with 400 before the webhook fires; unconfirmed by OpenAI. Confidence in the path
rises from 5/10 to 7/10. Still unverified: how a forged SIP INVITE carrying a client's number is
told apart from a real forwarded call (the webhook is signed by OpenAI, not by the client's
carrier), latency from India and the Gulf, and recording/transcript access for the CRM.

Conflict with earlier approvals, recorded rather than silently applied. D17 changes where the
phone audio runs (OpenAI, not the relay), so:
- Moot (adapter-only): D5 Twilio start-message auth, D9's phone stream token (the phone stream
  on the relay goes away; the browser path is unchanged), D15's per-connection answer limiter
  (the answer webhook moves to the OpenAI webhook handler).
- Reshaped, kept: D3/D13 number ownership and D4 per-client cap now apply at
  `realtime.call.incoming` accept time; D7's contract suite becomes the webhook's
  accept/reject contract (bad OpenAI signature, unknown number, over cap, lookup failure,
  unclaimed number); D11 Exotel becomes Exotel's SIP trunk setup instead of AgentStream.
- Depends on a pending choice: D6, D8, D12, D14, D16 exist because we store client carrier
  credentials. Whether we still store them under SIP is R17 (D19).
- Reopened: D2 Phase 0 proved the env-var relay path, which SIP no longer uses. R16 (D18).

### R16: Phase 0 under SIP (reopens D2)
Finding: follow-up to D17, P1, confidence 8/10, reviewer: plan-eng-review (Claude).
Plan baseline: D2 = A, prove a live call on the existing env-var relay path before Change 1.
Runtime evidence: SIP path not exercised; OpenAI docs exist; one community report of failures.
Comparison grid:
| Choice | Current | A (Prove SIP first) | B (Keep D2 as approved) |
|---|---|---|---|
| Phase 0 proof | live call through the relay's Plivo stream | one Plivo number forwarding to our OpenAI SIP address; webhook accepts; the agent answers from the knowledge base via a sideband tool call; a REFER transfer is tried; a forged INVITE test shows how we tell it apart; latency measured from an Indian mobile | live call through the relay's Plivo stream (code SIP will replace) |
| Owner steps | Plivo account + one number + relay deploy | Plivo account + one number + OpenAI project webhook; no relay deploy needed for the phone path | unchanged |
| D17 SIP path | approved | unchanged | unchanged |
Question D18:
D18 - Prove one real call over the new SIP path first, instead of over the old relay path?
Project/branch/task: voice telephony v2, Phase 0 after the switch to SIP.
ELI10: Earlier you chose to prove one real call before rebuilding, using the old relay path. You
have now chosen SIP, so phone audio will not go through that relay at all. Proving the old path
would test code we are about to replace. The useful proof now is a real Plivo number forwarded
to OpenAI over SIP, with our server accepting the call, the agent answering from the knowledge
base, a transfer attempt, and a check that someone faking a call to that number can be spotted.
Stakes if we pick wrong: we spend Phase 0 proving code we then delete, and the real unknowns of
SIP (fake calls, latency, the reported failures) stay unknown until clients are connected.
Recommendation: A because it tests exactly the path clients will use, and its open questions,
especially fake calls, decide how the rest gets built.
Completeness: A=10/10, B=4/10
Pros / cons:
A) Prove SIP first (recommended)
  ✅ Tests the real path clients will use, before Change 1 is designed around it
  ✅ Answers the fake-call question, which decides how call routing must be secured
  ❌ New code for the webhook and the sideband connection is needed before the first test call
B) Keep D2 as approved
  ✅ Needs no new code, since the relay path already exists
  ❌ Proves a path SIP replaces, and leaves every SIP unknown open
Net: Phase 0 should prove the path you just chose, not the one it replaces.
Header: Phase 0
Options:
A) Prove SIP first (recommended)
Phase 0 becomes: owner opens a Plivo account, rents one number and sets it to forward to our OpenAI project's SIP address; we build a minimal realtime.call.incoming handler that accepts with the agent's config and a sideband tool call for RAG; test calls cover a knowledge-base answer, a REFER transfer, a forged INVITE, and latency from an Indian mobile. Results go in docs/designs/voice-sip-spike.md before Change 1 is finalised. Human ~2 days / CC ~2h.
B) Keep D2 as approved
Prove a call through the relay's existing Plivo stream first. Human ~1 day / CC ~30min. Tests code SIP replaces.

State: approved
Actual answer: A) Prove SIP first (D18, answered 2026-10-20)
Accepted scope: Phase 0 = the owner opens a Plivo account, rents one number and forwards it to
our OpenAI project's SIP address; we build a minimal realtime.call.incoming handler that accepts
with the agent's config plus a sideband tool call for RAG; test calls cover a knowledge-base
answer, a REFER transfer, a forged INVITE, and latency from an Indian mobile. Results go in
docs/designs/voice-sip-spike.md before Change 1 is finalised. Supersedes D2's relay-path proof.
History: R1 / D2 approved A on 2026-10-19; reopened because D17 moved phone audio off the relay.

### R17: Do we still store client carrier credentials under SIP?
Finding: follow-up to D17, P1, confidence 8/10, reviewer: plan-eng-review (Claude).
Plan baseline: owner decision 3 (2026-10-19): the wizard validates credentials, lists numbers,
auto-configures the number and restores on disconnect. D3, D6, D8, D12, D13, D14, D16 build on
stored credentials.
Runtime evidence: under SIP the call webhook is signed by OpenAI, so credentials are no longer
needed to answer a call. They are still the only way to list a client's numbers (D3 ownership),
point a number at the SIP address, restore it, and run the health check.
Comparison grid:
| Choice | Current | A (Keep, setup-only) | B (Credential-free) |
|---|---|---|---|
| Store carrier credentials | yes, used on every call | yes, sub-account only (D12), dedicated KMS key (D16), read only by the Lambda for setup, ownership checks, restore and the daily health check; never on the call path, so the relay holds none | no; the client points their number or trunk at our SIP address by hand, following wizard instructions |
| D3/D13 ownership | carrier lists the number | unchanged | replaced by a setup test call: the wizard shows a code, the client rings their number, our webhook must see that call To the claimed number |
| D6 health | signature failures + daily check | daily check only (no carrier signatures under SIP) | dropped |
| D8/D14 relay cache | approved | moot (no credentials on the call path) | moot |
| D16 KMS key | relay may decrypt | Lambda only; relay gets no KMS grant | moot |
Question D19:
D19 - Under SIP, keep asking clients for their carrier keys, only for setup?
Project/branch/task: voice telephony v2, Change 1 under SIP.
ELI10: With SIP, OpenAI signs every incoming call for us, so we no longer need the client's carrier
keys to answer calls. We would still use them for setup: listing their numbers to prove they own
one, pointing the number at us automatically, putting it back on disconnect, and a daily check that
it still points at us. The alternative is to store no keys at all: the client follows instructions
to point their number at us, and proves ownership by ringing it during setup.
Stakes if we pick wrong: storing keys we do not need is risk with no benefit; dropping them makes
setup manual and leaves ownership resting on a test call.
Recommendation: A because ownership checks and one-click setup were reasons you chose this design,
and keeping the keys off the call server removes most of their risk.
Completeness: A=9/10, B=6/10
Pros / cons:
A) Keep, setup-only (recommended)
  ✅ One-click setup and restore stay, and ownership is proven by the carrier itself
  ✅ The phone server holds no client keys at all, only the backend does, for setup
  ❌ We still store a secret per client, with the key-rotation and health-check work that brings
B) Credential-free
  ✅ No client secrets stored anywhere, so a breach exposes no carrier accounts
  ❌ Setup becomes manual instructions, and a Gulf trunk or Exotel setup may need a support call
  ❌ Ownership rests on a test call, which a forged SIP call might imitate until Phase 0 shows otherwise
Net: keep the keys for setup and ownership, but take them off the call path entirely.
Header: Carrier keys
Options:
A) Keep, setup-only (recommended)
Credentials stay (sub-account only, dedicated KMS key) and are used only by the Lambda: number listing and ownership (D3/D13), configuring the number's forwarding to our SIP address, restore on disconnect, and the daily health check (D6, daily part only). The relay gets no KMS grant; D8 and D14 are moot. Human ~same as Change 1 minus the relay work / CC ~same.
B) Credential-free
No carrier credentials stored. The wizard shows per-carrier instructions to forward to our SIP address; ownership is a setup test call with a one-time code. D6, D8, D12, D14, D16 are dropped; D3/D13 are replaced. Human ~2 days less / CC ~1h less.

State: approved
Actual answer: A) Keep, setup-only (D19, answered 2026-10-20)
Accepted scope: carrier credentials stay (sub-account only per D12, dedicated KMS key per D16)
and are read only by the Lambda: number listing and ownership (D3/D13), configuring the
number's forwarding to our SIP address, restore on disconnect (C2/OV5), and the daily health
check (D6's daily part). The relay holds no client credentials and gets no KMS grant. D8 and
D14 are moot; D6's signature-failure trigger is moot (calls are signed by OpenAI).
History: none

## TODO proposals

### R18: TODO - managed "Vyostra number" add-on
What: offer a number we rent and manage, for clients who will not open a carrier account.
Why: the owner deferred it on 2026-10-19 until clients decline the product over carrier setup;
the outside voice (OV3) flagged the onboarding cost again.
Pros: removes the biggest setup step for SMBs. Cons: Vyostra becomes a number reseller in that
country (licence and KYC questions), and owns the telephony bill and its abuse risk.
Context: under SIP (D17) it is one more SIP source pointing at the same OpenAI project, so no
new call path. Start from the owner's 2026-10-19 trigger: several clients declining for this reason.
Depends on: Change 1 live; a legal check that we may hold numbers in the chosen country.
Question D20: Add the managed-number add-on to TODOS.md? Options: A) Add to TODOS.md
(recommended), B) Skip, C) Build it now in this plan.
State: approved
Actual answer: A) Add to TODOS.md (D20, answered 2026-10-20). Written as "Managed Vyostra
number add-on", which reshapes the existing DID-provisioning item.

### R19: TODO - outbound calls from journeys
What: a journey step that rings a lead (e.g. call back a missed caller, or a new Meta lead).
Why: owner's order item 4 ("later: outbound calls"); journeys already send WhatsApp.
Pros: speed-to-lead by phone, and it uses the same agent. Cons: telemarketing rules (UAE
Cabinet Resolution 56 of 2024: prior approval, local registered number, 9 AM to 6 PM calling),
consent records, and OpenAI SIP outbound support is unverified.
Context: under SIP it needs the client's carrier to originate the call into our SIP address.
Depends on: Phase 0 and Change 1 live; a per-country rules table.
Question D21: Add outbound calls to TODOS.md? Options: A) Add to TODOS.md (recommended),
B) Skip, C) Build it now in this plan.
State: approved
Actual answer: A) Add to TODOS.md (D21, answered 2026-10-20).

### R20: TODO - the single relay box is still in every call's path
What: health check, restart alerting and a second instance for the relay.
Why: under SIP (D17) the audio moves to OpenAI, but the sideband WebSocket that answers RAG tool
calls and writes the call log must stay open for the whole call, so it lives on the relay box.
docs/INFRASTRUCTURE.md says restarting drops every call in progress, with nothing to fail over
to and no health check watching it.
Pros: one box failing no longer silences every client's phone agent. Cons: a second instance
needs shared state for the per-client cap (D4), which is in-process today (OV11).
Context: start with a health check and alert; the second instance comes later.
Depends on: Change 1.
Question D22: Add relay resilience to TODOS.md? Options as asked: C) Build it now
(recommended), A) Add to TODOS.md, B) Skip.
State: approved
Actual answer: C) Build it now (D22, answered 2026-10-20).
Accepted scope: Change 1 adds a relay health check (CloudWatch or an external ping) with an
alert to the owner; the second instance (with shared state for the per-client cap) is written
to TODOS.md as "Voice relay: second instance".

Approval readiness: PASS. Checked R1 (D2, superseded by R16/D18), R2 (D3), R3 (D4), R4 (D5),
R5 (D6, trigger superseded by R12/D14 and R17/D19), R6 (D7), R7 (D8, moot per D19), R8 (D9), R9
(D10 + D11), R9a (D11), R10 (D12), R11 (D13), R12 (D14), R13 (D15), R14 (D16), R15 (D17), R16
(D18), R17 (D19), R18 (D20), R19 (D21), R20 (D22). Required-mechanics rows A3, C2, OV4b, OV5,
OV10, OV11, OV12 follow from those answers. Every accepted remedy cites its own answer.

## Working plan (as approved, 2026-10-20)

Where this ended up differs from where it started. The review began with per-carrier audio
adapters on the relay; D17 moved phone audio to OpenAI Realtime over SIP. What survives:

**Phase 0 (before Change 1, D18 + D9).** The owner opens a Plivo account, rents one number,
and forwards it to our OpenAI project's SIP address. We build a minimal
`realtime.call.incoming` handler (accept with the agent's instructions and voice) and a
sideband WebSocket on the relay that answers the RAG tool call. Test calls: a knowledge-base
answer, a REFER transfer, a forged INVITE, latency from an Indian mobile. The relay's existing
phone stream path is not deployed live; if it ever is, D9's scoped stream token is a precondition.
Results go in `docs/designs/voice-sip-spike.md`. The forged-INVITE result decides how Change 1
secures routing.

**Change 1 (Plivo, client-owned accounts).**
- `carrier_connections` table, repository, service, routes on the Lambda. Plivo SUB-account
  credentials only (D12), encrypted with a new `VOICE_CARRIER_KMS_KEY_ID` (D16), read only by
  the Lambda (D19). The relay holds no client credentials.
- Wizard: validate credentials, list the sub-account's numbers, claim only a listed number (D3),
  create Vyostra's own Plivo Application per connection and point the number at our SIP
  address (OV4b), store the previous Application and restore it on disconnect only if the
  number still points at us (C2, OV5). Takeover rules D3 + D13.
- `voice_phone_lookup` gains `carrier` and `connectionId`; Phase 0's row is migrated (OV12).
- Webhook handler: verify OpenAI's signature, look the dialled number up, check the row's
  connection, apply the per-client cap of 3 and the box cap of 10 (D4), accept or reject.
  Accept/reject behaviour covered by the table-driven contract suite (D7).
- Connection status healthy / credentials_invalid from a daily carrier check, dashboard banner,
  one SES email per flip (D6 daily part, D19).
- Relay health check and alert (D22). Relay rate limit (D15) applies to whatever public
  endpoints the relay still exposes for phone traffic after Phase 0.

**Change 2 (Exotel, D10 + D11).** Exotel's SIP trunk forwarding to the same SIP address, plus
Exotel's number listing and configure/restore in the wizard, plus Exotel rows in the contract
suite. Starts after an Exotel sales call (account, rates, sub-account model).

**Moot after D17/D19, kept on record:** D5 (Twilio start-message auth, for if Twilio is ever
built), D8 and D14 (relay credential cache), D6's signature-failure trigger.

## NOT in scope
- Twilio: replaced as second carrier by Exotel (D10, D11). D5 stays on record for later.
- Managed "Vyostra number": deferred by the owner; TODOS.md (D20).
- Outbound calls from journeys: TODOS.md (D21).
- A second relay instance: TODOS.md (D22). The health check is in scope.
- Telnyx, Vonage: later carriers; under SIP each is a forwarding setup plus wizard support.
- Arabic and Malay quality checks: still owed before any language claim (handoff task A7);
  not engineering scope here.
- Call-recording disclosure legal answer: the existing P0 gate in TODOS.md still applies
  before any number is given outside the team.

## What already exists
- `voice_phone_lookup` with an atomic, idempotent claim (`voice-phone-lookup-repository.ts:63`)
  and number normalisation (`:34`). Reused; gains two fields.
- `lib/kms.ts` encrypt/decrypt. Reused, with a key-id parameter added (D16).
- `lib/voice-token.ts` scope support. Reused by D9 if the relay phone stream is ever used.
- `lib/voice-instructions.ts` (agent instructions + recording disclosure). Reused as the SIP
  accept call's instructions, so phone and browser cannot describe an agent differently.
- `VoiceSession`'s RAG tool and call-log logic on the relay. Reused as the sideband handler's
  tool logic; the audio half is not used for SIP calls.
- `meta_page_lookup` registry pattern and SES email (contact form, alerts). Reused.
- `relay.test.ts` refusal cases. Their assertions move into the webhook contract suite.

## Diagrams

```
SIP call path (D17)

caller -> client's number (Plivo / Exotel / Gulf trunk)
            |  forwards over SIP
            v
   OpenAI Realtime SIP (our project)
            |  realtime.call.incoming (signed by OpenAI)
            v
   webhook handler ---- lookup voice_phone_lookup[To] ---- none -> reject
            |                     |                     \-- throws -> reject, alert log
            |   row.connectionId == expected? -- no -> reject
            |   client cap (3) / box cap (10) -- full -> reject
            v
   accept(instructions, voice)  ->  sideband WebSocket on relay
                                         |-- search_knowledge_base -> RAG
                                         |-- book_appointment etc.
                                         |-- REFER transfer to staff
                                         \-- call end -> voice_leads + lead_events
```

```
Wizard (Change 1)

paste SA-id + token --MA-id--> refuse + explain sub-accounts
        |
   validate (carrier API) --401--> "credentials refused"
        |
   list numbers --none--> "rent or move a number into this sub-account"
        |
   pick N --held by another connection--> holder lists N? refuse
        |                                  holder gone / credentials_invalid + we list N? take over + email
   store previous Application, create ours, point N at SIP address
        |
   connected  ...  disconnect: N still points at us? restore previous : show manual steps
```

## Failure modes
| Path | Realistic failure | Handling | Test | User sees |
|---|---|---|---|---|
| SIP to OpenAI | calls fail with 400 before the webhook (reported May 2026) | none in our code; Phase 0 detects it | Phase 0 E2E | caller hears a carrier error |
| Webhook | forged INVITE with a client's number | **not yet designed**; Phase 0 decides | none yet | fake call to a client's agent, fake lead, our OpenAI cost: **critical gap** |
| Webhook | DynamoDB lookup throws | reject, logged as infrastructure | contract suite | carrier error message |
| Sideband WS | relay restarts mid-call | health check + alert (D22) | health check test | agent loses KB answers; call log lost |
| Wizard | carrier API down at claim | error + retry | wizard tests | clear error |
| Daily check | client rotated token | credentials_invalid + email | health-check test | banner + email |
| Disconnect | carrier 401 | rows removed, manual steps | unit test | manual instructions |

## Worktree parallelization strategy
| Step | Modules touched | Depends on |
|---|---|---|
| Phase 0 SIP proof | backend webhook handler, voice-relay sideband | — |
| Connections + KMS key | repositories, services, routes, lib/kms, scripts | Phase 0 result |
| Webhook handler (full) | backend webhook, repositories | Connections |
| Wizard UI | frontend pages/components/services | Connections routes |
| Health check + alert | scripts, voice-relay | — |

Lane A: Connections -> Webhook handler (shared repositories/). Lane B: Wizard UI after the
Connections routes exist. Lane C: Health check, independent. Execution: Phase 0 first and
alone. Then launch A and C; start B once A's routes are merged.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific
finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~2 days / CC: ~2h)** — voice SIP — Phase 0: minimal realtime.call.incoming handler + sideband RAG tool, live Plivo test calls, forged-INVITE and latency checks, write docs/designs/voice-sip-spike.md
  - Surfaced by: Outside voice OV9 -> D17, D18
  - Files: backend/src (new webhook handler), backend/src/voice-relay, docs/designs/voice-sip-spike.md
  - Verify: a real call answered with a knowledge-base answer; results file written
- [ ] **T2 (P1, human: ~half day / CC: ~30min)** — voice-token — scope the relay phone stream token (only if the relay phone stream is ever deployed live)
  - Surfaced by: Outside voice OV1 -> D9
  - Files: backend/src/lib/voice-token.ts, backend/src/voice-relay/relay.ts, relay.test.ts
  - Verify: npm test; an unscoped widget token cannot open a phone stream
- [ ] **T3 (P1, human: ~2 days / CC: ~1.5h)** — carrier connections — table, repo, service, routes; sub-account only; dedicated KMS key
  - Surfaced by: D12, D16, D19, A3
  - Files: backend/src/repositories, services, routes, lib/kms.ts, lib/table-names.ts, scripts/
  - Verify: npm test; tsc --noEmit
- [ ] **T4 (P1, human: ~1 day / CC: ~45min)** — number ownership — claim only listed numbers, takeover rules, connectionId on lookup rows, Phase 0 row migration
  - Surfaced by: A1 -> D3, OV6 -> D13, OV12
  - Files: backend/src/repositories/voice-phone-lookup-repository.ts, services, routes/voice-routes.ts
  - Verify: npm test (takeover branches)
- [ ] **T5 (P1, human: ~1 day / CC: ~45min)** — webhook — signature, lookup, connection match, per-client + box caps, accept/reject; contract suite
  - Surfaced by: A2 -> D4, T1 -> D7
  - Files: backend/src (webhook handler + tests)
  - Verify: npm test (contract suite)
- [ ] **T6 (P2, human: ~1 day / CC: ~45min)** — health — daily carrier check, credentials_invalid status, banner, one email per flip
  - Surfaced by: C1 -> D6, D19
  - Files: backend/src/services, scheduler, frontend banner
  - Verify: npm test
- [ ] **T7 (P2, human: ~2 days / CC: ~1.5h)** — wizard — connect, list, warn, configure via our own Application, restore-if-still-ours
  - Surfaced by: owner decision 3, C2, OV4b, OV5
  - Files: frontend/src/pages, components, services; backend providers/plivo-call-provider.ts
  - Verify: frontend npx tsc --noEmit; npm test; manual connect/disconnect on the Phase 0 number
- [ ] **T8 (P2, human: ~half day / CC: ~30min)** — relay — health check + alert; rate limit on any public phone endpoint left on the relay
  - Surfaced by: D22, OV7 -> D15
  - Files: backend/src/voice-relay, scripts/
  - Verify: alert fires when the relay is stopped
- [ ] **T9 (P2, human: ~2-3 days + sales lead time / CC: ~1.5h)** — Exotel — SIP trunk setup, number listing, wizard support, contract rows
  - Surfaced by: OV2 -> D10, D11
  - Files: backend/src/providers (exotel), frontend wizard
  - Verify: a live Exotel call before merge

## Unresolved decisions that may bite you later
- How a forged SIP INVITE carrying a client's number is rejected. Not asked as a decision
  because the options depend on what Phase 0 shows the webhook payload carries. Missing answer:
  the defence (source allowlist, a per-client secret in the SIP URI or a header, or a carrier
  signature) to be chosen right after Phase 0, before Change 1 ships.

## Completion summary
- Step 0: Scope Challenge — scope accepted as-is (structure: two changes, D1)
- Reality rows: 7/7 applicable tier-1 rows emitted, 3 unverified premises
- Architecture Review: 4 issues found (A1-A4)
- Code Quality Review: 2 issues found (C1, C2)
- Test Review: diagram produced, 13 gaps identified (all proposed code; see the test plan)
- Performance Review: 1 issue found (P1-perf)
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 3 items proposed to user (2 added, 1 built now)
- Failure modes: 1 critical gap flagged (forged SIP INVITE)
- Unresolved decisions: 1 in this review
- Outside voice: codex unavailable (MODEL_UNUSABLE); native Claude subagent completed, 12 findings
- Parallelization: 3 lanes, 2 parallel / 1 sequential after Phase 0
- Lake Score: 6/15 = answers picking a 10/10 option / answers scored for Completeness (D2, D3, D7, D9, D16, D18 were 10/10; the other nine picked 9/10 options)

## Reality rows
| premise | claim | file:line receipt | verdict |
|---|---|---|---|
| P1 | Plivo path never ran a live call | backend/src/voice-relay/transports/plivo-webhook.ts:8 | true |
| P2 | relay telephony uses one env-var account | backend/src/voice-relay/server.ts:37 | true |
| P3 | claim accepts any number, first writer wins | backend/src/repositories/voice-phone-lookup-repository.ts:82 | true |
| P4 | concurrency cap is box-wide only | backend/src/voice-relay/relay.ts:172 | true |
| P5 | widget token endpoint is public and unscoped | backend/src/routes/voice-routes.ts:179 | true |
| P6 | one KMS key for all secrets | backend/src/lib/kms.ts:18 | true |
| P7 | OpenAI Realtime supports SIP with tool calls and REFER | developers.openai.com/api/docs/guides/realtime-sip | unverified (docs only, no live call) |
| P8 | Plivo UAE local numbers cannot receive calls | plivo.com/sip-trunking/coverage/ae | unverified (vendor page, not sales) |
| P9 | Twilio stream URL query strings are dropped | twilio.com/docs/voice/twiml/stream | unverified (moot after D10) |

REALITY: premise-table finding unverified=3 docs/designs/voice-byo-carrier-v2.md:1392
REALITY: already-done pass no carrier/SIP work on origin/main since 2026-10-10 backend/src/voice-relay/relay.ts:1
REALITY: surface-check pass routes checked against voice-routes.ts and relay.ts createRequestHandler backend/src/routes/voice-routes.ts:179
REALITY: binding-decisions pass v1 eng decisions honoured or explicitly superseded (D17) docs/designs/voice-agent-telephony-v1.md:120
REALITY: numbers finding effort figures [estimated]; KMS latency [re-measure before gate] backend/src/lib/kms.ts:36
REALITY: deferred-asks pass no linked issue docs/designs/voice-byo-carrier-v2.md:1
REALITY: pr-count finding Phase 0 + Change 1 + Change 2 = 3 merges vs default 1; accepted at D1/D18 docs/designs/voice-byo-carrier-v2.md:57

## Suppressed findings
- (4/10) Plivo `extractDialledNumber` fallbacks (relay.ts) may misreport the destination for
  forwarded calls; moot under SIP unless the relay path is revived.
- (4/10) Lambda env 4KB budget may not fit VOICE_CARRIER_KMS_KEY_ID; checked at implementation
  per memory lambda-env-4kb-ceiling.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | codex (unavailable) -> Claude subagent native fallback | Independent 2nd opinion | 1 | unavailable (native completed) | 12 findings: 7 asked (OV1, OV2, OV4a, OV6, OV7, OV8, OV9), 5 recorded as corrections or required work (OV4b, OV5, OV10, OV11, OV12), 1 noted as disagreement (OV3) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | ISSUES OPEN | 20 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex plan-review unavailable (MODEL_UNUSABLE, gpt-6-astra); native
  Claude subagent completed within the 5-minute limit with 12 findings. Native output does not
  count as outside coverage.
- **VERDICT:** none cleared; eng review required (issues open: the forged-INVITE defence is
  undesigned until Phase 0).

**UNRESOLVED DECISIONS:**
- Forged SIP INVITE defence: choose after Phase 0 (source allowlist, per-client secret in the SIP URI or header, or carrier signature)
