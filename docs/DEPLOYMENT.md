# Deployment

> **Verification checklist:** three deploy paths are described below —
> `.github/workflows/deploy.yml`, `scripts/deploy.sh`, and
> `backend/scripts/deploy.js`. Diff all three against each other if you
> suspect this doc is stale; the whole point of this file is that they've
> already drifted from each other once.

## The canonical path: `.github/workflows/deploy.yml`

Triggers on every push to `main` — **merging to `main` is a production
deploy**, not just a merge (see [CONTRIBUTING.md](./CONTRIBUTING.md)). Two
parallel jobs:

**`deploy-backend`**: `npm ci` + `npm run build` in `backend/`, zip
`dist/index.js`, then for **each of the three Lambdas** (main, streaming,
crawler): `update-function-code`, wait, `get-function-configuration` →
merge in a fixed set of vars via `jq` → `update-function-configuration`,
wait. Ends with a health check against
`${BACKEND_URL}/api/bots/health-check/config`, failing the deploy on any
5xx.

Important asymmetry in what each Lambda's env-merge step actually injects:

| Lambda | Vars merged in by this workflow |
|---|---|
| main, streaming | `WHATSAPP_PROVIDER`, `WHATSAPP_MASTER_NUMBER`, `WHATSAPP_KMS_KEY_ID`, `REDIS_PROVIDER`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `SQS_CRAWLER_QUEUE_URL` |
| crawler | `SQS_CRAWLER_QUEUE_URL`, `LAMBDA_CRAWLER_FUNCTION_NAME` only |

Since all three Lambdas run the identical bundle and
`backend/src/providers/zoho-provider.ts` reads `ZOHO_CLIENT_ID` /
`ZOHO_CLIENT_SECRET` / `ZOHO_REDIRECT_URI` as **module-top-level**
`requireEnv()` calls (executed unconditionally at cold start, since
`index.ts` unconditionally imports the full route tree that reaches this
module), whether the crawler Lambda has those vars set is not visible from
this workflow — it only ever explicitly provisions two vars for it. This
doesn't mean the crawler Lambda is broken (it may already have those vars
set directly in the AWS console, outside this repo's visibility) — it means
this is unverifiable from the repo alone and worth a manual check. See
[SECURITY.md](./SECURITY.md) and [CHALLENGES.md](./CHALLENGES.md).

**`deploy-frontend`**: `npm ci` + `npm run build` in `frontend/` (with 7
`VITE_*` build-time vars, listed in [INSTALL.md](./INSTALL.md)), then:
1. `sed`-replaces `__BACKEND_URL__` in `widget.js`/`form-widget.js`, and `__BACKEND_URL__`/`__WS_URL__` in `voice-widget.js` — these three files ship with literal placeholder tokens baked in by `vite build` and get string-replaced post-build, not templated at build time.
2. Uploads `widget.js`, `form-widget.js`, `voice-widget.js` individually to the **widget** S3 bucket (`S3_BUCKET_WIDGET`), 1-hour cache.
3. `aws s3 sync`s the rest of `dist/` (excluding `index.html`) to the **dashboard** S3 bucket (`S3_BUCKET_FRONTEND`), immutable 1-year cache, `--delete`.
4. Uploads `index.html` separately with `no-cache, no-store, must-revalidate`.
5. Invalidates **two separate** CloudFront distributions — one for the dashboard, one for the widget CDN.

## The manual equivalent: `scripts/deploy.sh`

A full local re-implementation of the same steps (AWS CLI install check →
credentials check → backend build → all 3 Lambdas → frontend build → widget
placeholder injection → S3 → CloudFront). Ships with real default infra
identifiers baked in as fallback env values — see
[INFRASTRUCTURE.md](./INFRASTRUCTURE.md) for the actual values. This one
**is** in sync with the 3-Lambda reality (unlike the next one).

## The stale one: `backend/scripts/deploy.js` (`npm run deploy`)

Only deploys **two** Lambdas — `LAMBDA_FUNCTION_NAME` and
`LAMBDA_STREAMING_FUNCTION_NAME` — read straight from its source:

```js
const mainFunctionName = process.env.LAMBDA_FUNCTION_NAME
const streamingFunctionName = process.env.LAMBDA_STREAMING_FUNCTION_NAME
// ... zips, deploys to both, waits. Never touches LAMBDA_CRAWLER_FUNCTION_NAME.
```

**If you run `npm run deploy` from `backend/` expecting it to fully deploy
the backend, it won't update the crawler Lambda at all**, silently leaving
it on an older build while main/streaming move forward. This script predates
the crawler Lambda split and was never updated. Use `deploy.yml` (push to
`main`) or `scripts/deploy.sh` instead; treat `npm run deploy` as
deprecated until someone fixes or removes it.

