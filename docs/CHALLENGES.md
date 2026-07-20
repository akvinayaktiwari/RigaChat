# Challenges — Problems Faced and How They Were Solved

> **Verification checklist:** every entry below cites a commit hash or a
> source file/line for its root cause and fix — re-run `git show <hash>` to
> confirm before trusting the summary. Two entries are **open, not
> resolved** — marked explicitly as such rather than force-fit into a
> "fixed" narrative. Nothing here is editorialized beyond what the commit
> message, diff, or code comment itself states.

## Resolved

### Double-triggered voice-agent indexing jobs

**Commit:** `6dc7593` — "fix: remove redundant frontend setupVoiceAgent call
causing double-triggered indexing jobs"

**Root cause:** `frontend/src/pages/NewVoiceAgentPage.tsx` was calling
`setupVoiceAgent` a second, redundant time, causing the crawler to be
triggered twice for a single new agent.

**Fix:** `crawler-worker-service.ts` gained a 17-line guard;
`NewVoiceAgentPage.tsx` had the redundant call removed (8 lines → 1);
`frontend/src/services/api.ts` picked up a corresponding 7-line change.
Directly upstream of the same indexing-job pipeline extended by this
session's `feat/indexing-progress-ui` branch.

### Retired the `rigachat-voice-ws` Lambda

**Commit:** `edf0e33` — "fix: remove deleted rigachat-voice-ws Lambda from
GitHub Actions workflow"

**Root cause:** a fourth Lambda function, `rigachat-voice-ws`, previously
existed in the deploy workflow. It was deleted as an AWS resource but the
GitHub Actions workflow still referenced it.

**Fix:** removed from `deploy.yml`. This is the point at which voice call
relaying moved off Lambda entirely, onto the EC2-hosted relay described in
[ARCHITECTURE.md](./ARCHITECTURE.md) — a real architecture pivot, not just a
cleanup commit.

### A cluster of voice-agent Realtime API fixes (chronological, same subsystem)

Not individually root-caused in this pass (would need each diff read in
full), but worth listing together since they show the voice feature's
integration with OpenAI's Realtime API needed multiple corrective passes:

- `df8cff3` — "add audioContext.resume and remove client-side barge-in for voice agent" (branch `fix/voice-agent-silence`)
- `afb9f2d` — "remove voice from applyContext session.update to prevent race condition"
- `8d78891` — "update VoiceAgentVoice type to OpenAI Realtime GA supported values" — suggests this was built against a beta/preview version of the Realtime API before GA changed the accepted voice enum
- `6135e80` — "key activeSessions by connectionId to support concurrent calls to same agent"
- `1fc78ad` — "use object format spec for session.audio in Realtime GA"

### Entitlement-gate UI flash

**Commit:** `85d5e1f` — "fix: eliminate loading-state flash on bots/voice-agents entitlement gates"

Part of the entitlements-foundation work (`feat/entitlements-foundation`,
merged) — a UI-only fix once entitlement checks started gating bot/voice-agent
creation.

## Open — not yet resolved

### EC2 voice relay is missing `BACKEND_URL` in its own `.env`

**Source:** `backend/src/voice-relay/session.ts`, inline comment above
`FALLBACK_BACKEND_URL`:

> `// TODO: add BACKEND_URL to the EC2 .env — it is not set there today. This is the current Lambda function URL (from scripts/deploy.sh) used as a fallback until the env var exists.`

**Current state:** the relay hardcodes the main Lambda's Function URL as a
fallback constant (`https://hxtvyv6kgsasppyrvyljaezeii0zxzco.lambda-url.ap-south-1.on.aws`)
so the `search_knowledge_base` tool keeps working. This is a real
maintenance risk: if that Lambda's Function URL ever changes (e.g. the
function is recreated), this fallback silently goes stale and nothing in
CI or the deploy pipeline would catch it, since the EC2 relay isn't part of
any deploy workflow (see [INFRASTRUCTURE.md](./INFRASTRUCTURE.md)). Not
fixed as part of this doc-generation task, per its own constraints (no
functional changes) — flagged here as-is.

### RAG similarity threshold: documented value doesn't match shipped value

**Where:** in-repo `CLAUDE.md`'s "RAG quality standards" section states
`Similarity threshold: 0.7`. The actual constant,
`MIN_SIMILARITY_SCORE` in `backend/src/repositories/vector-repository.ts:10`,
is `0.2`.

**Not resolved here because:** it's genuinely ambiguous from the repo alone
which is correct — `0.7` might be the intended target that was never
implemented, or `0.2` might be a deliberate, later-loosened value where
`CLAUDE.md` just wasn't updated (the other three RAG constants — topK,
candidate pool, MMR lambda — all do match `CLAUDE.md` exactly, which weakly
suggests this one field is the odd one out and possibly a documentation
miss rather than an intentional gap, but that's an inference, not a
confirmed fact). Whoever owns retrieval quality should confirm intent
before either the code or the doc gets changed.

## Stale, not a "problem" per se, but adjacent

### `backend/scripts/deploy.js` never learned about the crawler Lambda

Not from a bug report or incident — just discovered while grounding
[DEPLOYMENT.md](./DEPLOYMENT.md) for this doc set: `npm run deploy` (the
backend's own convenience script) only deploys the main and streaming
Lambdas, predating the crawler Lambda split. It's not broken in the sense of
throwing an error; it just silently deploys less than someone running it
might expect. See DEPLOYMENT.md for the full detail and current workarounds
(use `deploy.yml` or `scripts/deploy.sh` instead).
