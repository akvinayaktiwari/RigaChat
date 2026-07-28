import { Hono } from 'hono'
import type { Context } from 'hono'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createBookingMcpServer } from '../mcp/booking-mcp-server.js'
import { createReminderMcpServer } from '../mcp/reminder-mcp-server.js'
import { createQuotationMcpServer } from '../mcp/quotation-mcp-server.js'
import { createBrochureMcpServer } from '../mcp/brochure-mcp-server.js'

// Real capability implementations behind one MCP server each -- booking and
// reminder are the two real (non-stub) tools built this pass; quotation and
// brochure are deliberate stubs (see their own files). One route group per
// capability, shared across all clients per the approved design ("not one
// duplicated set of route handlers per client") -- the calling client is
// scoped per-request via the tool's own input arguments (botId/clientId),
// not via routing, the same way Pinecone queries are already scoped by
// botId today.

const mcpSharedSecret = process.env.MCP_INTERNAL_SHARED_SECRET

if (!mcpSharedSecret) {
  throw new Error(
    'Missing required environment variable MCP_INTERNAL_SHARED_SECRET. Set it in your .env file before starting the server.'
  )
}

export const mcpRoutes = new Hono()

// INTERIM protection, not the real MCP auth model: a shared bearer secret
// checked on every /mcp/* request. journey-executor-service.ts never
// actually calls these routes over HTTP (it calls the same core functions
// in-process -- see booking-mcp-server.ts's own comment), so today this
// only guards against an unauthenticated caller reaching a real external
// MCP client integration that doesn't exist yet either. The real
// per-client/per-agent auth model for MCP access is an open question in
// the approved design (Open Question #2) and explicitly deferred -- see
// TODOS.md.
mcpRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (authHeader !== `Bearer ${mcpSharedSecret}`) {
    return c.text('Unauthorized', 401)
  }
  return next()
})

// A fresh McpServer + transport per request, not a shared singleton --
// stateless mode (sessionIdGenerator: undefined) has no session to persist
// across requests anyway, and a fresh instance per invocation avoids
// leaking any per-request state across Lambda container reuse.
// enableJsonResponse: true returns a direct JSON response instead of
// opening an SSE stream, matching the "simple request/response" shape a
// single tool call actually needs here.
async function handleMcpRequest(c: Context, createServer: () => McpServer): Promise<Response> {
  const server = createServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(c.req.raw)
}

mcpRoutes.all('/booking', (c) => handleMcpRequest(c, createBookingMcpServer))
mcpRoutes.all('/reminder', (c) => handleMcpRequest(c, createReminderMcpServer))
mcpRoutes.all('/quotation', (c) => handleMcpRequest(c, createQuotationMcpServer))
mcpRoutes.all('/brochure', (c) => handleMcpRequest(c, createBrochureMcpServer))
