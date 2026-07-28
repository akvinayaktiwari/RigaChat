# Agents Reference

A reference list of every agent/skill available in this environment — both gstack skills (invoked as `/command`) and Claude Code's built-in subagents (invoked via the `Agent` tool). Kept here so it's easy to look up "what handles X" without re-deriving it each time.

## gstack skills

Invoked as slash commands (e.g. `/review`). If `SKILL_PREFIX` is enabled, use `/gstack-*` names instead.

### Planning / review
| Command | Purpose |
|---|---|
| `/spec` | Author a backlog-ready spec/issue |
| `/office-hours` | Product ideas / brainstorming |
| `/autoplan` | Full review pipeline |
| `/plan-ceo-review` | Strategy/scope review |
| `/plan-eng-review` | Architecture review |
| `/plan-design-review` | Infer/review a design system for an existing site |
| `/plan-devex-review` | Developer-experience review |
| `/plan-tune` | Tune plan decisions/preferences |
| `/review` | Code review / diff check against base branch |
| `/devex-review` | Developer experience review |
| `/health` | Project health check |
| `/investigate` | Debug bugs/errors |
| `/retro` | Retrospective |
| `/learn` | Record learnings |
| `/cso` | (chief-scaling/strategy-style review) |

### Design
| Command | Purpose |
|---|---|
| `/design-consultation` | Create `DESIGN.md` as the design source of truth (new projects) |
| `/design-shotgun` | Rapid design exploration |
| `/design-html` | HTML design mockups |
| `/design-review` | Visual polish review |

### Ship / deploy
| Command | Purpose |
|---|---|
| `/ship` | Full ship workflow: tests, coverage, review, version bump, push, PR |
| `/land-and-deploy` | Land + deploy |
| `/canary` | Canary deploy |
| `/landing-report` | Post-landing report |
| `/freeze` / `/unfreeze` | Freeze/unfreeze merges |
| `/guard` | Guard checks |
| `/careful` | Extra-cautious execution mode |
| `/benchmark` / `/benchmark-models` | Benchmarking |

### Browser / scraping
| Command | Purpose |
|---|---|
| `/browse` | All web browsing (use instead of `mcp__claude-in-chrome__*`) |
| `/connect-chrome` | Connect to Chrome |
| `/open-gstack-browser` | Open gstack's browser |
| `/pair-agent` | Pair-programming agent session |
| `/scrape` | Scrape a site |
| `/skillify` | Turn a workflow into a skill |
| `/setup-browser-cookies` | Set up browser cookies/auth |

### Docs / misc
| Command | Purpose |
|---|---|
| `/document-generate` | Generate documentation |
| `/document-release` | Release documentation |
| `/diagram` | Generate diagrams |
| `/make-pdf` | Generate a PDF |
| `/context-save` | Save progress/context |
| `/context-restore` | Resume saved context |

### QA
| Command | Purpose |
|---|---|
| `/qa` | QA / test site behavior |
| `/qa-only` | QA without other side effects |

### iOS
| Command | Purpose |
|---|---|
| `/ios-clean` | Clean iOS project |
| `/ios-design-review` | iOS design review |
| `/ios-fix` | Fix iOS issues |
| `/ios-qa` | iOS QA |
| `/ios-sync` | iOS sync |

### Setup / infra
| Command | Purpose |
|---|---|
| `/setup-deploy` | Set up deployment |
| `/setup-gbrain` | Set up gbrain (semantic code search) |
| `/sync-gbrain` | Refresh gbrain index |
| `/codex` | Codex integration |
| `/gstack` | gstack router — sends a request to the right skill |
| `/gstack-upgrade` | Upgrade gstack |

## Claude Code built-in subagents

Invoked via the `Agent` tool with `subagent_type`.

| Agent | Purpose | Tools |
|---|---|---|
| `claude` | Catch-all for tasks that don't fit a more specific agent | All |
| `claude-code-guide` | Questions about Claude Code CLI, Claude Agent SDK, Claude API, Claude Tag (Slack) | Bash, Read, WebFetch, WebSearch |
| `Explore` | Fast read-only code search — locate files/symbols, answer "where is X" | All except Agent, Artifact, ExitPlanMode, Edit, Write, NotebookEdit |
| `general-purpose` | Research complex questions, multi-step task execution | All |
| `Plan` | Software architect — designs implementation plans, identifies critical files and trade-offs | All except Agent, Artifact, ExitPlanMode, Edit, Write, NotebookEdit |
| `statusline-setup` | Configure the status line setting | Read, Edit |

## Notes

- gstack skills degrade gracefully if `bun` isn't installed (some sub-tools like `gstack-review-log`, `gstack-learnings-log`, `gstack-version-bump`, `gstack-redact` fail silently and are best-effort).
- Use `Explore` for quick/medium/thorough read-only searches; use `general-purpose` when a task also needs writes or multi-step execution.
- `/gstack` (the router skill) is the fallback when unsure which specific skill fits a request.
