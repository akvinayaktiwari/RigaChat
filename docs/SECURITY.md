# Security

> **Verification checklist:** the auth-isolation claims are grounded in
> `backend/src/lib/cognito.ts` / `cognito-staff.ts` / `admin-routes.ts:19`
> and `backend/src/routes/index.ts`'s CORS block. The cold-start risk below
> is explicitly **unverified** — it depends on the crawler Lambda's actual
> AWS console env config, which isn't visible from this repo. Don't repeat
> it as a confirmed bug without checking AWS directly.

## Auth isolation: two separate Cognito pools

- **Customer auth**: `COGNITO_USER_POOL_ID` / `COGNITO_CLIENT_ID`, enforced via `requireAuth` (`backend/src/lib/cognito.ts`), applied per-route across `bot-routes.ts`, `client-routes.ts`, `form-routes.ts`, `kb-routes.ts`, `lead-routes.ts`, `voice-routes.ts`, `integration-routes.ts`. `clientId` always derives from `c.get('user').sub` — the JWT — never a request body field (explicit code comment in `client-routes.ts`).
- **Staff/admin auth**: `STAFF_COGNITO_USER_POOL_ID` / `STAFF_COGNITO_CLIENT_ID`, a fully separate pool, enforced via `requireStaffAuth` (`backend/src/lib/cognito-staff.ts`), applied once at router level for all of `/api/admin/*` (`adminRoutes.use('*', requireStaffAuth)`, `admin-routes.ts:19`) rather than per-route — so every route added to that file is covered automatically.

These pools don't just gate different routes — they're backed by different
env vars end-to-end, frontend included (`VITE_STAFF_COGNITO_CLIENT_ID` /
`VITE_STAFF_COGNITO_REGION` vs. `VITE_COGNITO_CLIENT_ID` /
`VITE_COGNITO_REGION`), so a customer session token can't be reused against
`/api/admin/*` even if someone tried to just skip `requireStaffAuth`'s
issuer check.

## CORS as a security boundary, not just a convenience

Three configs (`dashboardCors`, `widgetCors`, `adminCors`) — see
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full breakdown. The one
security-relevant detail worth repeating here: for any mount serving both
public and authenticated paths, the code dispatches to exactly one CORS
middleware per request rather than registering two, specifically because
Hono's `cors()` only ever adds headers, never removes them — two
overlapping registrations on the same path would let the credentialed
dashboard config's `Access-Control-Allow-Credentials: true` leak onto a
wildcard-origin public route. This is called out explicitly in the code's
own comments as a deliberate anti-leak measure, not an accident of
structure.

## Secrets handling

- WhatsApp API keys: KMS envelope encryption via `backend/src/lib/kms.ts` (`WHATSAPP_KMS_KEY_ID`), not stored plaintext.
- Zoho OAuth credentials, all other API keys (`OPENAI_API_KEY`, `PINECONE_API_KEY`, `UPSTASH_REDIS_REST_TOKEN`, etc.): env vars only, no hardcoded literals found in `backend/src` during this review (not an exhaustive secret-scan — no tool like `gitleaks`/`trufflehog` is wired into CI).
- `scripts/deploy.sh` does hardcode several **non-secret** infra identifiers as fallback defaults (Lambda names, S3 bucket names, CloudFront distribution IDs, a Cognito **client ID**, a Cognito domain, CDN URLs) — Cognito client IDs are not secrets in the OAuth sense (they're already public in the frontend bundle via `VITE_COGNITO_CLIENT_ID`), but flagging so nobody mistakes committing them for a leak. Full list in [INFRASTRUCTURE.md](./INFRASTRUCTURE.md).
- No `.env.example` exists — see [INSTALL.md](./INSTALL.md).

## Unverified risk: crawler Lambda module-init env gap

`backend/src/providers/zoho-provider.ts` calls `requireEnv('ZOHO_CLIENT_ID')`
etc. at **module top level** — meaning these run unconditionally at cold
start for whichever Lambda loads the bundle, not lazily when a Zoho route is
actually hit. Because `backend/index.ts` unconditionally imports the full
Hono `app` (which reaches every route file, including the one that
transitively imports `zoho-provider.ts`), this executes identically on all
three Lambdas — main, streaming, **and crawler**.

`.github/workflows/deploy.yml`'s env-update step for the crawler Lambda only
explicitly merges in `SQS_CRAWLER_QUEUE_URL` and
`LAMBDA_CRAWLER_FUNCTION_NAME` — it never lists `ZOHO_CLIENT_ID`,
`ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`, or `WHATSAPP_KMS_KEY_ID`. Whether
those are already present on that Lambda's configuration (set once manually
in the AWS console, and thus untouched-but-present since this workflow only
merges, never replaces) **cannot be determined from this repo**. If they're
absent, the crawler Lambda would throw at every cold start, for every
crawl/index job — a total outage of the crawler, not a degraded Zoho
feature. If you're debugging crawler Lambda cold-start failures, check this
first via `aws lambda get-function-configuration --function-name
rigachat-crawler` before looking elsewhere.

## No security scanning in CI

`ci.yml` runs `tsc --noEmit` + build only — no `npm audit`, no dependency
vulnerability scanning, no SAST tooling wired into either workflow.
