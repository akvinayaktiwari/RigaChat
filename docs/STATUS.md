# Status

> **Verification checklist:** this is a point-in-time snapshot —
> `git branch -a`, `git branch --merged main` / `--no-merged main`, and
> `git log --oneline -1` for each branch, all re-run immediately before this
> file was written. Re-run the same commands before trusting any of this;
> branch state is the fastest-rotting fact in the whole doc set.

**Generated at:** `main` @ `c0fe817` ("feat: add roadmap section (agents,
schedulers, journeys)"), 2026-07-20. `main` and `origin/main` are identical
(0 commits ahead/behind either direction) — everything below is already
pushed.

## Branches — 31 local, all but one already merged into `main`

```
NOT merged into main:
  chore/rebrand-vyostraai   @ d21157b  "chore: rebrand visible BeepBoop text to VyostraAI across frontend UI"
                            (6 days old as of generation — the rebrand is real work, sitting unmerged)

Merged into main (30, mostly stale — safe to prune after confirming no one has pending local work on them):
  bot-settings-ui                        feat/admin-console
  feat/customer-entitlements-ui           feat/entitlements-foundation
  feat/indexing-progress-ui               feat/newbotpage-botspage-migration
  feat/voice-agent-context                feat/voice-agent-kb-entries
  feat/voice-agent-optional-website       feat/voice-agent-rag
  feat/vyostra-logo                       feature/chatbot-optimization
  feature/crawler-optimization            feature/email-auth
  feature/embedding-optimization          feature/form-builder
  feature/kb-crawler-flow                 feature/landing-demo-chat
  feature/landing-page-redesign           feature/landing-page-ui
  feature/landing-pages                   feature/settings-ui
  feature/ui-improvements                 feature/voice-agent
  feature/whatsapp-automation             feature/whatsapp-webhooks
  feature/widget-redesign                 feature/zoho-integration
  fix/voice-agent-silence                 landing-page
  ui-improvements
```

12 of these also exist on `origin` (`bot-settings-ui`,
`feat/entitlements-foundation`, and 10 `feature/*` branches per
`git branch -a`'s `remotes/origin/*` list) — the rest are local-only.

## What "merged" means for the two most recently created branches

`feat/indexing-progress-ui` shows as merged because its own commits (the
`feat: extend indexing job contract` work and everything built on top of it
through `4246690` "feat: wire IndexingProgressCard into bot detail page")
landed on `main` before this doc set was generated — not because it was
trivially empty. Same logic for every other branch in the merged list: `git
branch --merged main` only means "no commits unique to this branch that
aren't also on `main`," which for a long-lived repo like this one usually
means "already merged and abandoned," not "never had real commits."

## The one thing actively diverged: the VyostraAI rebrand

`chore/rebrand-vyostraai` (`d21157b`) is the only unmerged branch, and it
lines up with several loose threads noticed elsewhere in this doc set:

- Both `package.json` `name` fields still say `beepboop-backend`/`beepboop-frontend` (v0.1.0)
- The live demo domain in the root README is `beepboop.drsyeta.in`
- `scripts/deploy.sh`'s default Cognito redirect URI is `https://beepboop.drsyeta.in/auth/callback`

All consistent with "the UI-visible rebrand happened, the infra/package
identity rebrand hasn't" — worth deciding whether to merge
`chore/rebrand-vyostraai` and finish the rename, or whether BeepBoop is
staying as the internal/infra name deliberately.

## Repo scale

273 total commits on `main` as of `c0fe817`. No `TODO`/`FIXME`/backlog file
found in-repo beyond the three inline code comments cited in
[CHALLENGES.md](./CHALLENGES.md) and two more UI-only ones
(`frontend/src/components/landing/TestimonialsSection.tsx` — placeholder
testimonials; `frontend/src/pages/Contact.tsx` — contact form not wired to
an email service).
