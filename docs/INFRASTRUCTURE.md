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

## Voice relay (EC2) — marked TODO, not discoverable in-repo

The founder-memory primer describes this as EC2-hosted with PM2 + Caddy. A
repo-wide search for `pm2`, `caddy`, `ecosystem.config`, `Caddyfile`,
`*.service` (systemd units) found **nothing**. `backend/src/voice-relay/`
has the relay's TypeScript source and a build script
(`npm run build:relay` → `dist/voice-relay.js`), but no deploy step for that
artifact exists in `deploy.yml`, `scripts/deploy.sh`, or
`backend/scripts/deploy.js` — none of the three deploy paths touch the
voice relay at all.

**TODO for whoever maintains the EC2 host:** confirm and document instance
ID/AMI, PM2 process name, Caddy config (reverse proxy + TLS termination
presumably), and how `dist/voice-relay.js` actually gets onto that box today
(manual `scp`? a script not in this repo?). Also see
`backend/src/voice-relay/session.ts`'s own TODO comment — the relay's `.env`
on EC2 is missing `BACKEND_URL` entirely, currently papered over by a
hardcoded fallback in source (detailed in
[CHALLENGES.md](./CHALLENGES.md)).

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
