import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

export interface GetQuotationInput {
  botId: string
  clientId: string
  leadId: string
  propertyInterest?: string
  budgetRange?: string
}

export interface GetQuotationResult {
  stub: true
  message: string
}

// STUB: real pricing logic needs a pricing-rule data model that doesn't
// exist in this codebase (per-property, per-client, or configurable
// rules?) -- undesigned, tracked in TODOS.md. Kept as a real MCP tool
// (not just a journey-executor-service.ts special case) so the protocol
// surface is complete and consistent even before the business logic is.
export async function getQuotation(_input: GetQuotationInput): Promise<GetQuotationResult> {
  return { stub: true, message: 'Quotation logic not yet implemented -- no pricing-rule data model exists yet.' }
}

export function createQuotationMcpServer(): McpServer {
  const server = new McpServer({ name: 'quotation', version: '1.0.0' })

  server.registerTool(
    'get_quotation',
    {
      title: 'Get Quotation',
      description: 'STUB. Real pricing logic is not implemented yet -- always returns a canned response.',
      inputSchema: {
        botId: z.string(),
        clientId: z.string(),
        leadId: z.string(),
        propertyInterest: z.string().optional(),
        budgetRange: z.string().optional(),
      },
    },
    async (args): Promise<CallToolResult> => {
      const result = await getQuotation(args)
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    }
  )

  return server
}
