# Infrastructure

> **Verification checklist:** every identifier below is copied verbatim from
> `scripts/deploy.sh`'s default fallback values (lines 6-19) or
> `.github/workflows/deploy.yml`'s secret/var references — none were
> guessed. Anything not found in-repo is marked TODO rather than filled in
> from the founder-memory primer. Re-read `scripts/deploy.sh` directly if
> these values might have changed, since defaults in a script are exactly
> the kind of thing that drifts silently from real infra.

## Real AWS resource identifiers found in-repo

From `scripts/deploy.sh`'s default env values (region `ap-south-1` unless overridden):

```
Lambda functions:
  rigachat-api               (main, BUFFERED Function URL)
  rigachat-api-streaming     (RESPONSE_STREAM Function URL)
  rigachat-crawler           (SQS-triggered)

S3 buckets:
  rigachat-dashboard   (frontend app)
  rigachat-widget      (widget.js, form-widget.js, voice-widget.js)

CloudFront distributions:
  E24Z9D4G4FY8PH   (dashboard)
  E2KNENIBJEZYTF   (widget CDN)

Backend URL (main Lambda's Function URL):
  https://hxtvyv6kgsasppyrvyljaezeii0zxzco.lambda-url.ap-south-1.on.aws

Cognito (customer pool):
  domain:     ap-south-1d7y7lw8aj.auth.ap-south-1.amazoncognito.com
  client id:  bia5g9e6gsb3h9n191rcvkugn
  redirect:   https://beepboop.drsyeta.in/auth/callback

CDN:
  https://d30yf1mzs1yo7h.cloudfront.net        (widget CDN, matches widget CloudFront dist above)
  https://d1gaddygcav1ob.cloudfront.net         (dashboard, printed in deploy.sh's final summary — not in its env var list)
```

`.github/workflows/deploy.yml` references these same resources but by
**GitHub Actions secret/var name** rather than literal value
(`LAMBDA_FUNCTION_NAME`, `LAMBDA_STREAMING_FUNCTION_NAME`,
`LAMBDA_CRAWLER_FUNCTION_NAME`, `S3_BUCKET_FRONTEND`, `S3_BUCKET_WIDGET`,
`CLOUDFRONT_DISTRIBUTION_ID`, `CLOUDFRONT_WIDGET_DISTRIBUTION_ID`,
`BACKEND_URL`, `VOICE_WS_URL`) — the actual values live in the GitHub repo's
Actions secrets/variables settings, not in any file, so they can't be
confirmed to still match the `deploy.sh` defaults above from the repo alone.

## Additional AWS services referenced (via env vars, no IaC found)

```
DynamoDB   — 9 tables, see ARCHITECTURE.md; no CloudFormation/CDK/Terraform in repo defining them
SQS        — one queue, SQS_CRAWLER_QUEUE_URL, feeds the crawler Lambda
KMS        — one key, WHATSAPP_KMS_KEY_ID, for WhatsApp API key envelope encryption
EventBridge Scheduler — invokes the main Lambda bundle directly for the weekly WhatsApp report cron (no schedule expression or rule name found in-repo)
```

No `.tf`, `cdk.json`, `template.yaml`/`serverless.yml`, or any other
infra-as-code file exists anywhere in this repo. All of the above appears to
be provisioned by hand in the AWS console (or in tooling outside this
repo) — there is no in-repo source of truth for e.g. DynamoDB table
capacity mode, IAM role policies attached to any of the three Lambdas, or
VPC/subnet config.

## Voice relay (EC2)

Discovered from AWS on 2026-09-06 and recorded here because it was previously
a TODO in this file — the repo had no record of the host at all, while a relay
was demonstrably serving live browser voice calls.

**This repo is public, so the identifiers stay out of it.** Resolve them
yourself; the box is tagged, so nothing here needs hardcoding:

```bash
aws ec2 describe-instances --region ap-south-1 \
  --filters "Name=tag:Name,Values=vyostra-voice-relay" \
             "Name=instance-state-name,Values=running" \
  --query 'Reservations[].Instances[].{Id:InstanceId,Ip:PublicIpAddress,Sg:SecurityGroups[].GroupId}'
```

```
Tag          vyostra-voice-relay
Type         t4g.small (arm64 — Graviton, so anything native must build for it)
OS           Ubuntu 24.04 LTS arm64 (Canonical)
Launched     2026-07-16
Role         vyostra-voice-relay-role
Public IP    not an Elastic IP — it changes on stop/start, so verify before
             pinning DNS at it
```

**Security-group review is outstanding.** The relay's inbound rules are wider
than a box running one service on one port needs. Check them against what it
actually serves (443 in front of 3100) and close the rest — the SSM deploy path
below exists partly so that shutting the remainder costs nothing.

The relay listens on **port 3100** (`voice-relay/server.ts`), so something in
front of it terminates TLS and proxies 443 → 3100. The primer says Caddy + PM2;
still unverified from outside the box.

### Deploying the relay

`npm run build:relay` produces `backend/dist/voice-relay.js`. Until 2026-09-06
nothing shipped it — not `scripts/deploy.sh`, not `backend/scripts/deploy.js`,
not CI — so whatever runs on that box was put there by hand.

