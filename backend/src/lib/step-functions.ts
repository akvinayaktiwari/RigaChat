import { createHash } from 'node:crypto'
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  SendTaskFailureCommand,
  SendTaskSuccessCommand,
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
  UpdateStateMachineCommand,
} from '@aws-sdk/client-sfn'

// Mirrors lib/eventbridge-scheduler.ts's shape (thin SDK wrapper, no business
// logic) with one deliberate difference: env vars are read at CALL time, not at
// module load. eventbridge-scheduler and journey-compiler-service both throw at
// import, and because backend/index.ts imports the whole route tree into one
// Lambda serving the public widget, the dashboard AND the journey executor,
// a single missing var 500s every route rather than breaking one feature.
// Not reproducing that here; the existing two get the same treatment separately.
const client = new SFNClient({ region: process.env.AWS_REGION })

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in your .env file before starting the server.`
    )
  }
  return value
}

// The IAM role Step Functions itself assumes to invoke the journey executor
// Lambda. Distinct from SCHEDULER_EXECUTION_ROLE_ARN (which EventBridge
// Scheduler assumes) -- different trust policy, different principal
// (states.amazonaws.com vs scheduler.amazonaws.com). Provisioning it is a
// deploy step, not something this module does.
function stateMachineRoleArn(): string {
  return requireEnv('JOURNEY_STATE_MACHINE_ROLE_ARN')
}

// Step Functions caps state machine names at 80 characters and forbids a set of
// special characters. A client-supplied bundle name could violate both, so the
// name is derived, never passed through.
export function stateMachineNameFor(clientId: string, bundleId: string): string {
  return `vyostra-${clientId.slice(0, 8)}-${bundleId.slice(0, 8)}-${shortHash(`${clientId}:${bundleId}`)}`
}

// Execution names are also capped at 80 characters, and this one must be
// DETERMINISTIC: StartExecution is idempotent by name on Standard workflows, so
// a stable name is what makes a retried ignition a no-op instead of a second
// journey messaging the same lead twice. Two UUIDs plus a version would be 78
// characters -- inside the cap only while the version stays under four digits,
// which is too thin a margin to rely on, hence the hash.
export function executionNameFor(leadId: string, bundleId: string, version: number): string {
  return `j-${bundleId.slice(0, 8)}-${shortHash(`${leadId}:${bundleId}:${version}`)}`
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

export interface PublishedStateMachine {
  stateMachineArn: string
  // The immutable published VERSION arn, which is what executions must target.
  // Starting against the unqualified stateMachineArn would reintroduce the bug
  // this exists to prevent: state machine updates are eventually consistent, so
  // an execution started just after a publish can silently run the PREVIOUS
  // definition while our records label it as the new version.
  versionArn: string
  // Parsed out of versionArn, never counted. Step Functions does NOT mint a new
  // version when the definition is unchanged, so republishing an unedited
  // bundle legitimately returns the SAME version. An incrementing counter would
  // drift from reality on the very first no-op republish -- caught live on
  // 2026-08-06, where a bundle recorded version 2 while pointing at ...:1.
  version: number
}

// Version arns end in ':<n>'. Anything else means AWS returned a shape this
// code does not understand, and guessing a version number is exactly the drift
// this function exists to prevent.
function versionNumberFrom(versionArn: string): number {
  const parsed = Number(versionArn.slice(versionArn.lastIndexOf(':') + 1))
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Could not parse a version number from state machine version arn "${versionArn}"`)
  }
  return parsed
}

