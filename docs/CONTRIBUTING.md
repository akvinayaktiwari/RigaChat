# Contributing

> **Verification checklist:** everything here is descriptive (what's
> observed in `git log`/`git branch -a`), not prescriptive policy invented
> for this doc. Re-run `git log --oneline | head -50` and
> `git branch -a` to confirm the patterns still hold.

## Commit messages

Stated project rule (in-repo `CLAUDE.md`): commit after every completed and
tested feature, using `<type>: <short description>`, types being `feat`,
`fix`, `chore`, `refactor`. `git log` confirms this is the actual norm
across the great majority of the repo's 273 commits — e.g.
`fix: eliminate loading-state flash on bots/voice-agents entitlement gates`,
`feat: entitlements foundation — subscriptions, usage tracking, and
cost-surface enforcement`, `chore: trigger frontend rebuild with staff
cognito vars`.

Exceptions exist — e.g. `bbd7b50 payment provider instead of Razorpay` has
no type prefix — rare enough to treat as the exception, not a second valid
style.

Never commit (stated rule, matches `.gitignore`): `.env`/`.env.local`,
`node_modules/`, `dist/`.

## Branch naming

Two prefixes are both in live use — see [DEV_SETUP.md](./DEV_SETUP.md) for
the full breakdown (`feat/*` ×12, `feature/*` ×15, unprefixed ×3). `feat/*`
is the more recent convention by commit recency; prefer it for new branches,
but nothing enforces either.

## Before opening a PR / merging to `main`

`ci.yml` runs on every push and on PRs into `main`: `npx tsc --noEmit` +
build, for both `backend/` and `frontend/`. Run both locally before pushing:

```bash
cd backend && npx tsc --noEmit && npm run build
cd frontend && npx tsc --noEmit && npm run build
```

There is no automated test suite to run (see [TESTING.md](./TESTING.md)) —
manual verification is the only gate beyond type-checking today.

## Deploying

`main` auto-deploys on push via `deploy.yml` — merging to `main` is a
production deploy, not just a merge. See [DEPLOYMENT.md](./DEPLOYMENT.md),
especially the warning about `backend/scripts/deploy.js` (`npm run deploy`)
being a stale, incomplete alternative to the real pipeline.

## License

No `LICENSE` file exists in the repo root as of this writing — TODO if the
project intends to be open source (the root README's public GitHub badges
suggest it might be) or needs an explicit proprietary notice otherwise.
