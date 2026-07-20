# Development Setup & Working Conventions

> **Verification checklist:** the "Architecture rules" section below is
> copied from the in-repo `/CLAUDE.md` — diff it against that file if this
> doc feels stale. The branch/commit convention section is derived from
> `git log --oneline` and `git branch -a` output, not from a style guide, so
> re-run those commands to confirm the patterns still hold before citing this
> doc as authoritative.

## Local dev

```bash
# Backend — nodemon watches src/ and index.ts, loads .env via --env-file
cd backend && npm install && npm run dev

# Frontend — Vite dev server
cd frontend && npm install && npm run dev
```

Backend `dev` script (`backend/package.json`):
```
TS_NODE_TRANSPILE_ONLY=true nodemon --watch src --watch index.ts --ext ts --exec "node --env-file=.env --loader ts-node/esm" index.ts
```
`TS_NODE_TRANSPILE_ONLY=true` means local dev does **not** type-check on
every reload — only `npm run build` (which runs `tsc --noEmit` first) and CI
actually catch type errors. Don't assume a clean `npm run dev` session means
the code type-checks.

`backend/index.ts` also starts a plain HTTP listener via `@hono/node-server`
when `NODE_ENV !== 'production'` (defaults to port 3000, or `$PORT`) — this
is how the same Hono `app` used in Lambda runs locally.

## Working conventions (from in-repo `CLAUDE.md`)

These are stated as "IMMUTABLE" in the project's own `CLAUDE.md`. Whether
the code fully honors them as of this writing is discussed in
[ARCHITECTURE.md](./ARCHITECTURE.md) and [SECURITY.md](./SECURITY.md) — a
few have visibly grown beyond the letter of the original rule (e.g. rule 6's
2-route public exception list; the actual public-route surface is much
larger — see [API_REFERENCE.md](./API_REFERENCE.md)).

1. Routes call services only — never a repository directly.
2. Services call repositories only — never DynamoDB/Pinecone directly.
3. Repositories call external services only (DynamoDB, Pinecone, OpenAI).
4. `MessageChannel` interface abstracts incoming messages; the web widget is
   one implementation, future channels (WhatsApp, voice) are new
   implementations, not special-cased branches.
5. Every Pinecone query must be scoped by `botId` — confirmed still true in
   `backend/src/repositories/vector-repository.ts`'s `similaritySearch()`,
   which always sets `filter: { botId: { $eq: namespaceId } }`.
6. All routes except `/api/chat` and `/api/bots/:id/config` require Cognito
   JWT auth — **outdated as literally stated**; see API_REFERENCE.md for the
   real (larger) public surface.

TypeScript strict mode, no `any`, kebab-case filenames, camelCase
vars/functions, PascalCase types — all still visibly true across the files
read for this doc set.

## Branch naming (as observed, not as prescribed)

`git branch -a` shows two competing prefixes in active use:
`feat/*` (12 branches: `feat/admin-console`, `feat/entitlements-foundation`,
`feat/indexing-progress-ui`, `feat/voice-agent-rag`, etc.) and `feature/*`
(15 branches: `feature/voice-agent`, `feature/whatsapp-automation`, etc.),
plus a handful with no prefix at all (`landing-page`, `ui-improvements`,
`bot-settings-ui`). `feat/*` is the more recent pattern based on commit
recency — if you're starting new work, follow that one, but neither is
enforced anywhere (no branch-name lint, no CI check).

## Commit conventions

In-repo `CLAUDE.md` states explicitly:

```
After every completed and tested feature, run:
  git add .
  git commit -m "<type>: <short description>"
Types: feat | fix | chore | refactor
Never commit: broken/untested code, .env files, node_modules/, dist/
```

`git log --oneline` confirms this is actually followed — the large majority
of the 273 commits on `main` use `feat:`, `fix:`, or `chore:` prefixes. Some
don't (`bbd7b50 payment provider instead of Razorpay` has no type prefix) —
rare exceptions, not the norm.

No `CONTRIBUTING.md` existed in the repo before this doc set — see
[CONTRIBUTING.md](./CONTRIBUTING.md) for the fuller writeup.
