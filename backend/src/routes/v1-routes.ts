// The developer API. Mounted at /v1, authenticated by API key (not Cognito).
//
// Versioned and separate from /api/* because this is a contract with code we
// do not control: a response shape here cannot change the way a dashboard
// route's can. Read-only for now.
//
// Responses are `{ data }` on success and `{ error: { code, message } }` on
// failure -- not the dashboard's ApiResponse envelope.

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireApiKey } from '../lib/api-key-auth.js'
import {
  MAX_LEAD_PAGE_SIZE,
  PublicResourceNotFoundError,
  getBot,
  getForm,
  getLead,
  getVoiceAgent,
  listBots,
  listForms,
  listLeads,
  listVoiceAgents,
} from '../services/public-api-service.js'
import type { PublicApiError } from '../types/index.js'

export const v1Routes = new Hono()

function fail(c: Context, status: 400 | 404 | 500, code: string, message: string): Response {
  return c.json<PublicApiError>({ error: { code, message } }, status)
}

// A 500 never carries the internal message. Those name tables and upstream
// services, which is useful in our logs and is nobody else's business.
function failFrom(c: Context, error: unknown): Response {
  if (error instanceof PublicResourceNotFoundError) return fail(c, 404, 'not_found', error.message)
  console.error(`[v1] ${c.req.method} ${c.req.path} failed:`, error)
  return fail(c, 500, 'internal_error', 'Something went wrong on our side.')
}

async function respond<T>(c: Context, read: (clientId: string) => Promise<T>): Promise<Response> {
  try {
    return c.json({ data: await read(c.get('apiPrincipal').clientId) }, 200)
  } catch (error) {
    return failFrom(c, error)
  }
}

function parseLimit(raw: string | undefined): number | undefined | null {
  if (raw === undefined) return undefined
  const limit = Number(raw)
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_LEAD_PAGE_SIZE ? limit : null
}

// The page is the response body itself, so `data`, `nextCursor` and `total`
// sit side by side rather than nested under a second `data`.
v1Routes.get('/leads', requireApiKey('leads:read'), async (c) => {
  const limit = parseLimit(c.req.query('limit'))
  if (limit === null) {
    return fail(c, 400, 'invalid_request', `limit must be an integer between 1 and ${MAX_LEAD_PAGE_SIZE}`)
  }

  try {
    const page = await listLeads(c.get('apiPrincipal').clientId, {
      ...(limit !== undefined ? { limit } : {}),
      ...(c.req.query('cursor') ? { cursor: c.req.query('cursor') as string } : {}),
      ...(c.req.query('includeArchived') === 'true' ? { includeArchived: true } : {}),
    })
    return c.json(page, 200)
  } catch (error) {
    return failFrom(c, error)
  }
})

v1Routes.get('/leads/:id', requireApiKey('leads:read'), (c) =>
  respond(c, (clientId) => getLead(clientId, c.req.param('id')))
)

v1Routes.get('/bots', requireApiKey('bots:read'), (c) => respond(c, listBots))

v1Routes.get('/bots/:botId', requireApiKey('bots:read'), (c) =>
  respond(c, (clientId) => getBot(clientId, c.req.param('botId')))
)

v1Routes.get('/forms', requireApiKey('forms:read'), (c) => respond(c, listForms))

v1Routes.get('/forms/:formId', requireApiKey('forms:read'), (c) =>
  respond(c, (clientId) => getForm(clientId, c.req.param('formId')))
)

v1Routes.get('/voice-agents', requireApiKey('voice_agents:read'), (c) => respond(c, listVoiceAgents))

v1Routes.get('/voice-agents/:agentId', requireApiKey('voice_agents:read'), (c) =>
  respond(c, (clientId) => getVoiceAgent(clientId, c.req.param('agentId')))
)

// A catch-all rather than v1Routes.notFound(): Hono ignores a mounted sub-app's
// notFound handler. Without this an unknown /v1 path falls through to the
// app-level one and answers in the dashboard's envelope, which a /v1 client is
// not written to parse.
v1Routes.all('*', (c) => fail(c, 404, 'not_found', 'No such endpoint.'))
