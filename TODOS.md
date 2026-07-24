# TODOS

## Frontend

### Add error handling to data-load effects app-wide

**What:** 13 pages (including `DashboardHome.tsx`, `LeadsPage.tsx`, `BotsPage.tsx`, `BotDetailPage.tsx`, `FormDetailPage.tsx`, `FormsPage.tsx`, `KnowledgeBasePage.tsx`, `LeadDetailPage.tsx`, `FormLeadsPage.tsx`, `NewBotPage.tsx`, `VoiceKnowledgeBasePage.tsx`, `VoiceAgentDetailPage.tsx`, `AuthCallbackPage.tsx`) load data via `Promise.all([...]).then(...)` with no `.catch()`. A rejected fetch leaves `loading` stuck `true` forever — the user sees an infinite skeleton with no error message and no way to retry.

**Why:** Any transient API failure (network blip, 500, expired session) currently fails silently and permanently on these pages. Discovered via a test-coverage audit while shipping the dashboard redesign — verified it's the same pattern on all 13 pages, not something that branch introduced.

**Context:** Needs a shared pattern, not a one-off fix per page — e.g. a small `useAsyncData` hook or a top-level `ErrorBoundary` plus a per-page error state, applied consistently. Fixing just 1-2 pages in isolation would leave the rest inconsistent and this exact gap would just resurface next time someone touches one of the other 11.

**Effort:** M
**Priority:** P2
**Depends on:** None

### Point the remaining formatRelativeDate copies at the shared lib

**What:** `FormLeadsPage.tsx`, `KnowledgeBasePage.tsx`, and `VoiceKnowledgeBasePage.tsx` each still define their own local `formatRelativeDate`, identical to the one that used to live in `DashboardHome.tsx`/`LeadsPage.tsx` before the dashboard redesign branch extracted it to `frontend/src/lib/date.ts`. These 3 copies still have the original bug: a future-dated record (client/server clock drift) renders as `"-5 minutes ago"` instead of clamping to `"0 minutes ago"`.

**Why:** The fix already exists and is already in the codebase (`frontend/src/lib/date.ts`) — this is a pure find-and-replace (delete the local copy, import the shared one) plus getting the same bug fix for free in 3 more places.

**Context:** Low risk, mechanical. Deferred out of the dashboard-redesign PR because those 3 files were otherwise untouched by that branch and pulling them in would have been unrelated scope creep.

**Effort:** S
**Priority:** P3
**Depends on:** None

## Completed
