import { describe, expect, it } from 'vitest'
import { compileJourneyToAsl, JourneyCompileError, MAX_WAIT_AND_RECHECK_ITERATIONS } from './journey-compiler-service.js'
import type { JourneyDefinition } from '../types/index.js'

function baseJourney(steps: JourneyDefinition['steps'], startStepId = steps[0].stepId): JourneyDefinition {
  return {
    journeyId: 'journey-1',
    botId: 'bot-1',
    clientId: 'client-1',
    name: 'Test Journey',
    triggerType: 'lead_captured',
    startStepId,
    steps,
  }
}

describe('compileJourneyToAsl', () => {
  it('compiles a valid linear journey to ASL', () => {
    const journey = baseJourney([
      { stepId: 'greet', type: 'send_message', name: 'Greet', messageHint: 'hi', next: 'handoff' },
      { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
    ])

    const asl = compileJourneyToAsl(journey)

    expect(asl.StartAt).toBe('greet')
    expect(asl.States.greet).toMatchObject({ Type: 'Task', Next: 'handoff' })
    expect(asl.States.handoff).toMatchObject({ Type: 'Task', End: true })
  })

  // Regression guard for the "step-list, not graph canvas" architecture
  // decision: a backward reference must never compile, since that would
  // silently reintroduce the general-graph cycle risk the step-list model
  // was chosen specifically to avoid.
  it('rejects a step that references an earlier step (backward reference)', () => {
    const journey = baseJourney([
      { stepId: 'a', type: 'send_message', name: 'A', next: 'b' },
      { stepId: 'b', type: 'send_message', name: 'B', next: 'a' },
    ])

    expect(() => compileJourneyToAsl(journey)).toThrow(JourneyCompileError)
    expect(() => compileJourneyToAsl(journey)).toThrow(/forward-referencing/)
  })

  it('rejects a reference to an unknown step id', () => {
    const journey = baseJourney([{ stepId: 'a', type: 'send_message', name: 'A', next: 'ghost' }])

    expect(() => compileJourneyToAsl(journey)).toThrow(/unknown step/)
  })

  it('rejects a wait step under the minimum whole-day duration (structural polling guardrail)', () => {
    const journey = baseJourney([
      { stepId: 'w', type: 'wait', name: 'Wait', waitDays: 0, next: 'end' },
      { stepId: 'end', type: 'human_handoff', name: 'End' },
    ])

    expect(() => compileJourneyToAsl(journey)).toThrow(/waitDays must be an integer/)
  })

  it('rejects wait_and_recheck maxIterations above the compiled ceiling', () => {
    const journey = baseJourney([
      {
        stepId: 'poll',
        type: 'wait_and_recheck',
        name: 'Poll',
        waitDays: 1,
        maxIterations: MAX_WAIT_AND_RECHECK_ITERATIONS + 1,
        recheckField: 'replied',
        onSatisfied: 'end',
        onExhausted: 'end',
      },
      { stepId: 'end', type: 'human_handoff', name: 'End' },
    ])

    expect(() => compileJourneyToAsl(journey)).toThrow(/maxIterations must be an integer/)
  })

  it('expands wait_and_recheck into a bounded Wait/Task/Choice loop, not an unbounded one', () => {
    const journey = baseJourney([
      {
        stepId: 'poll',
        type: 'wait_and_recheck',
        name: 'Poll',
        waitDays: 2,
        maxIterations: 5,
        recheckField: 'replied',
        onSatisfied: 'booked',
        onExhausted: 'handoff',
      },
      { stepId: 'booked', type: 'human_handoff', name: 'Booked' },
      { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
    ])

    const asl = compileJourneyToAsl(journey)

    expect(asl.States.poll_wait).toMatchObject({ Type: 'Wait', Seconds: 2 * 86400, Next: 'poll_recheck' })
    const recheck = asl.States.poll_recheck as { Type: 'Task'; Next: string; Parameters: Record<string, unknown> }
    expect(recheck).toMatchObject({ Type: 'Task', Next: 'poll_choice' })
    // maxIterations travels as a static value (known at compile time); no
    // iterationCount is threaded through Step Functions' own JSON state --
    // journey-executor-service.ts tracks that itself. See the "regression"
    // test below for what broke when it WAS threaded this way.
    expect(recheck.Parameters).toMatchObject({ maxIterations: 5 })
    expect(recheck.Parameters).not.toHaveProperty('iterationCount.$')

    // Default is the loop-back (bounded by the executor's own maxIterations
    // enforcement, not by this Choice state) -- onSatisfied/onExhausted are
    // both explicit BooleanEquals branches, never the fallthrough.
    const choice = asl.States.poll_choice as {
      Type: 'Choice'
      Default: string
      Choices: { Variable: string; BooleanEquals?: boolean; Next: string }[]
    }
    expect(choice.Default).toBe('poll_wait')
    expect(choice.Choices).toEqual([
      { Variable: '$.recheckResult.satisfied', BooleanEquals: true, Next: 'booked' },
      { Variable: '$.recheckResult.exhausted', BooleanEquals: true, Next: 'handoff' },
    ])
  })

  // Regression test for the bug this compiler shipped with initially: the
  // Choice state used to read $.iterationCount fresh on every loop
  // iteration, but nothing ever promoted the incremented count from
  // $.recheckResult back to that top-level path (Task Parameters fully
  // replaces $, it doesn't merge) -- the counter never actually advanced,
  // so a "bounded" loop was runtime-unbounded in practice. Iteration
  // counting now lives entirely in journey-executor-service.ts via an
  // atomic DynamoDB counter, not in Step Functions' own state.
  it('does not thread an iteration counter through Step Functions JSON state', () => {
    const journey = baseJourney([
      {
        stepId: 'poll',
        type: 'wait_and_recheck',
        name: 'Poll',
        waitDays: 1,
        maxIterations: 3,
        recheckField: 'replied',
        onSatisfied: 'end',
        onExhausted: 'end',
      },
      { stepId: 'end', type: 'human_handoff', name: 'End' },
    ])

    const asl = compileJourneyToAsl(journey)

    const choice = asl.States.poll_choice as { Choices: { Variable: string }[] }
    expect(choice.Choices.every((c) => !c.Variable.includes('iterationCount'))).toBe(true)
  })

  it('passes execution context (botId/bundleId/clientId/leadId/channel) through to every Task state', () => {
    const journey = baseJourney([
      { stepId: 'greet', type: 'send_message', name: 'Greet', next: 'handoff' },
      { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
    ])

    const asl = compileJourneyToAsl(journey)

    const greet = asl.States.greet as { Parameters: Record<string, unknown> }
    expect(greet.Parameters).toMatchObject({
      'botId.$': '$.botId',
      'bundleId.$': '$.bundleId',
      'clientId.$': '$.clientId',
      'leadId.$': '$.leadId',
      'channel.$': '$.channel',
    })
  })

  // A reference to a wait_and_recheck step's bare stepId (e.g. from a
  // condition's onTrue, or as StartAt) must resolve to that step's real
  // entry state ("{stepId}_wait"), not a state that was never emitted --
  // this is the same class of bug the earlier "expands wait_and_recheck"
  // test caught for Choice-internal references, checked here for an
  // external reference into the wait_and_recheck step.
  it('resolves an external reference into a wait_and_recheck step to its _wait entry state', () => {
    const journey = baseJourney(
      [
        { stepId: 'gate', type: 'condition', name: 'Gate', field: 'lead_score', operator: 'equals', value: 'hot', onTrue: 'poll', onFalse: 'handoff' },
        {
          stepId: 'poll',
          type: 'wait_and_recheck',
          name: 'Poll',
          waitDays: 1,
          maxIterations: 3,
          recheckField: 'replied',
          onSatisfied: 'handoff',
          onExhausted: 'handoff',
        },
        { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
      ],
      'gate'
    )

    const asl = compileJourneyToAsl(journey)

    const gate = asl.States.gate as { Type: 'Choice'; Choices: { Next: string }[] }
    expect(gate.Choices[0].Next).toBe('poll_wait')
    expect(asl.States.poll_wait).toBeDefined()
    expect(asl.States.poll).toBeUndefined()
  })
})
