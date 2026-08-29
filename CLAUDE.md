# Project: AI Chatbot SaaS Platform

## What This Product Is
A SaaS platform that lets clients embed an AI chatbot on their website.
The chatbot is trained on the client's website content and a custom knowledge base.
Captured leads go into a built-in CRM inside the platform dashboard.

## Tech Stack
- Frontend: React, TypeScript strict mode, hosted on S3 + CloudFront
- Backend: Node.js, TypeScript strict mode, Hono framework, single AWS Lambda function
- Auth: AWS Cognito, JWT middleware on all protected routes
- App database: AWS DynamoDB
- Vector database: Pinecone (free tier, for RAG embeddings)
- AI: OpenAI API (text-embedding-3-small for embeddings, gpt-4o-mini for chat)
- Deployment: AWS Lambda Function URL (no API Gateway)

## Folder Structure
/backend
  /src
    /routes        <- Hono route handlers only, no logic here
    /services      <- all business logic
    /repositories  <- all database and external API calls
    /lib           <- OpenAI client, Pinecone client, Cognito middleware, utilities
    /types         <- all TypeScript interfaces and types
  index.ts         <- Lambda handler entry point

/frontend
  /src
    /pages         <- route-level React components
    /components    <- reusable UI components
    /hooks         <- custom React hooks
    /services      <- API call functions
    /types         <- shared TypeScript types

## Architecture Rules (IMMUTABLE - never break these)
1. Routes call services only. Never call a repository from a route.
2. Services call repositories only. Never call DynamoDB or Pinecone directly from a service.
3. Repositories call external services only (DynamoDB, Pinecone, OpenAI).
4. The MessageChannel interface handles all incoming messages. The web widget is one implementation. Future channels (WhatsApp etc.) will be added as new implementations only.
5. Every Pinecone query MUST be scoped by botId. Never query across all bots.
6. All routes except /api/chat and /api/bots/:id/config require Cognito JWT auth middleware.

## API Routes (MVP)
POST /api/bots/setup        -> crawl URL + embed + save bot config
GET  /api/bots/:id/config   -> fetch bot config for widget (public, no auth)
POST /api/chat              -> RAG retrieval + OpenAI stream (public, no auth)
POST /api/leads             -> save lead from chat form
GET  /api/leads             -> fetch all leads for CRM (auth required)
GET  /api/leads/inbox          -> unified inbox: chat + form + Meta leads merged, each with its LeadRef and LeadState, ordered by urgency not recency (auth required)
GET  /api/leads/detail         -> one lead, source-agnostic: normalized fields plus the transcript (chat) or the submitted answers relabelled from fieldId (form/Meta). LeadRef travels as query params (auth required)
PATCH /api/leads/state         -> set status/outcome/ownerId/nextActionAt/leadScore on a lead (auth required; body carries the LeadRef. `replied`/`appointmentBooked` are journey-written and NOT settable here)
POST /api/leads/notes          -> append a note to a lead (auth required; body carries the LeadRef)
POST /api/kb                -> add knowledge base entry + embed it
GET  /api/kb                -> fetch all KB entries (auth required)
GET  /api/journeys/templates             -> list the prebuilt agent library (auth required; code-defined seeds, identical for every client)
POST /api/journeys/from-template/:templateId -> clone a prebuilt agent into a client-owned bundle (auth required)
POST /api/journeys                       -> create a JourneyBundle (auth required; isPrebuiltTemplate/sourceTemplateId are server-controlled, NOT client-settable)
GET  /api/journeys/:botId                -> list JourneyBundles for a bot (auth required)
GET  /api/journeys/:botId/:bundleId      -> fetch one JourneyBundle (auth required)
PATCH /api/journeys/:botId/:bundleId     -> update a JourneyBundle (auth required)
DELETE /api/journeys/:botId/:bundleId    -> delete a JourneyBundle (auth required)
POST /api/journeys/:botId/:bundleId/publish -> compile + mark published, no live infra provisioned yet (auth required)
GET  /api/journeys/active                -> every journey that is live or paused, across ALL of the caller's bots.
                                            The cross-bot index: answers "what is running right now" without
                                            picking a bot first (auth required)
