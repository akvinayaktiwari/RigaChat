import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createAppointmentRequest } from '../repositories/appointment-request-repository.js'
import type { AppointmentRequest } from '../types/index.js'

export interface BookAppointmentInput {
  botId: string
  clientId: string
  leadId: string
  requestedAt: string
  notes?: string
}

// The real (non-stub) half of the MCP toolbox pass: no calendar system
// exists in this codebase, so this persists a request record rather than
// confirming a real slot -- genuinely useful without one (a client can see
// a lead asked for a specific time), and the honest scope for what's
// actually buildable right now. Shared by both the MCP tool below and
// journey-executor-service.ts's direct in-process dispatch, so the two
// callers (a real external MCP client, and this codebase's own executor)
// can never drift.
export async function bookAppointment(input: BookAppointmentInput): Promise<AppointmentRequest> {
  const requestedAt = new Date(input.requestedAt)
  if (Number.isNaN(requestedAt.getTime())) {
    throw new Error(`"${input.requestedAt}" is not a valid ISO 8601 datetime`)
  }

  return createAppointmentRequest({
    botId: input.botId,
    clientId: input.clientId,
    leadId: input.leadId,
    requestedAt: input.requestedAt,
    notes: input.notes,
  })
}

export function createBookingMcpServer(): McpServer {
  const server = new McpServer({ name: 'booking', version: '1.0.0' })

  server.registerTool(
    'book_appointment',
    {
      title: 'Book Appointment',
      description:
        'Requests a site-visit/appointment slot for a lead at a specific time. Persists a request record for the client to review -- does not confirm against a live calendar, since none exists yet.',
      inputSchema: {
        botId: z.string(),
        clientId: z.string(),
        leadId: z.string(),
        requestedAt: z.string().describe('ISO 8601 datetime the lead requested'),
        notes: z.string().optional(),
      },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const request = await bookAppointment(args)
        return { content: [{ type: 'text', text: JSON.stringify(request) }] }
      } catch (error) {
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        }
      }
    }
  )

  return server
}
