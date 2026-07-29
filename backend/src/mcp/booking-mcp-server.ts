import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createAppointmentRequest } from '../repositories/appointment-request-repository.js'
import { getLeadById } from '../repositories/lead-repository.js'
import { bookViaCalCom } from '../services/cal-com-service.js'
import type { AppointmentRequest } from '../types/index.js'

const DEFAULT_TIME_ZONE = 'Asia/Kolkata'

export interface BookAppointmentInput {
  botId: string
  clientId: string
  leadId: string
  requestedAt: string
  notes?: string
  timeZone?: string
}

// Real for a client with a connected Cal.com account and a chosen default
// event type: books an actual confirmed slot via cal-com-service.ts's
// bookViaCalCom(), then persists the AppointmentRequest as 'confirmed' with
// the real calComBookingUid. Falls back to the original pre-Cal.com
// behavior (a plain 'requested' record, no real calendar) for a client who
// hasn't connected yet -- that's a real, expected state (setup incomplete),
// not an error, so it doesn't throw or surface as a failure. A booking
// ATTEMPT that fails for a connected client (Cal.com rejects the request --
// e.g. the lead has no email and Cal.com requires one) is recorded as
// 'failed' with the real reason in notes, rather than silently mis-reported
// as 'requested'. Shared by both the MCP tool below and
// journey-executor-service.ts's direct in-process dispatch, so the two
// callers can never drift.
export async function bookAppointment(input: BookAppointmentInput): Promise<AppointmentRequest> {
  const requestedAt = new Date(input.requestedAt)
  if (Number.isNaN(requestedAt.getTime())) {
    throw new Error(`"${input.requestedAt}" is not a valid ISO 8601 datetime`)
  }

  const lead = await getLeadById(input.botId, input.leadId)

  let result: Awaited<ReturnType<typeof bookViaCalCom>>
  try {
    result = await bookViaCalCom({
      clientId: input.clientId,
      start: requestedAt.toISOString(),
      attendeeName: lead?.name ?? 'Lead',
      attendeeEmail: lead?.email,
      attendeeTimeZone: input.timeZone ?? DEFAULT_TIME_ZONE,
    })
  } catch (error) {
    // Connected, but Cal.com's API itself rejected the request (e.g. no
    // attendee email and Cal.com requires one, or the event type was
    // deleted) -- a real failure, not "not set up yet". Surfaced as
    // status: 'failed', not silently downgraded to 'requested'.
    return createAppointmentRequest({
      botId: input.botId,
      clientId: input.clientId,
      leadId: input.leadId,
      requestedAt: input.requestedAt,
      notes: `Booking failed: ${error instanceof Error ? error.message : String(error)}`,
      status: 'failed',
    })
  }

  if (!result.connected) {
    return createAppointmentRequest({
      botId: input.botId,
      clientId: input.clientId,
      leadId: input.leadId,
      requestedAt: input.requestedAt,
      notes: input.notes,
      status: 'requested',
    })
  }

  return createAppointmentRequest({
    botId: input.botId,
    clientId: input.clientId,
    leadId: input.leadId,
    requestedAt: input.requestedAt,
    notes: input.notes,
    status: 'confirmed',
    calComBookingUid: result.booking.uid,
  })
}

export function createBookingMcpServer(): McpServer {
  const server = new McpServer({ name: 'booking', version: '1.0.0' })

  server.registerTool(
    'book_appointment',
    {
      title: 'Book Appointment',
      description:
        'Books a site-visit/appointment slot for a lead at a specific time. Creates a real confirmed booking via Cal.com if the client has connected one; otherwise persists a request record for the client to review manually.',
      inputSchema: {
        botId: z.string(),
        clientId: z.string(),
        leadId: z.string(),
        requestedAt: z.string().describe('ISO 8601 datetime the lead requested'),
        notes: z.string().optional(),
        timeZone: z.string().optional().describe('IANA time zone, defaults to Asia/Kolkata'),
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
