# Architecture

> **Verification checklist:** the Lambda topology and CORS sections are
> grounded in `backend/index.ts` and `backend/src/routes/index.ts` — read
> those two files directly if anything here seems off, they're short and
> unusually well-commented. The RAG constants (`MMR_LAMBDA`, `MMR_FETCH_COUNT`,
> `MIN_SIMILARITY_SCORE`) are in `backend/src/repositories/vector-repository.ts`
> lines 10, 72, 76 as of this writing — re-grep if line numbers drift.

## Directory structure (real, `ls`-verified)

```
backend/src/
  config/          entitlements-config.ts (only file here)
  lib/             OpenAI/Pinecone/Cognito clients, KMS, SQS, utilities
  providers/       gupshup-provider.ts, zoho-provider.ts
  repositories/     14 files — DynamoDB, Pinecone, Redis, one per domain
  routes/           11 route files, Hono handlers only
  services/         20 files — all business logic
  types/            shared interfaces
  voice-relay/      server.ts, session.ts, auth.ts — the EC2-hosted WS relay's source
backend/index.ts     Lambda handler entry point (see "Lambda topology" below)

frontend/src/
  pages/ components/ hooks/ services/ types/   — matches CLAUDE.md's stated layout
```

The routes→services→repositories layering CLAUDE.md mandates is visible in
spot checks: `admin-routes.ts` imports only from `../services/admin-service.js`
and `../lib/cognito-staff.js`, never a repository directly. This wasn't
exhaustively checked across all 11 route files — grep
`from '\.\./repositories` in `backend/src/routes/*.ts` yourself if you need
a hard guarantee; none turned up in the files sampled for this doc set.

## Lambda topology — three functions, one bundle

`backend/package.json`'s `build` script produces a single
`backend/dist/index.js` (`tsc --noEmit && esbuild ... --bundle`). That one
artifact is deployed, unchanged, to **three** separate Lambda functions —
confirmed in `.github/workflows/deploy.yml` and `scripts/deploy.sh`, both of
which zip it once and run `aws lambda update-function-code` three times:

| Function (default name) | Invocation mode | Handles |
|---|---|---|
| `rigachat-api` | BUFFERED (Function URL) | Every route except `/api/chat/message` |
| `rigachat-api-streaming` | RESPONSE_STREAM (Function URL) | Only `/api/chat/message`, streamed word-by-word |
| `rigachat-crawler` | SQS event source (batch size 1) | Crawl/index jobs, via `processCrawlerJob()` |

Source: `backend/index.ts`. One handler module branches on the incoming
event shape to decide which of these three roles it's playing:

```ts
if ('Records' in event && event.Records?.[0]?.eventSource === 'aws:sqs') { ... }       // crawler
if ('source' in event && event.source === 'aws.events' && event['detail-type'] === 'whatsapp-weekly-report') { ... }  // EventBridge cron
return bufferedHandler(event, lambdaContext)                                            // everything else
export const streamingHandler = hasStreamingRuntime ? streamHandle(app) : undefined      // streaming Lambda only
```

The streaming/non-streaming split exists because "Lambda Function URL only
supports one invocation mode per function" (direct quote from the file's own
comment) — `streamingHandler` self-detects whether it's running under the
real streaming runtime by checking for
`globalThis.awslambda.streamifyResponse`, specifically because the AWS SDK
itself sets `globalThis.awslambda = {}` as a side effect of importing
`@aws-sdk/client-dynamodb`, so a naive existence check would false-positive
on the buffered Lambda.