// Creates the state machine on first publish, updates it on republish, and in
// both cases publishes an immutable version in the SAME call (publish: true).
// One call rather than a separate PublishStateMachineVersion avoids a window
// where the definition is live but no version exists to start against.
export async function createOrUpdateStateMachine(
  name: string,
  definition: string,
  existingArn?: string
): Promise<PublishedStateMachine> {
  if (existingArn) {
    const updated = await client.send(
      new UpdateStateMachineCommand({
        stateMachineArn: existingArn,
        definition,
        roleArn: stateMachineRoleArn(),
        publish: true,
      })
    )
    if (!updated.stateMachineVersionArn) {
      throw new Error(`Step Functions did not return a version arn when updating ${existingArn}`)
    }
    return {
      stateMachineArn: existingArn,
      versionArn: updated.stateMachineVersionArn,
      version: versionNumberFrom(updated.stateMachineVersionArn),
    }
  }

  try {
    const created = await client.send(
      new CreateStateMachineCommand({
        name,
        definition,
        roleArn: stateMachineRoleArn(),
        type: 'STANDARD',
        publish: true,
      })
    )
    if (!created.stateMachineArn || !created.stateMachineVersionArn) {
      throw new Error(`Step Functions did not return an arn when creating state machine ${name}`)
    }
    return {
      stateMachineArn: created.stateMachineArn,
      versionArn: created.stateMachineVersionArn,
      version: versionNumberFrom(created.stateMachineVersionArn),
    }
  } catch (error) {
    // Recovery for the one window this operation cannot otherwise survive: a
    // crash after CreateStateMachine succeeded but before the bundle record
    // learned its arn. On retry the bundle still looks unpublished, so we come
    // down this branch again and AWS rejects the duplicate name. The name is
    // deterministic and the arn format is fixed, so the machine is findable
    // rather than orphaned -- without this, that bundle could never be
    // published again.
    if (error instanceof Error && error.name === 'StateMachineAlreadyExists') {
      return createOrUpdateStateMachine(name, definition, deriveStateMachineArn(name))
    }
    throw error
  }
}

// arn:aws:states:{region}:{account}:stateMachine:{name}. The account id is
// lifted from JOURNEY_EXECUTOR_LAMBDA_ARN, which this service already requires
// and which necessarily belongs to the same account -- cheaper and more
// reliable than paging ListStateMachines to find one by name.
function deriveStateMachineArn(name: string): string {
  const executorArn = requireEnv('JOURNEY_EXECUTOR_LAMBDA_ARN')
  const [, partition, , region, accountId] = executorArn.split(':')

  if (!partition || !region || !accountId) {
    throw new Error(`Cannot derive a state machine arn: JOURNEY_EXECUTOR_LAMBDA_ARN is malformed ("${executorArn}")`)
  }

  return `arn:${partition}:states:${region}:${accountId}:stateMachine:${name}`
}

export type StartExecutionResult =
  | { started: true; executionArn: string }
  | { started: false; reason: 'already_started' }

// Idempotent by construction. On Standard workflows StartExecution with a name
// already used returns the original execution (same input) or throws
// ExecutionAlreadyExists (different input); both mean "this lead is already in
// this journey," which is a successful no-op rather than an error. Without
// this, a Lambda retry after a crash between StartExecution and the DynamoDB
// write would message the lead twice.
// Clock skew between this process and AWS makes an exact comparison unsafe, so
// an execution whose startDate is within this window of our own call is treated
// as newly started.
//
// KNOWN LIMITATION, and it is a reporting limitation only: two ignitions less
// than this far apart both report `started`, because their startDates are
// indistinguishable given skew. Verified live on 2026-08-06 with back-to-back
// calls ~1s apart. This does NOT weaken the safety property -- AWS returned the
// SAME executionArn both times, so no second journey ran and the lead was not
// messaged twice. Real retries (Lambda async retry, Meta webhook redelivery)
// are minutes apart and are classified correctly. Making this exact would need
// a dedupe row keyed by execution name, which is real infrastructure to buy
// accuracy on a log line, not on behaviour.
const NEW_EXECUTION_SKEW_TOLERANCE_MS = 10_000

export async function startExecution(
  versionArn: string,
  executionName: string,
  input: Record<string, unknown>
): Promise<StartExecutionResult> {
  const calledAt = Date.now()

  try {
    const result = await client.send(
      new StartExecutionCommand({
        stateMachineArn: versionArn,
        name: executionName,
        input: JSON.stringify(input),
      })
    )
    if (!result.executionArn) {
      throw new Error(`Step Functions did not return an execution arn for ${executionName}`)
    }

    // Two different "already running" shapes, and only one is an error.
    // Same name + DIFFERENT input throws ExecutionAlreadyExists (caught below).
    // Same name + SAME input -- the ordinary retry, since our input is
    // deterministic -- succeeds and hands back the ORIGINAL execution, with its
    // original startDate. Reporting that as a fresh start would make a retry
    // indistinguishable from a first ignition on the lead's record. Verified
    // live on 2026-08-06: a second ignite returned the first execution's arn.
    const startedAt = result.startDate?.getTime()
    if (startedAt !== undefined && startedAt < calledAt - NEW_EXECUTION_SKEW_TOLERANCE_MS) {
      return { started: false, reason: 'already_started' }
    }

    return { started: true, executionArn: result.executionArn }
  } catch (error) {
    if (error instanceof Error && error.name === 'ExecutionAlreadyExists') {
      return { started: false, reason: 'already_started' }
    }
    throw error
  }
}

