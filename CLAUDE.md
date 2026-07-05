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
POST /api/kb                -> add knowledge base entry + embed it
GET  /api/kb                -> fetch all KB entries (auth required)

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
- conversations — partition key: botId, sort key: conversationId
- knowledge_base — partition key: botId, sort key: entryId

## Environment Variables
OPENAI_API_KEY
PINECONE_API_KEY
PINECONE_INDEX_NAME
AWS_REGION
DYNAMODB_TABLE_CLIENTS
DYNAMODB_TABLE_BOTS
DYNAMODB_TABLE_LEADS
DYNAMODB_TABLE_CONVERSATIONS
DYNAMODB_TABLE_KB
COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID
FRONTEND_URL

## Build and Run Commands
Backend:
  cd backend && npm install
  npm run dev       <- local dev
  npm run build     <- compile TypeScript
  npm run deploy    <- zip and push to Lambda

Frontend:
  cd frontend && npm install
  npm run dev       <- local dev server
  npm run build     <- production build to /dist
  npm run deploy    <- sync /dist to S3 + invalidate CloudFront

## What NOT to Build in MVP
- PDF upload (Phase 2)
- WhatsApp integration (Phase 2, placeholder card in UI only)
- External CRM integrations (Phase 2)
- Multi-language support (Phase 2)
- File upload of any kind (Phase 2)