There was previously a **fourth** Lambda, `rigachat-voice-ws` — removed from
the GitHub Actions workflow in commit `edf0e33` ("remove deleted
rigachat-voice-ws Lambda from GitHub Actions workflow"). Voice call relaying
now happens on the EC2 relay described below instead.

**Discrepancy worth knowing about:** `backend/index.ts`'s own top-of-file
comment says this bundle "is deployed to two separate Lambda functions,"
then describes the crawler Lambda as a third a few lines down. `deploy.yml`'s
final `deploy-summary` job echoes the same undercount: `"Backend: both Lambda
functions updated"`. Both read like leftover phrasing from before the
crawler Lambda was split out — harmless as prose, but worth fixing next time
either file is touched so a future reader doesn't undercount by one.

## CORS design (`backend/src/routes/index.ts`)

Three separate `cors()` configs, deliberately not shared:

- **`dashboardCors`** — origin = `FRONTEND_URL`, credentials allowed. Used for `/api/clients/*`, `/api/kb/*`, `/api/integrations/*`, `/api/auth/*`, and the non-public paths under `/api/bots/*`, `/api/forms/*`, `/api/voice-agents/*`, `/api/leads/*`.
- **`widgetCors`** — origin `*`, no credentials. Used for `/api/chat/*` and the specific public sub-paths of the routes above (e.g. `/api/bots/public/:botId`, `/api/forms/public/:formId`, `/api/forms/leads`, `/api/voice-agents/public/:id`, `/api/voice-agents/token`).
- **`adminCors`** — origin = `ADMIN_CONSOLE_ORIGIN`, kept as its own config "even though the shape is identical" to `dashboardCors` — the code comment is explicit that this is intentional, so the admin console's CORS "must never silently inherit a future change made to the customer dashboard's CORS config."

For any router prefix that mixes public and authenticated paths
(`/api/bots/*`, `/api/forms/*`, `/api/voice-agents/*`, `/api/leads/*`), the
code dispatches to **exactly one** cors middleware per request based on
`c.req.path`, rather than registering both — because Hono's `cors()` only
*sets* headers, it never clears them, so two overlapping registrations would
let `dashboardCors`'s `Access-Control-Allow-Credentials: true` leak onto a
wildcard-origin route. This pattern repeats four times (bots, forms,
voice-agents, leads) almost verbatim — a candidate for extraction into a
shared helper if a fifth ever gets added.

## RAG pipeline

`backend/src/repositories/vector-repository.ts`:

```
MMR_FETCH_COUNT = 10        // Pinecone topK before MMR reranking
MMR_LAMBDA = 0.7             // relevance vs. diversity tradeoff
similaritySearch(..., topN = 5)   // final result count after MMR
MIN_SIMILARITY_SCORE = 0.2   // hard floor before a match is even considered
```

MMR reranking (`applyMMR`) uses a cheap Jaccard-word-overlap proxy
(`textSimilarity`) instead of real embeddings for the diversity term,
because "Pinecone doesn't return [embeddings] by default and fetching them
separately isn't worth the round trip" (code comment). Every query is
namespace-scoped: `filter: { botId: { $eq: namespaceId } }`, confirming
CLAUDE.md rule 5 still holds in code.

**Discrepancy:** the in-repo `CLAUDE.md` "RAG quality standards" section
states `topK: 5`, `Candidate pool: 10`, `MMR lambda: 0.7` — all three match
the code exactly. It also states `Similarity threshold: 0.7`, but the actual
constant is `MIN_SIMILARITY_SCORE = 0.2`. That's a real gap between the
documented standard and the shipped value — see
[CHALLENGES.md](./CHALLENGES.md) for it flagged as an open question rather
than a guessed resolution (unclear whether the doc or the code is the
stale one).

## Entitlements system

`backend/src/config/entitlements-config.ts` — plain constants, no DB-backed
config:

```
TRIAL: 14 days + 3-day grace, 1 agent, 25 leads, 50 conversations
PLANS: free / starter / growth / agency — agents, leads, chat.conversations
       (null = unlimited; growth/agency raise or remove most caps)
FEATURES.voice: subscribable, default 300 minutes
POST_TRIAL_BEHAVIOR: 'grace_then_degrade'
LEAD_CAP_TYPE: 'stock'  // cumulative, not reset per period
MESSAGE_CEILING_PER_CONVERSATION = 200   // flat abuse guard, all plans
RESYNC_COOLDOWN_SECONDS = 600            // re-crawl cost-abuse guard
```

Enforced via `entitlement-service.ts`'s `EntitlementError`, caught centrally
in `routes/index.ts`'s `app.onError` handler and converted to a structured
HTTP response (`toEntitlementErrorResponse`) — not scattered per-route
try/catch. `isInternal` accounts bypass the flat guards (checked at the call
site per the code comments, not centrally).

## Admin console isolation

Entirely separate auth boundary: `backend/src/lib/cognito-staff.ts` +
`requireStaffAuth`, applied once for the whole router —
`adminRoutes.use('*', requireStaffAuth)` in `admin-routes.ts` — rather than
per-route. Separate CORS config (`adminCors`, above), separate frontend
Cognito client env vars (`VITE_STAFF_COGNITO_CLIENT_ID`,
`VITE_STAFF_COGNITO_REGION`), separate `STAFF_COGNITO_USER_POOL_ID` /
`STAFF_COGNITO_CLIENT_ID` on the backend. Mutations
(`toggle-internal`, `extend-trial`, `change-plan`, `set-overrides`) write to
an `audit-log-repository.ts`-backed table, with the actor's email pulled
from `c.get('staffUser').email` on every mutating call.

## Voice relay (why it's not on Lambda)

`backend/src/voice-relay/{server,session,auth}.ts` is a WebSocket relay to
OpenAI's Realtime API (`gpt-realtime` model,
`wss://api.openai.com/v1/realtime`), built separately via
`npm run build:relay` (`esbuild ... --format=cjs --outfile=dist/voice-relay.js`).
It's not deployed by any CI workflow or deploy script in this repo — no
Terraform/CDK/CloudFormation, no PM2/Caddy/systemd unit file, no SSH/EC2
commands anywhere in `.github/workflows/` or `scripts/`. Per the primer,
it's meant to run on EC2 behind PM2 + Caddy, but that's **not verifiable
from this repo** — mark it TODO rather than trusting the primer (see
[INFRASTRUCTURE.md](./INFRASTRUCTURE.md)).

It talks to the RAG pipeline as a function-calling tool
(`search_knowledge_base`, defined inline in `session.ts`) hitting
`POST /api/voice-agents/rag` on the main backend — and currently does so
against a **hardcoded fallback URL** because the relay's own `.env` on EC2
is missing `BACKEND_URL` (see the TODO comment cited in
[CHALLENGES.md](./CHALLENGES.md)).

There's also an EventBridge Scheduler cron path through the same shared
Lambda bundle: an event with `source: 'aws.events'` and
`detail-type: 'whatsapp-weekly-report'` triggers
`sendWeeklyReportsForAllClients()` directly, bypassing the Hono app
entirely — same Lambda, different entry path, no new function or deploy
pipeline needed for it.

## DynamoDB tables

9 tables (env-var-driven names, not hardcoded), vs. 5 listed in the root
`CLAUDE.md`:

```
CLIENTS   BOTS   LEADS   CONVERSATIONS   KB                    <- in CLAUDE.md
SUBSCRIPTIONS   VOICE_AGENTS   VOICE_CALL_LOGS   VOICE_KB      <- added since, undocumented in CLAUDE.md
```

`voice-repository.ts` reads its three table names through
`process.env[CONST_NAME]` where `CONST_NAME` is itself a string constant
(`TABLE_NAME_ENV_VAR = 'DYNAMODB_TABLE_VOICE_AGENTS'`, etc.) — a level of
indirection that makes these three invisible to a literal
`grep "process.env\."`, which is how they were nearly missed compiling
[INSTALL.md](./INSTALL.md).