GET  /api/journeys/:botId/:bundleId/executions -> each lead's run through this journey, newest first. Derived on read
                                            from lead_events via the bundleId-ts GSI, never stored (auth required)
POST /api/journeys/:botId/:bundleId/pause   -> take a live journey off the air: releases its trigger claim so no new
                                            lead ignites into it, KEEPS the compiled state machine so anyone
                                            mid-journey finishes. Resume = POST /publish again (auth required)
POST /api/agents                         -> create a cross-channel Agent (auth required)
GET  /api/agents                         -> list the caller's Agents (auth required)
GET  /api/agents/:agentId                -> fetch one Agent (auth required)
DELETE /api/agents/:agentId              -> delete an Agent (auth required)
PATCH /api/agents/:agentId/scripted-only -> kill switch: true stops the agent composing replies and returns it to
                                            its journeys' authored lines, with no deploy. Its own route rather than a
                                            generic PATCH because `channels` is claim-guarded and must only change
                                            through the bind/unbind paths (auth required)
POST /api/scheduler                      -> create a ScheduledAction (EventBridge Scheduler) (auth required)
GET  /api/scheduler                      -> list the caller's ScheduledActions (auth required)
PATCH /api/scheduler/:scheduleId         -> update a ScheduledAction's cadence (auth required)
DELETE /api/scheduler/:scheduleId        -> delete a ScheduledAction (auth required)
POST /mcp/booking    -> MCP server, book_appointment tool (real: persists an AppointmentRequest). Interim shared-secret auth, not Cognito.
POST /mcp/reminder   -> MCP server, schedule_reminder tool (real: creates a lead_reminder ScheduledAction). Interim shared-secret auth, not Cognito.
POST /mcp/quotation  -> MCP server, get_quotation tool (STUB -- no pricing-rule data model exists yet). Interim shared-secret auth, not Cognito.
POST /mcp/brochure   -> MCP server, send_brochure tool (STUB -- no document/asset management exists yet). Interim shared-secret auth, not Cognito.
POST /api/contact           -> marketing-site "Get in touch" form: store the message + email support (public, no auth; honeypot + per-ip/email rate limit)
GET  /api/webhooks/meta/data-deletion/:code -> public status lookup for a Meta data-deletion request; the confirmation code is the only credential (no auth)
GET  /api/admin/contact-messages -> staff console list of contact submissions; defaults to un-notified only, ?unnotifiedOnly=false for all (STAFF Cognito auth)

## Key Interfaces
interface MessageChannel {
  receiveMessage(payload: unknown): ChannelMessage
  sendResponse(response: string, context: ChannelContext): Promise<void>
}

interface BotConfig {
  botId: string
  clientId: string
  name: string
  greetingMessage: string
  brandColor: string
  leadTriggerAfterMessages: number
  leadFormFields: LeadFormField[]
  widgetTrigger: 'immediate' | 'delay_5s' | 'scroll_50' | 'exit_intent'
  createdAt: string
}

interface Lead {
  leadId: string
  botId: string
  clientId: string
  name: string
  phone: string
  email: string
  propertyInterest?: string
  budgetRange?: string
  chatTranscript: string
  sourceUrl: string
  createdAt: string
}

interface KnowledgeBaseEntry {
  entryId: string
  botId: string
  clientId: string
  title: string
  content: string
  createdAt: string
}