## No test gate before deploy

`deploy.yml` runs independently of `ci.yml` — a push to `main` deploys
regardless of whether `ci.yml`'s type-check/build job (which also runs on
every push) passed or failed, unless GitHub branch protection rules require
it, which isn't determinable from the repo itself. Worth confirming in
GitHub's repo settings if this matters to you.

## Post-provisioning verification: the agent/journey infra

`scripts/provision-agent-journey.sh` creates 9 DynamoDB tables, 2 IAM roles, 2
Lambda role policies, and 13 env vars across 3 Lambdas. It is idempotent.

Run it once, then walk this checklist. **The unit tests cannot cover any of it**:
they mock the AWS SDK, so they prove the branch logic and say nothing about
whether a role is trusted by the right principal or an ARN points at anything
real. That class of failure — the one that had `RigaChatSchedulerExecutionRole`
not existing at all — is only visible against the live account.

```bash
./scripts/provision-agent-journey.sh
```

### 1. All 9 tables exist and are ACTIVE

```bash
for t in journeys journey_executions journey_trigger_claims scheduled_actions \
         appointment_requests agents agent_binding_lookup gupshup_app_lookup \
         whatsapp_inbound_activity; do
  printf '%-32s %s\n' "$t" \
    "$(aws dynamodb describe-table --table-name "$t" --region ap-south-1 \
        --query 'Table.TableStatus' --output text 2>/dev/null || echo MISSING)"
done
```

Every line must read `ACTIVE`.

### 2. Both roles are trusted by the RIGHT principal

This is the check that matters most, and the one easiest to get wrong: the two
roles are near-identical apart from their trust principal, and swapping them
fails at runtime with an unhelpful `AccessDenied`.

```bash
aws iam get-role --role-name RigaChatSchedulerExecutionRole \
  --query 'Role.AssumeRolePolicyDocument.Statement[0].Principal.Service' --output text
# must print: scheduler.amazonaws.com

aws iam get-role --role-name RigaChatJourneyStateMachineRole \
  --query 'Role.AssumeRolePolicyDocument.Statement[0].Principal.Service' --output text
# must print: states.amazonaws.com
```

### 3. Env vars landed on all three Lambdas

```bash
for fn in rigachat-api rigachat-api-streaming rigachat-crawler; do
  echo "== $fn"
  aws lambda get-function-configuration --function-name "$fn" --region ap-south-1 \
    --query 'Environment.Variables' --output json \
    | jq 'with_entries(select(.key|test("JOURNEY|SCHEDUL|AGENT|GUPSHUP|WHATSAPP_INBOUND"))) | keys'
done
```

Expect 13 keys on each. **Do not add these as GitHub secrets** — `ci.yml`'s
env-var step merges a hardcoded allowlist and would silently ignore them.

### 4. End-to-end: publish a journey and watch a real state machine appear

The only check that exercises `iam:PassRole`, the trust policy and the ARN
together. Everything above can pass while this still fails.

1. In the dashboard, clone the real-estate template onto a bot
   (`POST /api/journeys/from-template/real-estate-lead-qualification-v1`).
2. Publish it.
3. Confirm a state machine now exists and has a published version:

```bash
aws stepfunctions list-state-machines --region ap-south-1 \
  --query "stateMachines[?starts_with(name, 'vyostra-')].[name,stateMachineArn]" --output table

aws stepfunctions list-state-machine-versions --region ap-south-1 \
  --state-machine-arn <arn from above> --query 'stateMachineVersions[].stateMachineVersionArn'
```

4. Confirm the bundle recorded the **version** arn, not just the state machine
   arn — ignition starts executions against the version, and a bundle with
   `compiledStateMachineVersionArn` unset will never ignite:

```bash
aws dynamodb scan --table-name journeys --region ap-south-1 \
  --query 'Items[].{name:name.S,version:publishedVersion.N,versionArn:compiledStateMachineVersionArn.S}' \
  --output table
```

5. Confirm the trigger claim was taken:

```bash
aws dynamodb scan --table-name journey_trigger_claims --region ap-south-1 --output table
```

### 5. Then run the Agent backfill

Only after the tables exist:

```bash
cd backend
TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm scripts/backfill-agents.ts
```

It is idempotent and conservative — it skips any client with more than one bot
or voice agent rather than guessing a pairing. A lead whose client has no Agent,
or more than one, resolves to `no_agent` / `ambiguous_agent` at ignition and is
recorded rather than silently dropped, so a partial backfill degrades visibly.
