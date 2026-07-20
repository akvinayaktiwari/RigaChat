# VyostraAI / RigaChat — Developer Overview

> **Verification checklist for maintainers:** confirm `backend/package.json`
> and `frontend/package.json` scripts still match the Quickstart below;
> confirm the feature list against `backend/src/routes/index.ts`'s
> `app.route(...)` calls; re-run `git log --oneline -1` to confirm this repo
> still matches the commit this was generated at (`c0fe817`).

A SaaS platform that lets clients embed an AI chatbot (and, as of the
`feat/voice-agent-rag` work, a voice agent) on their website, trained on
their site content and a custom knowledge base, with captured leads landing
in a built-in CRM. See the root [`/README.md`](../README.md) for the
marketing-facing pitch; this file and the rest of `/docs` are for people
working on the code.

Product is branded **VyostraAI** in the UI and root README, but the repo
(`akvinayaktiwari/RigaChat`), both `package.json` `name` fields
(`beepboop-backend`, `beepboop-frontend`), and the live demo domain
(`beepboop.drsyeta.in`) still say **BeepBoop** — the rebrand
(`chore/rebrand-vyostraai`, commit `d21157b`) is real but not fully merged
or propagated. See [STATUS.md](./STATUS.md).

## What's actually implemented (not roadmap)

Grounded in `backend/src/routes/index.ts` and `backend/src/services/`:

- Website crawling → chunking → embedding → Pinecone, scoped per-bot ([ARCHITECTURE.md](./ARCHITECTURE.md#rag-pipeline))
- Chat widget with streaming responses (`/api/chat/message`, dedicated streaming Lambda)
- Lead capture, both from the chat widget and from standalone forms (`form-widget.js`)
- A built-in CRM/leads dashboard, plus optional Zoho CRM sync (`integration-routes.ts`, `zoho-provider.ts`)
- WhatsApp integration via Gupshup, including a weekly-report cron (EventBridge → Lambda)
- Voice agents on the OpenAI Realtime API (`gpt-realtime`), relayed through an EC2-hosted WS server, with the same RAG pipeline available as a function-calling tool
- Plan/entitlements system (trial, free/starter/growth/agency tiers, usage tracking) — `backend/src/config/entitlements-config.ts`
- A separate internal admin console with its own Cognito pool (`admin-routes.ts`, `cognito-staff.ts`)

## Quickstart

Commands below are copied verbatim from `backend/package.json` /
`frontend/package.json` — not idealized.

```bash
# Backend
cd backend && npm install
npm run dev       # nodemon + ts-node/esm, loads ./.env, watches src/
npm run build     # tsc --noEmit, then esbuild bundle to dist/index.js
npm run deploy     # build + node scripts/deploy.js — CAUTION, see DEPLOYMENT.md

# Frontend
cd frontend && npm install
npm run dev        # vite dev server
npm run build       # vite build -> dist/
```

Full env var list (33 backend vars, 9 frontend `VITE_*` vars, none of which
match the shorter list in the root `CLAUDE.md`) is in [INSTALL.md](./INSTALL.md).

## Where to go next

- New to the repo → [DEV_SETUP.md](./DEV_SETUP.md)
- Need a route's auth requirement → [API_REFERENCE.md](./API_REFERENCE.md)
- Deploying → [DEPLOYMENT.md](./DEPLOYMENT.md) (read this before running `npm run deploy` — it's stale)
- "Why does X work this way" → [ARCHITECTURE.md](./ARCHITECTURE.md) or [CHALLENGES.md](./CHALLENGES.md)