```bash
./scripts/provision-voice-relay-ssm.sh     # once: enable SSM + artifact bucket
./scripts/deploy-voice-relay.sh --probe    # learn the box's actual layout
./scripts/deploy-voice-relay.sh            # build, ship, restart, verify
```

SSM Run Command rather than SSH: no long-lived private key in a CI secret for
a box with port 22 open to the world, and every command is logged. The agent
ships preinstalled on Canonical's Ubuntu 24.04 images and registers once the
instance profile carries `AmazonSSMManagedInstanceCore`. The 3.5MB bundle
travels via a private, versioned S3 bucket, because a Run Command parameter
cannot carry it.

**Confirmed layout** (from `--probe`, 2026-09-07 — every value guessed from the
primer beforehand was wrong):

```
bundle        /home/ubuntu/voice-relay.js
env           /home/ubuntu/.env
pm2 config    /home/ubuntu/ecosystem.config.js
supervisor    PM2 v7.0.3, app "voice-relay", owned by ubuntu (/home/ubuntu/.pm2)
boot          pm2-ubuntu.service enabled — it does come back after a reboot
proxy         Caddy
deps          node_modules in /home/ubuntu; @aws-sdk/* is external to the bundle
```

`RUN_AS` matters more than it looks. SSM runs commands as **root**, and PM2 keeps
a per-user registry — so `pm2 restart voice-relay` as root finds no such app,
exits 0 having done nothing, and leaves the old code serving while a health check
answers 200 from the process that never restarted. The script runs PM2 as the
owner and verifies the **PID changed**, because an exit code and a 200 both lie
here.

**The bundle's external dependencies are a live trap.** `build:relay` externalises
`@aws-sdk/*`, so those resolve from the box's own `node_modules`. Telephony grew
the bundle from 144KB to 3.5MB and added four SDK clients — `kms`, `sesv2`, `sfn`,
`sqs` — that the box did not have. They are required at load, so deploying without
them crashes the relay into a PM2 restart loop and takes **browser** voice down
too. Installed on 2026-09-07 at the versions `backend/package.json` pins; the
running process was not restarted, so it still serves the old bundle.

The deploy script now resolves every bare specifier in the bundle against the box
before shipping anything, and refuses if one is missing. `TODOS.md` records why
the import graph grew — the check is a guard, not the fix.

**The relay's own `package.json` lives only on that box** and is not in this repo,
so the dependency list has no source of truth outside the instance. Worth
correcting the next time the relay's build is touched.

**Restarting drops every call in progress.** Sessions are held in memory in one
Node process — no draining, nothing to fail over to. The script confirms before
restarting unless given `--yes`, keeps the previous bundle on the box as
`voice-relay.js.prev`, and prints the one-line rollback.

### IAM: read-only, which is not what telephony needs

The role carries `AmazonDynamoDBReadOnlyAccess` plus one inline policy
(`voice-call-logs-write`) allowing `PutItem` on `voice_call_logs` alone. That
was correct when the relay only answered browser calls and wrote one billing
row per call.

The telephony path writes far more than that — `voice_leads`, `lead_events`,
`lead_state` — and every one of those is currently denied. Critically it fails
**silently**: `VoiceSession.resolveIdentity` and `withIdentity` swallow CRM
errors on purpose, so that a DynamoDB problem can never drop a live call. The
observable result of the missing permissions is a phone that rings, an agent
that answers, and a CRM that stays empty with nothing logged as wrong.

Fix: `scripts/provision-voice-relay-iam.sh`. Restart the relay process after
running it — the SDK caches instance-role credentials for the process
lifetime.

### Environment on the box

The relay reads its own `.env`, separate from the Lambda's. Required:
`AWS_REGION`, `VOICE_AUTH_SECRET`, `OPENAI_API_KEY`. For telephony, also
`PLIVO_AUTH_TOKEN` and `VOICE_RELAY_PUBLIC_HOST` (both absent = telephony off
and every Plivo endpoint answers 503 — fail-closed by design),
`PLIVO_AUTH_ID` (absent = transfer disabled, inbound answering unaffected),
and optionally `VOICE_MAX_CONCURRENT_CALLS` (default 10).

`BACKEND_URL` is still missing there, which is why `session.ts` carries a
hardcoded Lambda Function URL as a fallback for its RAG calls. See
[CHALLENGES.md](./CHALLENGES.md).

## Third-party managed services (external, not AWS)

```
OpenAI          — GPT-4o-mini (chat), Realtime API model 'gpt-realtime' (voice)
Pinecone        — vector DB, one index (PINECONE_INDEX_NAME), namespaced per-bot
Upstash Redis   — REDIS_PROVIDER + UPSTASH_REDIS_REST_URL/TOKEN, likely the cache-service.ts layer
Gupshup         — WhatsApp Business API provider
Zoho CRM        — optional customer-side CRM sync
```

No infra-as-code or provisioning record for any of these exists in-repo
either — all configured via env vars against externally-managed accounts.