export type ResumeResult =
  | { resumed: true }
  // Every one of these is an expected end state, not an error: the execution
  // already moved on. A lead replying twice, or replying just after the 24h
  // window closed, is ordinary behaviour and must not surface as a failure.
  | { resumed: false; reason: 'token_expired' | 'token_unknown' }

// Hands the lead's reply back to the paused execution. The token is the entire
// authorisation to resume, which is why callers must use one WE stored against
// that lead rather than anything supplied by the request being handled.
export async function resumeAwaitingExecution(
  taskToken: string,
  output: Record<string, unknown>
): Promise<ResumeResult> {
  try {
    await client.send(new SendTaskSuccessCommand({ taskToken, output: JSON.stringify(output) }))
    return { resumed: true }
  } catch (error) {
    if (error instanceof Error) {
      // The 24h window closed and Step Functions already routed the execution
      // down onNoReply.
      if (error.name === 'TaskTimedOut') return { resumed: false, reason: 'token_expired' }
      // Token already consumed, or belongs to an execution that has since been
      // stopped or deleted.
      if (error.name === 'TaskDoesNotExist' || error.name === 'InvalidToken') {
        return { resumed: false, reason: 'token_unknown' }
      }
    }
    throw error
  }
}

// Used to abandon a paused execution deliberately -- an opt-out, or a client
// deleting the journey out from under a lead. Same tolerance for an execution
// that has already moved on.
export async function failAwaitingExecution(
  taskToken: string,
  errorName: string,
  cause: string
): Promise<ResumeResult> {
  try {
    await client.send(new SendTaskFailureCommand({ taskToken, error: errorName, cause }))
    return { resumed: true }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TaskTimedOut') return { resumed: false, reason: 'token_expired' }
      if (error.name === 'TaskDoesNotExist' || error.name === 'InvalidToken') {
        return { resumed: false, reason: 'token_unknown' }
      }
    }
    throw error
  }
}

// Tolerates an already-deleted machine, same reasoning as
// eventbridge-scheduler.ts's deleteSchedule.
//
// DELETION IS NOT SAFE FOR RUNNING EXECUTIONS. An earlier version of this
// comment claimed Step Functions lets in-flight executions finish; observed
// behaviour on 2026-08-06 contradicts it. Deleting a machine with a running
// execution failed that execution outright (`States.Runtime: State machine ...
// has been deleted`), while a second execution on the same machine kept running
// and held the machine in DELETING until stopped explicitly. So deletion can
// both strand a lead mid-journey AND leave the machine lingering.
//
// Nothing here prevents that -- warning a client before they delete a published
// journey is a product decision, tracked rather than silently patched.
export async function deleteStateMachine(stateMachineArn: string): Promise<void> {
  try {
    await client.send(new DeleteStateMachineCommand({ stateMachineArn }))
  } catch (error) {
    if (error instanceof Error && error.name === 'StateMachineDoesNotExist') return
    throw error
  }
}

// Stops one execution, and treats "it was not running" as success.
//
// Used by lead erasure: a journey still messaging someone whose data is being
// deleted has to be stopped, not left to discover the lead is gone. Deriving
// the execution arn from the state machine arn rather than rebuilding it from
// region/account keeps the one authoritative copy of those values in the
// bundle record, where publishing already put them.
export function executionArnFor(stateMachineArn: string, executionName: string): string {
  // arn:aws:states:REGION:ACCOUNT:stateMachine:NAME  ->
  // arn:aws:states:REGION:ACCOUNT:execution:NAME:EXECUTION
  const base = stateMachineArn.replace(':stateMachine:', ':execution:')
  // A version arn (…:stateMachine:NAME:3) must lose its version suffix: an
  // execution arn names the machine, never the version it started against.
  const withoutVersion = base.replace(/:\d+$/, '')
  return `${withoutVersion}:${executionName}`
}

export async function stopExecution(executionArn: string, cause: string): Promise<boolean> {
  try {
    await client.send(new StopExecutionCommand({ executionArn, cause, error: 'LeadErased' }))
    return true
  } catch (error) {
    // ExecutionDoesNotExist is the normal case: most leads have no running
    // journey, and a finished one cannot be stopped. Neither is a failure of
    // the erasure, so they must not abort it.
    const name = error instanceof Error ? error.name : ''
    if (name === 'ExecutionDoesNotExist' || name === 'ExecutionLimitExceeded') return false
    console.error(`[step-functions] failed to stop ${executionArn}:`, error)
    return false
  }
}
