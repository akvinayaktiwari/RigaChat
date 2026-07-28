import type {
  AslChoiceState,
  AslState,
  AslStateMachine,
  AslTaskState,
  AslWaitState,
  JourneyDefinition,
  JourneyStep,
} from '../types/index.js'

// Both bounds enforce the polling-loop guardrail from the 2026-07-29 design
// addendum (resolving Open Question #7 of the approved agents-schedulers-
// journeys design). MIN_WAIT_DAYS forecloses "check every few minutes"
// patterns at the unit level (WaitStep/WaitAndRecheckStep only accept whole
// days). MAX_WAIT_AND_RECHECK_ITERATIONS bounds the one sanctioned repeat
// primitive so a compiled Journey can never approach Step Functions'
// 25,000-event execution-history ceiling -- see the design addendum's
// Feasibility Findings: ~15-25 linear steps land around 200-500 events, and
// this cap keeps the wait_and_recheck expansion (3 ASL states/iteration,
// ~4-6 events each) in the same order of magnitude even at its worst case.
export const MIN_WAIT_DAYS = 1
export const MAX_WAIT_AND_RECHECK_ITERATIONS = 30

const journeyExecutorLambdaArn = process.env.JOURNEY_EXECUTOR_LAMBDA_ARN

if (!journeyExecutorLambdaArn) {
  throw new Error(
    'Missing required environment variable JOURNEY_EXECUTOR_LAMBDA_ARN. Set it in your .env file before starting the server.'
  )
}

export class JourneyCompileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JourneyCompileError'
  }
}

// Every step reference (next/onTrue/onFalse/onSatisfied/onExhausted) must
// point to a LATER array index than the referring step. This is what makes
// a JourneyDefinition a DAG by construction -- no general graph-cycle
// detection needed, because no cycle can exist if every edge points
// strictly forward through an ordered list. This directly encodes the
// "step-list, not graph canvas" UX decision at the data-model level: the
// step-list builder can only ever produce structures this validator
// accepts.
export function validateJourneyStructure(journey: JourneyDefinition): void {
  const indexByStepId = new Map<string, number>()
  journey.steps.forEach((step, index) => indexByStepId.set(step.stepId, index))

  if (!indexByStepId.has(journey.startStepId)) {
    throw new JourneyCompileError(`startStepId "${journey.startStepId}" does not match any step`)
  }

  const assertForwardReference = (fromStep: JourneyStep, targetStepId: string, field: string): void => {
    const fromIndex = indexByStepId.get(fromStep.stepId)
    const targetIndex = indexByStepId.get(targetStepId)
    if (targetIndex === undefined) {
      throw new JourneyCompileError(`Step "${fromStep.stepId}" ${field} references unknown step "${targetStepId}"`)
    }
    if (fromIndex === undefined || targetIndex <= fromIndex) {
      throw new JourneyCompileError(
        `Step "${fromStep.stepId}" ${field} references "${targetStepId}", which is not later in the step list. ` +
          'Journeys must be forward-referencing only -- use a wait_and_recheck step to express "try again", not a loop.'
      )
    }
  }

  for (const step of journey.steps) {
    switch (step.type) {
      case 'send_message':
      case 'wait':
      case 'tool_call':
        if (step.next) assertForwardReference(step, step.next, 'next')
        break
      case 'wait_and_recheck':
        if (step.waitDays < MIN_WAIT_DAYS || !Number.isInteger(step.waitDays)) {
          throw new JourneyCompileError(
            `Step "${step.stepId}" waitDays must be an integer >= ${MIN_WAIT_DAYS} (whole days only -- ` +
              'no sub-day recheck intervals are permitted)'
          )
        }
        if (step.maxIterations < 1 || step.maxIterations > MAX_WAIT_AND_RECHECK_ITERATIONS || !Number.isInteger(step.maxIterations)) {
          throw new JourneyCompileError(
            `Step "${step.stepId}" maxIterations must be an integer between 1 and ${MAX_WAIT_AND_RECHECK_ITERATIONS}`
          )
        }
        assertForwardReference(step, step.onSatisfied, 'onSatisfied')
        assertForwardReference(step, step.onExhausted, 'onExhausted')
        break
      case 'condition':
        assertForwardReference(step, step.onTrue, 'onTrue')
        assertForwardReference(step, step.onFalse, 'onFalse')
        break
      case 'human_handoff':
        // Terminal by design -- no outgoing reference to validate.
        break
    }

    if (step.type === 'wait' && (step.waitDays < MIN_WAIT_DAYS || !Number.isInteger(step.waitDays))) {
      throw new JourneyCompileError(`Step "${step.stepId}" waitDays must be an integer >= ${MIN_WAIT_DAYS}`)
    }
  }
}

