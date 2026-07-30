import { v4 as uuidv4 } from 'uuid'
import { createSchedule, deleteSchedule, updateSchedule } from '../lib/eventbridge-scheduler.js'
import {
  createScheduledAction as createScheduledActionRepo,
  deleteScheduledAction as deleteScheduledActionRepo,
  getScheduledActionById,
  getScheduledActionsByClientId,
  updateScheduledAction as updateScheduledActionRepo,
} from '../repositories/scheduled-action-repository.js'
import { sendWeeklyReport } from './whatsapp-service.js'
import { resolveOwningAgentId } from './agent-service.js'
import type { ScheduleCadence, ScheduledAction, ScheduledActionType } from '../types/index.js'

export class ScheduleValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScheduleValidationError'
  }
}

const MIN_INTERVAL_DAYS = 1

// EventBridge Scheduler's own expression syntax -- rate() for recurring,
// at() for a single wall-clock moment. Pure and unit-testable on purpose,
// same shape as journey-compiler-service.ts's compileJourneyToAsl(): given
// a cadence, deterministically produce the string EventBridge expects, with
// validation happening here rather than being discovered as an
// EventBridge-side rejection at request time.
export function compileScheduleExpression(cadence: ScheduleCadence): string {
  if (cadence.type === 'interval_days') {
    if (!Number.isInteger(cadence.intervalDays) || cadence.intervalDays < MIN_INTERVAL_DAYS) {
      throw new ScheduleValidationError(`intervalDays must be an integer >= ${MIN_INTERVAL_DAYS}`)
    }
    return `rate(${cadence.intervalDays} day${cadence.intervalDays === 1 ? '' : 's'})`
  }

  const at = new Date(cadence.at)
  if (Number.isNaN(at.getTime())) {
    throw new ScheduleValidationError(`"${cadence.at}" is not a valid ISO 8601 datetime`)
  }
  if (at.getTime() <= Date.now()) {
    throw new ScheduleValidationError('one_off cadence must be in the future')
  }
  // EventBridge's at() expression takes no timezone suffix or milliseconds --
  // yyyy-mm-ddThh:mm:ss, always interpreted in the schedule's configured
  // time zone (UTC here, since no ScheduleExpressionTimezone is set on
  // create/update in lib/eventbridge-scheduler.ts).
  return `at(${at.toISOString().slice(0, 19)})`
}

interface CreateScheduledActionInput {
  clientId: string
  actionType: ScheduledActionType
  cadence: ScheduleCadence
  // Only meaningful for lead-scoped actions (lead_reminder) -- absent for
  // account-level ones (weekly_report). See ScheduledAction's own comment.
  leadId?: string
  botId?: string
}

export async function createScheduledAction(input: CreateScheduledActionInput): Promise<ScheduledAction> {
  const scheduleExpression = compileScheduleExpression(input.cadence)
  const scheduleId = uuidv4()

  await createSchedule(scheduleId, scheduleExpression, {
    clientId: input.clientId,
    actionType: input.actionType,
    leadId: input.leadId,
    botId: input.botId,
  })

  // Lead-scoped actions carry a botId; stamp the owning Agent when that bot is
  // wrapped in one. Account-level actions (weekly_report) have no botId and so
  // no agentId. Additive/optional.
  const agentId = input.botId ? await resolveOwningAgentId(input.botId, input.clientId) : undefined

  try {
    return await createScheduledActionRepo({
      scheduleId,
      clientId: input.clientId,
      actionType: input.actionType,
      cadence: input.cadence,
      leadId: input.leadId,
      botId: input.botId,
      ...(agentId ? { agentId } : {}),
      enabled: true,
    })
  } catch (error) {
    // The EventBridge schedule was created successfully above; if
    // persisting the DynamoDB row then fails, delete it rather than leaving
    // a live schedule with no corresponding record a client could ever see
    // or manage -- an orphaned schedule that silently fires forever is
    // worse than a failed create the caller can retry.
    await deleteSchedule(scheduleId).catch((cleanupError) =>
      console.error(`Failed to clean up orphaned EventBridge schedule ${scheduleId}:`, cleanupError)
    )
    throw error
  }
}

export async function getScheduledActions(clientId: string): Promise<ScheduledAction[]> {
  return getScheduledActionsByClientId(clientId)
}

async function getOwnedScheduledAction(clientId: string, scheduleId: string): Promise<ScheduledAction> {
  const action = await getScheduledActionById(clientId, scheduleId)
  if (!action) {
    throw new Error('Scheduled action not found')
  }
  return action
}

export async function updateScheduledActionCadence(
  clientId: string,
  scheduleId: string,
  cadence: ScheduleCadence
): Promise<ScheduledAction> {
  const existing = await getOwnedScheduledAction(clientId, scheduleId)
  const scheduleExpression = compileScheduleExpression(cadence)

  await updateSchedule(scheduleId, scheduleExpression, { clientId, actionType: existing.actionType })

  return updateScheduledActionRepo(clientId, scheduleId, { cadence })
}

export async function deleteScheduledAction(clientId: string, scheduleId: string): Promise<void> {
  await getOwnedScheduledAction(clientId, scheduleId)
  await deleteSchedule(scheduleId)
  await deleteScheduledActionRepo(clientId, scheduleId)
}

// Called by backend/index.ts's Lambda handler when EventBridge Scheduler
// invokes a per-client schedule. Routes to the right action's real
// execution logic -- the single place a new ScheduledActionType's handler
// gets registered as more action types are added.
export async function executeScheduledAction(
  clientId: string,
  actionType: ScheduledActionType,
  context?: { leadId?: string; botId?: string }
): Promise<void> {
  switch (actionType) {
    case 'weekly_report':
      await sendWeeklyReport(clientId)
      return
    case 'lead_reminder':
      // STUB, same as journey-executor-service.ts's send-related stubs: no
      // notification infra exists yet to actually remind anyone. The real,
      // non-stub part of this feature is that a live EventBridge schedule
      // got created for this specific lead at the client-requested time
      // (backend/src/mcp/reminder-mcp-server.ts) -- what happens when it
      // fires is the same undesigned piece as send_message.
      console.log(
        `[scheduler] STUB lead_reminder fired: client=${clientId} lead=${context?.leadId} bot=${context?.botId}`
      )
      return
  }
}
