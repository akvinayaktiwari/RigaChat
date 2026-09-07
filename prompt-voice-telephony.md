# Voice Telephony — Taking the First Real Call

Handoff for the work that remains after the Plivo transport landed (2026-09-07).
Everything in code is done and merged; what is left is an account, a phone
number, and the first call through it.

Read this before touching the relay. Most of it is things that were learned the
expensive way, and every one of them fails **quietly** — which is the whole
reason this file exists.

---

## Where things actually stand

Verified against AWS on 2026-09-07, not assumed:

```
DONE
  voice_leads               ACTIVE, GSI clientId-createdAt-index
  voice_phone_lookup        ACTIVE, GSI agentId-index
  relay IAM                 can write voice_leads / lead_events / lead_state
  relay node_modules        the 4 extra @aws-sdk clients installed
  SSM                       registered, deploy path works end to end
  DID assignment API + UI   PUT/GET/DELETE /api/voice-agents/:id/phone-number

NOT DONE
  Plivo account             does not exist
  DID                       none rented; Indian DIDs need KYC (calendar time)
  relay env                 no PLIVO_* on the box, so telephony is OFF
  relay code                still the bundle from 2026-07-18, pre-telephony
  public hostname           no TLS endpoint pointed at the relay
  Round 1 observation       docs/voice-front-desk-observation-log.md is blank
  Round 2                   5-10 unscripted calls, needs a live number
```

---

## The order to do it in

### 0. Call-recording consent — settle this BEFORE the first call

A call records both halves into `lead_events` and there is no disclosure line anywhere in
the code. The design doc lists one as a constraint; the cost-and-pricing doc says get
counsel to confirm what TRAI actually requires rather than assuming. Neither happened.

Nothing is recording today — telephony is off — so this is not urgent in the way a live
bug is. It is urgent in the way a legal gap is: the cost of finding out late is a
complaint, not a stack trace. See the P0 GATE item in `TODOS.md`. Start it with the Plivo
call; both are calendar time.

### 1. Plivo account, KYC, DID

The long pole. Nothing else compresses it. Ask on the sales call:

- Can we hold **unassigned** Indian DIDs under our own KYC, and what does it
  cost to sit on them? This decides whether client #2 waits days to activate
  voice — see the DID-provisioning item in `TODOS.md`.
- Confirm the **answer webhook** payload field names and the **signature V3**
  scheme. See "unverified contract" below; getting this from a human beats
  discovering it from a failed call.

Recommended number strategy is option 1 in `docs/designs/voice-agent-telephony-v1.md`:
the client forwards their existing line to our DID **on busy / no-answer**, so
the AI answers exactly the calls being missed today and a human still gets first
crack at every call.

### 2. Relay environment

The relay reads `/home/ubuntu/.env` — **its own**, not the Lambda's. Add:

```
PLIVO_AUTH_TOKEN=          # half the telephony switch
VOICE_RELAY_PUBLIC_HOST=   # e.g. voice.vyostra.com — the other half
PLIVO_AUTH_ID=             # only needed to TRANSFER a call
BACKEND_URL=               # still missing; see the TODO in session.ts
```

Telephony is **fail-closed**: without both `PLIVO_AUTH_TOKEN` and
`VOICE_RELAY_PUBLIC_HOST` the relay boots with telephony off and every Plivo
endpoint answers 503. That is deliberate — a public phone number is an
unauthenticated door to a metered OpenAI session.

### 3. Public hostname

Caddy is already on the box. Point `VOICE_RELAY_PUBLIC_HOST` at it, terminate
TLS, proxy to `127.0.0.1:3100`. Both `/plivo/answer` (POST) and `/plivo/stream`
(WebSocket upgrade) must pass through — the stream failing while the answer
works presents as a call that connects to silence.

The box's public IP is **not** an Elastic IP. It changes on stop/start, so
associate one before pinning DNS.

### 4. Deploy the relay

```bash
./scripts/deploy-voice-relay.sh --probe   # confirm layout, changes nothing
./scripts/deploy-voice-relay.sh           # build, ship, restart, verify
```

**This drops every call in progress**, browser calls included — sessions live in
memory in one process, with no draining and nothing to fail over to. Do it when
the line is quiet.

### 5. Assign the DID

Dashboard → the voice agent → Phone number card. Or:

```
PUT /api/voice-agents/:id/phone-number   { "phoneNumber": "+91..." }
```

The number stored is **our Plivo DID** — the number Plivo reports as the call's
destination — never the client's own advertised number. Their telco forwards to
the DID; their public number never reaches us. Storing theirs creates a row no
inbound call can ever match, and **the failure is silent**: the caller hears
nothing and nothing errors.

### 6. Round 1, then Round 2

`docs/voice-front-desk-observation-log.md` is still a blank template. It was
meant to gate whether to build telephony at all. Run it anyway before a stranger
hears the agent — it is the cheap version of the same question.

Round 2 is 5-10 real inbound calls by people who do not know the script, per the
design doc's success criteria.

---

## Traps — every one of these fails quietly

**The CRM writes swallow their own errors.** `resolveIdentity` and
`withIdentity` in `voice-relay/session.ts` catch and log, on purpose, so a
DynamoDB problem can never drop a live call. The cost is that a broken CRM write
looks like nothing at all: the phone rings, the agent answers, the caller is
helped, and the dashboard stays empty. If leads are not appearing, check the
relay log — not the UI.

**SSM runs as root; PM2 is per-user.** The relay is a PM2 process owned by
`ubuntu`. `pm2 restart voice-relay` as root finds no such app, exits 0 having
done nothing, and leaves the old code serving — while a health check answers 200
from the process that never restarted. Always `sudo -iu ubuntu`, and verify the
**PID changed**. The deploy script does both.

**`pm2 list` as root spawns a daemon.** It does not just read the wrong
registry, it creates `/root/.pm2`. Probe as the owner.

**The bundle's AWS SDK clients are external.** `build:relay` externalises
`@aws-sdk/*`, so they resolve from `/home/ubuntu/node_modules` at runtime. A
missing one is a require at load — the process dies and PM2 restart-loops it,
taking browser voice down too. The deploy script checks and refuses. If you add
an import that reaches further into the services layer, install its clients on
the box first. See the bundle-size item in `TODOS.md`.

**The Plivo contract is unverified against live traffic.** The signature V3
scheme and the `<Stream>` element in
`backend/src/voice-relay/transports/plivo-webhook.ts` follow published docs and
have never seen a real request. Expect the first call to shake something out.
The two failure shapes differ: a wrong signature scheme rejects **every** request
(loud, and safe — verification fails closed), while a wrong `<Stream>` element
connects the caller to silence.

**Local dev reads `shannon_` tables.** `DYNAMODB_TABLE_PREFIX` is set in the dev
server's shell, not `.env`. An empty dashboard on localhost is not a bug.

**The repo is public.** No instance IDs, IPs, security-group IDs or key names in
commits, docs or code. Resolve the box by its `Name=vyostra-voice-relay` tag —
both scripts already do.

---

## Verifying it works

```bash
# relay is up, and whether telephony is switched on
ssh <box> 'pm2 logs voice-relay --lines 40 --nostream'
#   "telephony: enabled (max N concurrent)"  <- credentials present
#   "telephony: disabled"                    <- PLIVO_* missing

# the DID is claimed and points at the right agent
aws dynamodb get-item --table-name voice_phone_lookup --region ap-south-1 \
  --key '{"phoneNumber":{"S":"+91..."}}'

# after a test call — the lead and its transcript
aws dynamodb query --table-name lead_events --region ap-south-1 \
  --key-condition-expression 'leadId = :l' \
  --expression-attribute-values '{":l":{"S":"<leadId>"}}'
```

A call that connects but records nothing means the write path is failing
silently. A call rejected with "this number is not in service" means the lookup
found no row — check the number's spelling reached the table normalised
(`normalisePhoneNumber` collapses `+91...`, `91...` and `0091...` to one key).

---

## Do not

- **Do not** restart the relay to "check something" during business hours. It
  drops live calls.
- **Do not** point `voice_phone_lookup` at a client's own number. See above.
- **Do not** run `backend/scripts/deploy.js` expecting it to deploy the relay —
  it touches Lambdas only, and not even all of them.
- **Do not** add a `DYNAMODB_TABLE_*` env var. Table names live in
  `backend/src/lib/table-names.ts`; the Lambda's env has a 4KB ceiling that this
  already hit once.
