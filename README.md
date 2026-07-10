# BeepBoop

Embeddable AI chatbot SaaS platform. Clients train a chatbot on their website content and a custom knowledge base; captured leads flow into a built-in CRM inside the dashboard.

## Tech Stack

- **Frontend**: React, TypeScript (strict), Vite — hosted on S3 + CloudFront
- **Backend**: Node.js, TypeScript (strict), Hono — runs as a single AWS Lambda function
- **Auth**: AWS Cognito, JWT middleware on protected routes
- **Database**: AWS DynamoDB (app data), Pinecone (RAG embeddings)
- **AI**: OpenAI (`text-embedding-3-small` for embeddings, `gpt-4o-mini` for chat)

## Project Structure

```
/backend
  /src
    /routes        Hono route handlers
    /services      business logic
    /repositories   DynamoDB + Pinecone data access
    /lib           OpenAI/Pinecone clients, Cognito middleware
    /types         shared TypeScript interfaces
  index.ts         Lambda handler entry point

/frontend
  /src
    /pages         route-level React components
    /components    reusable UI components
    /hooks         custom React hooks
    /services      API client
    /types         shared TypeScript types
```

## Getting Started

### Backend

```
cd backend
npm install
cp .env.example .env   # fill in OpenAI/Pinecone/Cognito/DynamoDB values
npm run dev            # http://localhost:3000
```

### Frontend

```
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL
npm run dev
```

## API Routes

| Method | Path                        | Auth      | Description                          |
|--------|-----------------------------|-----------|---------------------------------------|
| GET    | /health                     | none      | Health check                          |
| POST   | /api/bots/setup             | required  | Create a bot and index its website    |
| GET    | /api/bots/my-bots           | required  | List bots for the logged-in client    |
| GET    | /api/bots/public/:botId     | none      | Public bot config for the widget      |
| GET    | /api/bots/:botId            | required  | Get a bot's config                    |
| PATCH  | /api/bots/:botId            | required  | Update a bot's config                 |
| DELETE | /api/bots/:botId            | required  | Delete a bot                          |
| POST   | /api/bots/:botId/resync     | required  | Re-crawl and re-index a bot's site    |
| POST   | /api/chat/start             | none      | Start a widget conversation           |
| POST   | /api/chat/message           | none      | Send a message, streams the reply     |
| GET    | /api/chat/lead-trigger/:botId/:conversationId | none | Check if lead capture should trigger |
| POST   | /api/leads                  | none      | Capture a lead from the widget        |
| GET    | /api/leads/bot/:botId       | required  | List leads for a bot                  |
| GET    | /api/leads/all              | required  | List all leads for a client           |
| GET    | /api/leads/:botId/:leadId   | required  | Get a single lead                     |
| POST   | /api/kb                     | required  | Add a knowledge base entry            |
| GET    | /api/kb/:botId               | required  | List knowledge base entries           |
| PATCH  | /api/kb/:botId/:entryId     | required  | Update a knowledge base entry         |
| DELETE | /api/kb/:botId/:entryId     | required  | Delete a knowledge base entry         |
| POST   | /api/clients/me              | required  | Sync Cognito user to DynamoDB (on login) |
| GET    | /api/clients/me              | required  | Get the logged-in client's record     |
| PATCH  | /api/clients/me/plan         | required  | Change the client's plan              |
 
