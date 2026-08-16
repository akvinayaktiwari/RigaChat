import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { createScheduledAction } from '../services/scheduler-service.js'
import type { LeadSource, ScheduledAction } from '../types/index.js'

export interface ScheduleReminderInput {
  botId: string
  clientId: string
  leadId: string
  remindAt: string
  // Ride along so the fired reminder can find the lead outside the chat leads
  // table. journey-executor-service.ts's handleToolCall already passes both on
  // its `shared` payload -- they were being dropped here for want of a
  // declaration, which is what made every reminder resolve as a chat lead.
  leadSource?: LeadSource
  leadParentId?: string
}

// The other real (non-stub) MCP tool: reuses the Scheduler primitive built
// earlier this session rather than inventing a separate mechanism -- a
// reminder IS a one-off, lead-scoped wall-clock action, exactly what
// scheduler-service.ts's createScheduledAction already models. Real end to
// end as of 2026-08-16: the schedule fires and executeScheduledAction's
// 'lead_reminder' case notifies the client through notification-service.ts,
// where it used to be a console.log. Shared by both the MCP tool below and
// journey-executor-service.ts's direct in-process dispatch, same pattern as
// booking-mcp-server.ts.
export async function scheduleReminder(input: ScheduleReminderInput): Promise<ScheduledAction> {
  return createScheduledAction({
    clientId: input.clientId,
    botId: input.botId,
    leadId: input.leadId,
    actionType: 'lead_reminder',
    cadence: { type: 'one_off', at: input.remindAt },
    ...(input.leadSource ? { leadSource: input.leadSource } : {}),
    ...(input.leadParentId ? { leadParentId: input.leadParentId } : {}),
  })
}

export function createReminderMcpServer(): McpServer {
  const server = new McpServer({ name: 'reminder', version: '1.0.0' })

  server.registerTool(
    'schedule_reminder',
    {
      title: 'Schedule Reminder',
      description:
        'Schedules a one-off reminder for a specific lead at a future wall-clock time, via a real EventBridge Scheduler schedule. When it fires, the client is notified on WhatsApp with the lead and a link to it.',
      inputSchema: {
        botId: z.string(),
        clientId: z.string(),
        leadId: z.string(),
        remindAt: z.string().describe('ISO 8601 datetime, must be in the future'),
      },
    },
    async (args): Promise<CallToolResult> => {
      try {
        const action = await scheduleReminder(args)
        return { content: [{ type: 'text', text: JSON.stringify(action) }] }
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
