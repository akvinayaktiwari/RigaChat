import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler'

const client = new SchedulerClient({ region: process.env.AWS_REGION })

// Resolved per call, NOT at module load. This file used to throw on import if
// either var was unset, and because backend/index.ts pulls the whole route tree
// into one Lambda that also serves /api/chat for every client's live widget, a
// single missing scheduler var took down every route on cold start -- the
// scheduler feature failing is correct, a company-wide outage is not.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

// EventBridge Scheduler always invokes backend/index.ts's main (buffered)
// Lambda directly -- same target the existing hardcoded weekly-report rule
// already uses (see backend/index.ts's 'aws.events' branch), just via a
// per-client schedule object instead of one global rule. The IAM role
// EventBridge Scheduler assumes to invoke that Lambda is assumed
// pre-provisioned (SCHEDULER_EXECUTION_ROLE_ARN) -- creating it is a
// deployment decision, not something this module does.
function buildTarget(input: Record<string, unknown>): { Arn: string; RoleArn: string; Input: string } {
  return {
    Arn: requireEnv('SCHEDULER_TARGET_LAMBDA_ARN'),
    RoleArn: requireEnv('SCHEDULER_EXECUTION_ROLE_ARN'),
    Input: JSON.stringify({ source: 'aws.events', 'detail-type': 'scheduled-action', detail: input }),
  }
}

export async function createSchedule(
  scheduleId: string,
  scheduleExpression: string,
  input: Record<string, unknown>
): Promise<void> {
  await client.send(
    new CreateScheduleCommand({
      Name: scheduleId,
      ScheduleExpression: scheduleExpression,
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: buildTarget(input),
      // EventBridge Scheduler only supports DELETE or NONE here -- no
      // "disable and keep" option. A one-off (at()) schedule self-deletes
      // once it fires, so it doesn't sit around indefinitely; deleteSchedule
      // below is what a client calls to cancel one BEFORE it fires, and
      // must tolerate the target already being gone (see its own comment).
      ActionAfterCompletion: scheduleExpression.startsWith('at(') ? 'DELETE' : undefined,
    })
  )
}

export async function updateSchedule(
  scheduleId: string,
  scheduleExpression: string,
  input: Record<string, unknown>
): Promise<void> {
  await client.send(
    new UpdateScheduleCommand({
      Name: scheduleId,
      ScheduleExpression: scheduleExpression,
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: buildTarget(input),
      ActionAfterCompletion: scheduleExpression.startsWith('at(') ? 'DELETE' : undefined,
    })
  )
}

// Idempotent: a one-off (at()) schedule self-deletes after firing (see
// createSchedule's ActionAfterCompletion above), so a client cancelling one
// that already fired -- or scheduler-service.ts's own cleanup path after a
// failed DynamoDB write -- would otherwise hit ResourceNotFoundException on
// something that's already gone. Treated as success either way.
export async function deleteSchedule(scheduleId: string): Promise<void> {
  try {
    await client.send(new DeleteScheduleCommand({ Name: scheduleId }))
  } catch (error) {
    if (error instanceof Error && error.name === 'ResourceNotFoundException') return
    throw error
  }
}
