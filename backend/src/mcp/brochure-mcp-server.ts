import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export interface SendBrochureInput {
  botId: string
  clientId: string
  leadId: string
  propertyInterest?: string
}

export interface SendBrochureResult {
  stub: true
  message: string
}

// STUB: real brochure delivery needs document/asset management (which
// brochure for which property?) and a real send path (shares the same
// undesigned channel-send gap as journey-executor-service.ts's
// send_message) -- neither exists in this codebase. Tracked in TODOS.md.
export async function sendBrochure(_input: SendBrochureInput): Promise<SendBrochureResult> {
  return { stub: true, message: 'Brochure logic not yet implemented -- no document/asset management exists yet.' }
}

export function createBrochureMcpServer(): McpServer {
  const server = new McpServer({ name: 'brochure', version: '1.0.0' })

  server.registerTool(
    'send_brochure',
    {
      title: 'Send Brochure',
      description: 'STUB. Real brochure delivery is not implemented yet -- always returns a canned response.',
      inputSchema: {
        botId: z.string(),
        clientId: z.string(),
        leadId: z.string(),
        propertyInterest: z.string().optional(),
      },
    },
    async (args): Promise<CallToolResult> => {
      const result = await sendBrochure(args)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  return server
}
