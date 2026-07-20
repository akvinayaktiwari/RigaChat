# Install & Environment Setup

> **Verification checklist:** re-run the two grep commands below against
> `backend/src` and `frontend/src` — this list was generated from their
> output on 2026-07-20 and will silently go stale as code changes:
> `grep -rhoE "process\.env\.[A-Z_0-9]+|process\.env\[[A-Za-z]+\]" backend/src backend/index.ts`
> and `grep -rhoE "requireEnv\('[A-Z_0-9]+'\)" backend/src` (the latter
> catches vars read through the `requireEnv()` helper, which the first
> pattern misses) plus `grep -rhoE "import\.meta\.env\.[A-Z_0-9]+" frontend/src`.

## Prerequisites

- Node.js **22.x** (pinned in both `.github/workflows/ci.yml` and `deploy.yml` via `actions/setup-node`)
- npm (repo uses `package-lock.json`, CI runs `npm ci`)
- AWS CLI + credentials, if you intend to run `scripts/deploy.sh` or `backend/scripts/deploy.js` locally

## Backend environment variables

The **root `CLAUDE.md`'s env var list is out of date** — it lists 10 vars;
the code actually reads 24 direct `process.env.X` references plus 4 more
through a `requireEnv()` helper (`backend/src/providers/zoho-provider.ts`,
`backend/src/lib/kms.ts`) that a naive grep for `process.env.` misses entirely.

Direct `process.env.*` reads:

```
ADMIN_CONSOLE_ORIGIN          AWS_REGION                     BACKEND_URL
COGNITO_CLIENT_ID             COGNITO_USER_POOL_ID           DYNAMODB_TABLE_BOTS
DYNAMODB_TABLE_CLIENTS        DYNAMODB_TABLE_CONVERSATIONS   DYNAMODB_TABLE_KB
DYNAMODB_TABLE_LEADS          DYNAMODB_TABLE_SUBSCRIPTIONS   DYNAMODB_TABLE_VOICE_AGENTS
FRONTEND_URL                  NODE_ENV                       OPENAI_API_KEY
PINECONE_API_KEY              PINECONE_INDEX_NAME            PORT
REDIS_PROVIDER                SQS_CRAWLER_QUEUE_URL          STAFF_COGNITO_CLIENT_ID
STAFF_COGNITO_USER_POOL_ID    UPSTASH_REDIS_REST_TOKEN       UPSTASH_REDIS_REST_URL
VOICE_AUTH_SECRET
```

Read via `process.env[dynamicName]` in `backend/src/repositories/voice-repository.ts` (table names built from constants, not literal `process.env.X`, hence invisible to a literal grep):

```
DYNAMODB_TABLE_VOICE_CALL_LOGS   DYNAMODB_TABLE_VOICE_KB
```

Read via `requireEnv('NAME')` — **these throw at module load time if unset**,
not lazily on first use (see [SECURITY.md](./SECURITY.md) for why that matters
for the crawler Lambda specifically):

```
WHATSAPP_KMS_KEY_ID   ZOHO_CLIENT_ID   ZOHO_CLIENT_SECRET   ZOHO_REDIRECT_URI
```

`.env` (git-ignored, confirmed via `.gitignore`) is loaded by
`npm run dev`'s `--env-file=.env` flag. There's no `.env.example` in the
repo as of this writing — TODO, worth adding one from the list above.

## Frontend environment variables (Vite, build-time)

```
VITE_API_URL                  VITE_CDN_URL                  VITE_COGNITO_CLIENT_ID
VITE_COGNITO_DOMAIN           VITE_COGNITO_REDIRECT_URI     VITE_COGNITO_REGION
VITE_STAFF_COGNITO_CLIENT_ID  VITE_STAFF_COGNITO_REGION
```

(`import.meta.env.DEV` is also referenced but is a Vite built-in, not one you set.)

Note `VITE_COGNITO_REGION` and `VITE_STAFF_COGNITO_REGION` are read by the
frontend but **not** passed as build env vars in `ci.yml`'s frontend job —
only `VITE_API_URL`, `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`,
`VITE_COGNITO_REDIRECT_URI`, and `VITE_CDN_URL` are. `deploy.yml`'s frontend
job does pass `VITE_STAFF_COGNITO_CLIENT_ID`/`VITE_STAFF_COGNITO_REGION` (per
commits `2d95343`/`009878d`/`d297c13`, three separate "trigger rebuild"
commits — see [CHALLENGES.md](./CHALLENGES.md)) but still not
`VITE_COGNITO_REGION`. Whether that's an intentional omission (falls back to
a default in code) or a gap wasn't verified — check
`frontend/src/lib/` or wherever the Cognito client is constructed before
assuming either way.

## Install & build

```bash
cd backend && npm install && npm run build
cd frontend && npm install && npm run build
```

Both `npm run build` commands are what `ci.yml` runs on every push/PR — if
they pass locally they'll pass CI's type-check + build gate (CI runs no
tests beyond that; see [TESTING.md](./TESTING.md)).