// wait_and_recheck is the only step type that expands to more than one ASL
// state (a Wait, a recheck Task, and a Choice), since Step Functions has no
// built-in "loop N times" primitive -- the iteration count has to be
// carried and checked explicitly via a counter threaded through each
// execution's JSON state, not something the state machine tracks on its
// own. Every OTHER step type maps 1:1 to a state named after its own
// stepId; wait_and_recheck's real entry point is "{stepId}_wait", not
// "{stepId}" itself. entryStateName() below is what every reference
// (StartAt, Next, onTrue/onFalse, onSatisfied/onExhausted) must be resolved
// through, so a reference to a wait_and_recheck step lands on its actual
// first state rather than a state name that was never emitted.
function entryStateName(step: JourneyStep): string {
  return step.type === 'wait_and_recheck' ? `${step.stepId}_wait` : step.stepId
}

function compileWaitAndRecheckStep(
  step: Extract<JourneyStep, { type: 'wait_and_recheck' }>,
  states: Record<string, AslState>,
  resolve: (stepId: string) => string
): void {
  const waitStateName = `${step.stepId}_wait`
  const recheckStateName = `${step.stepId}_recheck`
  const choiceStateName = `${step.stepId}_choice`

  states[waitStateName] = {
    Type: 'Wait',
    Seconds: step.waitDays * 86400,
    Next: recheckStateName,
  } satisfies AslWaitState

  states[recheckStateName] = {
    Type: 'Task',
    Resource: journeyExecutorLambdaArn as string,
    Parameters: {
      'operation': 'wait_and_recheck_check',
      'stepId': step.stepId,
      'recheckField': step.recheckField,
      'iterationCount.$': '$.iterationCount',
    },
    ResultPath: '$.recheckResult',
    Next: choiceStateName,
    Retry: [{ ErrorEquals: ['States.TaskFailed'], MaxAttempts: 3, IntervalSeconds: 30, BackoffRate: 2 }],
  } satisfies AslTaskState

  states[choiceStateName] = {
    Type: 'Choice',
    Choices: [
      { Variable: '$.recheckResult.satisfied', StringEquals: 'true', Next: resolve(step.onSatisfied) },
      { Variable: '$.recheckResult.iterationCount', NumericLessThanEquals: step.maxIterations, Next: waitStateName },
    ],
    Default: resolve(step.onExhausted),
  } satisfies AslChoiceState
}

export function compileJourneyToAsl(journey: JourneyDefinition): AslStateMachine {
  validateJourneyStructure(journey)

  const stepById = new Map(journey.steps.map((step) => [step.stepId, step]))
  const resolve = (stepId: string): string => {
    const target = stepById.get(stepId)
    return target ? entryStateName(target) : stepId
  }

  const states: Record<string, AslState> = {}

  for (const step of journey.steps) {
    switch (step.type) {
      case 'send_message':
        states[step.stepId] = {
          Type: 'Task',
          Resource: journeyExecutorLambdaArn as string,
          Parameters: { operation: 'send_message', stepId: step.stepId, messageHint: step.messageHint },
          ...(step.next ? { Next: resolve(step.next) } : { End: true }),
          Retry: [{ ErrorEquals: ['States.TaskFailed'], MaxAttempts: 3, IntervalSeconds: 30, BackoffRate: 2 }],
        } satisfies AslTaskState
        break

      case 'wait':
        states[step.stepId] = {
          Type: 'Wait',
          Seconds: step.waitDays * 86400,
          ...(step.next ? { Next: resolve(step.next) } : { End: true }),
        } satisfies AslWaitState
        break

      case 'wait_and_recheck':
        compileWaitAndRecheckStep(step, states, resolve)
        break

      case 'condition':
        states[step.stepId] = {
          Type: 'Choice',
          Choices: [{ Variable: `$.${step.field}`, StringEquals: step.value, Next: resolve(step.onTrue) }],
          Default: resolve(step.onFalse),
        } satisfies AslChoiceState
        break

      case 'tool_call':
        states[step.stepId] = {
          Type: 'Task',
          Resource: journeyExecutorLambdaArn as string,
          Parameters: { operation: 'tool_call', toolName: step.toolName, toolInput: step.toolInput },
          ...(step.next ? { Next: resolve(step.next) } : { End: true }),
          Retry: [{ ErrorEquals: ['States.TaskFailed'], MaxAttempts: 3, IntervalSeconds: 30, BackoffRate: 2 }],
        } satisfies AslTaskState
        break

      case 'human_handoff':
        states[step.stepId] = {
          Type: 'Task',
          Resource: journeyExecutorLambdaArn as string,
          Parameters: { operation: 'human_handoff', stepId: step.stepId, reason: step.reason },
          End: true,
        } satisfies AslTaskState
        break
    }
  }

  // No further "does every path terminate" check is needed here: forward-
  // reference-only validation (validateJourneyStructure above) already
  // guarantees it structurally. A condition/wait_and_recheck step can never
  // be the last element of journey.steps (its required onTrue/onFalse/
  // onSatisfied/onExhausted targets would have nothing later to point to,
  // which validateJourneyStructure already rejects), so the last reachable
  // step in any valid journey is always a send_message/wait/tool_call step
  // with no `next` (compiles to End: true) or a human_handoff step (always
  // End: true) -- termination falls out of the DAG-by-construction
  // invariant, not a separate check.
  return {
    Comment: `Compiled Journey: ${journey.name} (${journey.journeyId})`,
    StartAt: resolve(journey.startStepId),
    States: states,
  }
}
