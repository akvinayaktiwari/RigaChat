import { createHash } from 'node:crypto'
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  SFNClient,
  StartExecutionCommand,
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
    return { stateMachineArn: existingArn, versionArn: updated.stateMachineVersionArn }
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
    return { stateMachineArn: created.stateMachineArn, versionArn: created.stateMachineVersionArn }
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
export async function startExecution(
  versionArn: string,
  executionName: string,
  input: Record<string, unknown>
): Promise<StartExecutionResult> {
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
    return { started: true, executionArn: result.executionArn }
  } catch (error) {
    if (error instanceof Error && error.name === 'ExecutionAlreadyExists') {
      return { started: false, reason: 'already_started' }
    }
    throw error
  }
}

// Tolerates an already-deleted machine, same reasoning as
// eventbridge-scheduler.ts's deleteSchedule. Note that Step Functions marks a
// machine DELETING and lets in-flight executions finish, so deleting a bundle
// does not strand leads mid-journey.
export async function deleteStateMachine(stateMachineArn: string): Promise<void> {
  try {
    await client.send(new DeleteStateMachineCommand({ stateMachineArn }))
  } catch (error) {
    if (error instanceof Error && error.name === 'StateMachineDoesNotExist') return
    throw error
  }
}