## DynamoDB Tables
- clients — partition key: clientId
- bots — partition key: clientId, sort key: botId
- leads — partition key: botId, sort key: createdAt
- meta_leads — partition key: clientId, sort key: leadId, GSI clientId-createdAt-index (NOT partitioned by pageId — pageId is an attribute and a discriminator on LeadRef, never an address)
- conversations — partition key: botId, sort key: conversationId
- knowledge_base — partition key: botId, sort key: entryId
- journeys — partition key: botId, sort key: bundleId
- scheduled_actions — partition key: clientId, sort key: scheduleId
- journey_executions — partition key: leadId, sort key: stepId (wait_and_recheck iteration counters)
- appointment_requests — partition key: botId, sort key: requestId
- gupshup_app_lookup — partition key: appName (routes the shared /webhooks/gupshup endpoint to a clientId)
- whatsapp_inbound_activity — partition key: leadId (lastInboundMessageAt, powers the 24h WhatsApp session-window check)
- agents — partition key: clientId, sort key: agentId (top-level cross-channel Agent identity; channel bindings resolve to a botId/voice agentId — an identity layer over the existing per-channel records, does not touch their Pinecone namespaces)
- agent_binding_lookup — partition key: resourceId (reverse index botId/voiceAgentId → owning Agent; atomic-claim so one resource maps to at most one Agent, mirrors gupshup_app_lookup)
- journey_pending_replies — partition key: leadId (Step Functions callback tokens for executions parked on an await_reply step; TTL on expiresAt, because a timed-out execution never calls back to clean itself up)
- journey_trigger_claims — partition key: claimKey (`agent:<agentId>#<trigger>` or `bot:<botId>#<trigger>`; atomic-claim so exactly ONE published bundle owns a trigger — prevents duplicate outreach. Doubles as the ignition index: "which journey runs for this lead" is a point read)
- lead_state — partition key: leadId, GSI clientId-updatedAt-index (per-lead CRM working state: status/owner/nextActionAt/notes/leadScore. Its own table because the three lead tables have three different partition keys — same reason whatsapp_inbound_activity and journey_pending_replies are leadId-keyed side tables. Also where JourneyStep.recheckField's `replied`/`leadScore`/`appointmentBooked` finally live)
- meta_deletion_requests — partition key: confirmationCode (Meta's mandated data-deletion callback. No GSI: every read is a point lookup by the code Meta hands the user. No TTL — the row is the evidence the request was handled)
- lead_events — partition key: leadId, sort key: ts (`<iso>#<uuid>`), GSI clientId-ts-index, sparse GSI wamid-index, sparse GSI bundleId-ts-index (append-only record of everything that happened to a lead: messages both directions, delivery statuses, journey steps, tool calls, handoffs. The wamid index exists because a Meta status webhook carries a wamid and no leadId. No TTL — this is the audit record)
- contact_messages — partition key: messageId, GSI recordType-createdAt-index (marketing-site contact form; no clientId/botId — these are messages to us, not leads for a client's bot)

## Environment Variables
OPENAI_API_KEY
PINECONE_API_KEY
PINECONE_INDEX_NAME
AWS_REGION
DYNAMODB_TABLE_PREFIX   <- optional; the ONLY table-name env var. The 30 DYNAMODB_TABLE_* vars were
                           removed on 2026-08-16: 28 of them were the key spelled twice
                           (DYNAMODB_TABLE_LEADS=leads) and they consumed 1250 of the Lambda's
                           4KB env budget. Names now live in backend/src/lib/table-names.ts.
                           Set the prefix only to point a stack at a separate set of tables.
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
FRONTEND_URL
JOURNEY_EXECUTOR_LAMBDA_ARN
SCHEDULER_TARGET_LAMBDA_ARN
SCHEDULER_EXECUTION_ROLE_ARN
JOURNEY_STATE_MACHINE_ROLE_ARN
MCP_INTERNAL_SHARED_SECRET
GUPSHUP_WEBHOOK_TOKEN
CAL_COM_CLIENT_ID
CAL_COM_CLIENT_SECRET
CAL_COM_REDIRECT_URI
DYNAMODB_TABLE_CONTACT_MESSAGES
DYNAMODB_TABLE_LEAD_STATE
DYNAMODB_TABLE_META_DELETION_REQUESTS
SES_FROM_EMAIL
CONTACT_NOTIFICATION_EMAIL
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
FRONTEND_URL
EMAIL_LOGO_URL

## Build and Run Commands
Backend:
  cd backend && npm install
  npm run dev       <- local dev
  npm run build     <- typecheck + esbuild bundle to dist/index.js
  npm test          <- vitest

Frontend:
  cd frontend && npm install
  npm run dev       <- local dev server
  npm run build     <- production build to /dist (vite + prerender)
  npm test          <- vitest

## Deploying
**Pushing to `main` deploys.** `.github/workflows/ci.yml` runs the checks and then
`deploy-backend` + `deploy-frontend` on every push to main. That is the normal path —
there is nothing to run by hand. Check it with `gh run list --branch main --limit 1`.

There is NO `npm run deploy` in the frontend, and the backend's one is not the full
deploy. Do not reach for either:
  - `backend/scripts/deploy.js` (`cd backend && npm run deploy`) updates only
    rigachat-api and rigachat-api-streaming. It does NOT touch rigachat-crawler,
    which runs the same bundle, so using it alone leaves the crawler on stale code.
  - the frontend has no deploy script at all.

The manual fallback, for when CI is down, is the root script — 3 Lambdas, the widget
and dashboard S3 buckets, and both CloudFront invalidations:
  ./scripts/deploy.sh                 <- everything
  ./scripts/deploy.sh --backend-only  <- 3 Lambdas only; needs no VITE_* values,
                                         which is what makes it safe during a
                                         GitHub outage (it cannot touch Lambda
                                         Environment, only code + memory-size)

The full run resolves every VITE_* from GitHub repo variables (or exported env
vars) and ABORTS rather than guessing — a hardcoded default once shipped a login
pointing at the retired domain. It needs `gh auth login` plus `jq`, and AWS creds
for ap-south-1.

Verifying a deploy landed (never trust the green check alone):
  aws lambda get-function-configuration --function-name rigachat-api \
    --region ap-south-1 --query LastModified
  curl -o /dev/null -w '%{http_code}' -X POST "$VITE_API_URL/api/<a-guarded-route>"
      # 401 = deployed and auth-guarded; 404 = the route is not there

## What NOT to Build in MVP
- PDF upload (Phase 2)
- WhatsApp integration (Phase 2, placeholder card in UI only)
- External CRM integrations (Phase 2)
- Multi-language support (Phase 2)
- File upload of any kind (Phase 2)

##RAG quality standards for BeepBoop:

Indexing:
  Reindex after any significant content change
  Verify chunk count after reindex
  Clean up stale Pinecone entries before reindex
  Wait for Pinecone propagation (can take 30-60s)

Retrieval settings:
  topK: 5 (not 3)
  Candidate pool: 10 before MMR
  MMR lambda: 0.7 (diversity weight)
  Similarity threshold: 0.7

Testing after reindex:
  Always test with novel phrasings
  not the same wording used during indexing
  Pinecone semantic cache can return stale
  results for semantically similar queries

Hallucination prevention:
  System prompt must explicitly state:
  "Only answer from provided context"
  "If context does not contain the answer,
   say so clearly"
  Never remove this instruction


Git Commit Rule:
After every completed and tested feature, run:
  git add .
  git commit -m "<type>: <short description>"

Commit message format:
  feat: add support email extraction in crawler
  feat: add mail icon to widget header
  fix: widget bubble icon toggle
  chore: update BotConfig types for supportEmail

Commit types:
  feat     → new feature
  fix      → bug fix
  chore    → config, types, cleanup
  refactor → code restructure, no behavior change

Never commit:
  - Broken or untested code
  - .env or .env.local files
  - node_modules/
  - dist/

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
