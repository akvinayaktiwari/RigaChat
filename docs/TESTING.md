# Testing

> **Verification checklist:** "no test suite exists" is a claim about
> absence, which is easy to get wrong by under-searching. Re-run before
> trusting this doc:
> `find . -type f \( -name "*.test.ts" -o -name "*.spec.ts" \) -not -path "*/node_modules/*"`
> and `find . -type d -name "__tests__" -not -path "*/node_modules/*"`,
> both from repo root. Both returned nothing on 2026-07-20.

## What exists

**No automated test suite.** No `*.test.ts`, `*.spec.ts`, or `__tests__/`
directory anywhere in `backend/` or `frontend/`. Neither `package.json` has
a test runner as a dependency (no Jest, Vitest, Mocha, Playwright test
runner, etc.) and neither has a `"test"` script.

## What CI actually runs

`.github/workflows/ci.yml`, triggered on every push to any branch and every
PR into `main` — two parallel jobs, both **type-check + build only**:

```yaml
check-backend:
  - npm ci
  - npx tsc --noEmit
  - npm run build          # runs tsc --noEmit again, then esbuild

check-frontend:
  - npm ci
  - npx tsc --noEmit
  - npm run build           # vite build, with a partial set of VITE_* env vars
```

No lint step, no unit tests, no integration tests, no E2E. Whether `ci.yml`
is configured as a required check in GitHub's branch protection settings
isn't determinable from the repo — that's GitHub repo configuration, not a
file — so it wasn't verified for this doc set whether a PR can currently
merge into `main` with CI red.

## What "tested" means in practice today

The in-repo `CLAUDE.md`'s commit rule says to commit "after every completed
**and tested** feature" and lists "Never commit: broken or untested code."
There's no automated gate enforcing that beyond `tsc --noEmit` catching type
errors — "tested" currently means manual verification by whoever's driving
(this doc set's own generation prompt, and prior sessions' verification
reports in this repo's history, both lean on `npx tsc --noEmit` passing plus
a manual walkthrough, not an automated suite).

## What this means for `/docs` accuracy

Because there's no test suite asserting behavior, several of the
architecture and API claims in this doc set were verified by reading source
directly rather than by pointing at a passing test — see the verification
checklists at the top of each file for exactly what was and wasn't checked
this way. If you add tests later, they become a stronger source of truth
than these docs for anything they cover.
