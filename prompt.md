# RigaChat — Build Prompts

This is a running log of the prompts and task details used to build this project, in
chronological order. Steps 1–4 are reconstructed from an earlier conversation summary
(exact original wording wasn't preserved); everything from Step 5 onward is verbatim.

---

## Phase 1: Backend & Infrastructure Scaffolding

### Step 1 — Scaffold backend and frontend
Scaffold the backend (Node/TypeScript/Hono/Lambda) and frontend (React/TypeScript/Vite)
folder structures, configs, and `.env.example` files, matching the layered architecture
(`routes → services → repositories → external`) defined in `CLAUDE.md`.

### Step 2 — Repository layer
Build the DynamoDB + Pinecone repository layer: 7 repository files, `dynamo-client.ts`,
`dynamo-schema.ts`, and supporting type updates.

### Step 3 — Service layer
Build the service layer: 8 services (openai, crawler, rag, bot, chat, lead, kb, client).
Follow-up: add `resyncBot` to `bot-service.ts` for re-indexing an existing bot's site.

### Step 4 — Route handlers
Build the 5 Hono route handler files, registered on the main app with `requireAuth`
middleware and 404/error handlers.

---

## Phase 2: Frontend Dashboard & Widget

### Step 5 — React CRM dashboard
> Context: RigaChat AI Chatbot SaaS Platform. Steps 1–4 are complete.
>
> This step builds the full React CRM dashboard: design tokens, auth context, 10 reusable
> components, `DashboardLayout`, 9 pages, and routing. Do not modify any backend files.

Follow-up: add `websiteUrl` field to `BotConfig`.

### Step 6 — Embeddable chatbot widget
> Build a vanilla-JS chatbot widget (`frontend/public/widget.js`) — Shadow DOM isolation,
> configurable triggers (`immediate`, `delay_5s`, `scroll_50`, `exit_intent`), streaming
> chat via `ReadableStream`, and lead capture form submission. No framework dependencies.

---

## Phase 3: Streaming, CORS, and Auth

### Step 7 — Lambda streaming handler and CORS scoping
> Context: Step 7 of building an AI Chatbot SaaS Platform.
>
> Part 1: Update `/backend/index.ts` to export both a standard `handler` (via
> `handle(app)`) and a `streamingHandler` (via `streamHandle(app)`), since AWS Lambda
> Function URLs only support one invocation mode (BUFFERED or RESPONSE_STREAM) per
> function — the same bundle deploys to two separate Lambda functions.
>
> Part 2: Update `/backend/src/routes/index.ts` to add two CORS configs via `hono/cors` —
> a strict-origin config for CRM dashboard routes and a wildcard-origin config for widget
> routes, plus a catch-all `app.options('*', ...)` preflight handler.
>
> Part 3: Update `/backend/package.json`'s `deploy` script to run a new
> `/backend/scripts/deploy.js` that zips the build and deploys to both Lambda functions.
> Add `LAMBDA_STREAMING_FUNCTION_NAME` to `.env.example`.
>
> Part 4: Update `.github/workflows/deploy.yml` and `README.md` — **skipped**, no
> `.github` directory existed yet in the repo (user chose "Skip for now" when asked).

Bugs found and fixed during this step: AWS SDK v3 sets `globalThis.awslambda = {}` for
its own tracing purposes, so the streaming-runtime detection had to check specifically
for `awslambda.streamifyResponse` rather than the global's mere existence; and a
CJS/ESM module-type mismatch in `dist/index.js` fixed via a scoped `dist/package.json`.

### Step 8 — Google OAuth via Cognito
> Context: Step 8 of building an AI Chatbot SaaS Platform. Steps 1-7 are complete.
>
> Implement Google OAuth authentication using AWS Cognito. This replaces the mock auth
> in the frontend and wires the real JWT verification in the backend middleware.
>
> Part 1: `/backend/src/lib/cognito.ts` — real `CognitoJwtVerifier` (tokenUse: 'id'),
> `requireAuth` middleware reading the Bearer token, 401 on missing/invalid, type
> augmentation for `c.get('user')`.
>
> Part 2: `/frontend/src/hooks/useAuth.ts` — real Cognito Hosted UI OAuth flow: `login()`
> builds the authorize URL and redirects; `handleCallback(code)` exchanges the code for
> tokens via `/oauth2/token`, decodes the ID token client-side, calls `syncMe()`; tokens
> stored in memory only, never localStorage.
>
> Part 3: `/frontend/src/pages/LoginPage.tsx` — wire "Continue with Google" to `login()`.
> Add `/auth/callback` route and `AuthCallbackPage.tsx`.
>
> Part 4: Add Cognito env vars to `frontend/.env.example`.

### Fix — Cognito `invalid_scope`
The app client's `AllowedOAuthScopes` only permitted `openid`/`email`/`phone`, but
`login()` requested `openid email profile`. Dropped `profile` from the requested scope.

### Fix — Auth callback race condition and frozen callback page
Two bugs: (1) `AuthProvider`'s own mount effect and `AuthCallbackPage` both tried to
consume the single-use authorization code, so the second `/oauth2/token` call always
got rejected. (2) `handleCallback` updated the URL via `window.history.replaceState`
from outside the Router, which React Router never observed, freezing the page even
after a successful sign-in. Fixed by making `AuthCallbackPage` the sole consumer of the
code (guarded against `React.StrictMode`'s double-invoke) and navigating via
`useNavigate()` from inside the Router instead.

---

## Phase 4: CI/CD and Deployment

### GitHub Actions workflows
> Context: RigaChat AI Chatbot SaaS Platform. All code is built. Infrastructure is set
> up on AWS ap-south-1.
>
> Create/update `.github/workflows/ci.yml` (type-check + build backend and frontend in
> parallel, on every push and PR to main) and `deploy.yml` (deploy-backend and
> deploy-frontend jobs in parallel, then deploy-summary — deploys both Lambda functions,
> syncs S3, invalidates both CloudFront distributions). Update the secrets list in
> `.github/workflows/README.md`.

Neither file actually existed before this step, despite the task assuming they did
(same situation as Step 7 Part 4) — both were created fresh.

### Local deployment shell scripts
> Context: AWS CLI is not installed on this Mac. Task is to install AWS CLI, configure
> it, and deploy the frontend and backend to AWS.
>
> Create `/scripts/deploy.sh` (checks/installs AWS CLI, builds and deploys backend to
> both Lambda functions, builds and deploys frontend/widget to S3, invalidates both
> CloudFront distributions) and `/scripts/install-aws-cli.sh` (standalone AWS CLI
> installer). Infra values default to the real values but are overridable via env vars
> matching the GitHub Actions secret names, for consistency and to avoid hardcoding.

### Manual production deployment
Ran the full deploy manually once (build → inject `BACKEND_URL` into `widget.js` →
upload to S3 → invalidate CloudFront), confirmed via the Lambda health endpoint and the
CloudFront-served dashboard returning `200`.

---

## Phase 5: Bug Fixes Found During Manual Testing

### Fix — CORS on public lead-capture endpoint
`POST /api/leads` (the public, no-auth endpoint `widget.js` calls from any client's
website) was grouped under the strict single-origin `dashboardCors` policy instead of
the wildcard `widgetCors` — meaning lead capture was broken from every real client site.
Split it the same way `/api/bots/public/*` was split: the exact `POST /api/leads` path
gets `widgetCors`, the authenticated `GET` routes underneath keep `dashboardCors`.

### Fix — RAG retrieval always falling back to "I don't have that information"
`MIN_SIMILARITY_SCORE` in `vector-repository.ts` was `0.7` — far too strict for
`text-embedding-3-small`, whose cosine similarity for genuinely relevant matches
typically lands in the 0.2–0.5 range. Verified via direct Pinecone queries (real
matches scored 0.25–0.30) and lowered the threshold to `0.2`.

### Widget embed testing feature (added, then partially reverted)
Built `/widget-test` and `/widget-test/preview` — paste an embed snippet, preview it
running on a mock client page, chat with the live bot. Later added a mock/"skip AI"
mode to avoid burning OpenAI quota during repeated testing, which inadvertently broke
the lead-trigger flow (message counting depends on the backend actually recording each
message). Fixed by moving the mock server-side (an `X-Skip-Ai` header), then the user
asked to remove the mock entirely — reverted to always using real AI answers.

### Git history — remove Claude co-author trailer
User asked to stop adding `Co-Authored-By: Claude Sonnet 5` to commits, and to remove
it retroactively. Rewrote the 12 affected commit messages via `git filter-branch`
(file content unchanged, verified via empty diffs) and force-pushed.

---

## Phase 6: Tailwind UI Migration (branch `ui-improvements`)

Context established before Step A: a zip file (`rigachat---real-estate-ai-dashboard.zip`,
extracted to `/design-reference/`) contains a Google AI Studio-generated Tailwind v4 +
React 19 prototype, used purely as a **visual reference** — not literal code to copy.
Ground rule for the whole migration: visual/structural changes only, no new
functionality, no fabricated data, preserve real `react-router` routing and real API
calls. Where the reference needed data the backend doesn't track (lead status pipeline,
bot satisfaction scores, per-bot lead counts, PDF/CSV knowledge base uploads), those
elements were flagged and omitted or replaced with an honest equivalent rather than
faked.

### Step A — Install Tailwind and set up the design foundation
> This is Step A: Install Tailwind and set up the design foundation without breaking
> anything.
>
> Install `tailwindcss`, `@tailwindcss/vite`, `lucide-react`, `motion`. Replace
> `vite.config.ts` and `frontend/src/index.css` with the design reference's exact
> Tailwind setup (dark sidebar palette, glass-card/gradient utility classes, Inter +
> Material Symbols fonts). Do not modify any page components yet.

Flagged consequence: this removes the CSS custom properties every existing component's
CSS Module depends on, so already-built pages visually regress until migrated.

### Step B — Migrate Dashboard Layout (Sidebar + Header)
Rebuilt `DashboardLayout.tsx` in Tailwind: dark sidebar, real `useAuth`-driven user
info/logout, route-based page title in the header. Kept it as a **named** export using
`<Outlet/>` (not default export + `children` prop as literally requested) since
`App.tsx` actually renders it via nested routes — the literal spec would have broken
that.

### Step C — Migrate Dashboard Home
Rebuilt `DashboardHome.tsx`: greeting by time of day, 3 stat cards, Recent Leads table
wired to `getMyBots`/`getAllLeads`. Follow-up fixes: `firstName` extraction (was
showing the full email-derived username when Cognito's `name` claim was unset), and
pluralization in `formatRelativeDate` ("1 minute ago" vs "2 minutes ago").

### Step D — Migrate Chatbots page
Rebuilt `BotsPage.tsx`: bot cards, embed-code modal, delete confirmation, resync
button. Found `BotConfig` on the frontend was missing `websiteUrl` (present on the
backend type, actually returned by the API) — added it, since the page can't function
without it. Embed snippet uses the real `VITE_CDN_URL`, not the placeholder domains in
the task text or the reference file.

### Step E — Migrate New Bot Wizard
Rebuilt `NewBotPage.tsx`: 4-step wizard (Website → Appearance → Lead Form → Review),
step validation, color-picker/hex sync, optional lead-field toggles, launch flow wired
to `setupBot`.

### Step F — Migrate Leads page
Rebuilt `LeadsPage.tsx`: bot/search filters, stat chips, paginated table, CSV export
(with proper quote/comma escaping).

### Step G — Migrate Lead Detail page
Rebuilt `LeadDetailPage.tsx`: contact info card, chat transcript parsed into
user/bot message bubbles, optional property-interest/budget-range rows.

### Step H — Migrate Knowledge Base page
Rebuilt `KnowledgeBasePage.tsx`: entry cards, add/edit/delete modals wired to
`getKBEntries`/`addKBEntry`/`updateKBEntry`/`deleteKBEntry`.

### Step I — Migrate Settings page (final step)
Rebuilt `SettingsPage.tsx`: read-only profile fields (name/email come from Google, not
editable in MVP), plan badge, 3 stacked plan cards with an "Upgrade → coming soon"
toast, Danger Zone sign-out.

### Post-migration — Redesign widget test pages
> Redesign http://localhost:5173/widget-test and other testing endpoint also we only
> want to test so we won't be generating it dynamically, only chatbot link we will
> embed so design both pages accordingly.

Replaced the paste-a-full-`<script>`-tag-and-parse-it flow with a single Bot ID input;
the preview page derives the widget `src` itself from `VITE_CDN_URL`. Both pages
rebuilt in Tailwind (they were still on the old, broken CSS Modules from before Step A).

### Post-migration — Remove Knowledge Base nav item
Removed the disabled/grayed-out "Knowledge Base" sidebar entry entirely (it only ever
showed a "coming soon" toast, since KB is scoped per-bot with no standalone list
route) — along with its now-unused `handleKnowledgeBaseClick` handler and `useToast`
import.
