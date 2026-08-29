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
    // Terminal steps no longer End: true in place — every exit routes through a
    // synthetic state so the ending gets recorded exactly once.
    expect(asl.States.handoff).toMatchObject({ Type: 'Task', Next: '__journey_handed_off' })
  })

// The whole point of the terminal states: before them, a journey ended at
// whichever step happened to have no `next`, nothing observed it, and
// journey_ended sat in LeadEventType with zero call sites. A finished journey
// and a dead one were indistinguishable in the data.
describe('terminal states', () => {
  const linear = () =>
    compileJourneyToAsl(
      baseJourney([
        { stepId: 'greet', type: 'send_message', name: 'Greet', messageHint: 'hi' },
      ])
    )

  it('routes a step with no next to the completed terminal instead of ending in place', () => {
    const asl = linear()
    expect(asl.States.greet).toMatchObject({ Type: 'Task', Next: '__journey_completed' })
    expect(asl.States.greet).not.toHaveProperty('End')
  })

  it('emits all three outcomes, each with its outcome static in Parameters', () => {
    // Needs a journey where all three are genuinely REACHABLE: a linear journey
    // has no handoff, and Step Functions rejects an unreachable state.
    const asl = compileJourneyToAsl(
      baseJourney([
        { stepId: 'greet', type: 'send_message', name: 'Greet', messageHint: 'hi', next: 'maybe' },
        // A condition gives one branch that ends and one that hands off, so
        // completed AND handed_off are both genuinely reachable.
        { stepId: 'maybe', type: 'condition', name: 'Replied?', field: 'replied', operator: 'equals', value: 'true', onTrue: 'done', onFalse: 'handoff' },
        { stepId: 'done', type: 'send_message', name: 'Done' },
        { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
      ])
    )
    expect(asl.States.__journey_completed).toMatchObject({
      Type: 'Task',
      Parameters: { operation: 'journey_ended', outcome: 'completed' },
      End: true,
    })
    expect(asl.States.__journey_handed_off).toMatchObject({
      Parameters: { operation: 'journey_ended', outcome: 'handed_off' },
    })
    expect(asl.States.__journey_failed).toMatchObject({
      Parameters: { operation: 'journey_ended', outcome: 'failed' },
    })
  })

  // Order matters: record the failure, THEN fail. Ending on a Succeed would
  // make a crashed journey report success in the Step Functions console.
  it('fails the execution AFTER recording, not instead of recording', () => {
    const asl = linear()
    expect(asl.States.__journey_failed).toMatchObject({ Next: '__journey_failed_terminal' })
    expect(asl.States.__journey_failed_terminal).toMatchObject({ Type: 'Fail' })
  })

  it('carries the whole caught error object, never a JSONPath into it', () => {
    const asl = linear()
    const params = (asl.States.__journey_failed as { Parameters: Record<string, unknown> }).Parameters
    // $.journeyError.Cause would throw States.Runtime when Cause is absent —
    // the journey would fail while recording that it failed.
    expect(params['journeyError.$']).toBe('$.journeyError')
    // And the success terminals must NOT reference a path that does not exist
    // on their branch.
    const okParams = (asl.States.__journey_completed as { Parameters: Record<string, unknown> }).Parameters
    expect(okParams['journeyError.$']).toBeUndefined()
  })

  it('gives every Task a catch-all that routes to the failed terminal', () => {
    const asl = compileJourneyToAsl(
      baseJourney([
        { stepId: 'call', type: 'tool_call', name: 'Book', toolName: 'booking', toolInput: { requestedAt: 'x' } },
      ])
    )
    expect(asl.States.call).toMatchObject({
      Catch: [{ ErrorEquals: ['States.ALL'], Next: '__journey_failed', ResultPath: '$.journeyError' }],
    })
  })

  // States.ALL matches a timeout too, and Step Functions takes the FIRST match.
  // Ordering the catch-all first would turn every unanswered message into a
  // failed journey instead of taking the onNoReply branch.
  it('keeps await_reply timeout ahead of the catch-all', () => {
    const asl = compileJourneyToAsl(
      baseJourney([
        { stepId: 'ask', type: 'await_reply', name: 'Ask', next: 'thanks', onNoReply: 'nudge' },
        { stepId: 'thanks', type: 'send_message', name: 'Thanks' },
        { stepId: 'nudge', type: 'send_message', name: 'Nudge' },
      ])
    )
    const c = (asl.States.ask as { Catch: { ErrorEquals: string[]; Next: string }[] }).Catch
    expect(c[0]).toMatchObject({ ErrorEquals: ['States.Timeout'], Next: 'nudge' })
    expect(c[1]).toMatchObject({ ErrorEquals: ['States.ALL'], Next: '__journey_failed' })
  })

  // REGRESSION, found by the observability drill on the first journey without a
  // handoff step. Step Functions rejects a definition containing an unreachable
  // state, so emitting all three terminals unconditionally made every journey
  // WITHOUT a human_handoff step fail to publish:
  //   InvalidDefinition: MISSING_TRANSITION_TARGET:
  //     State "__journey_handed_off" is not reachable.
  it('omits the handoff terminal when no step hands off', () => {
    const asl = compileJourneyToAsl(
      baseJourney([{ stepId: 'greet', type: 'send_message', name: 'Greet', messageHint: 'hi' }])
    )

    expect(asl.States.__journey_handed_off).toBeUndefined()
    expect(asl.States.__journey_completed).toBeDefined()
  })

  it('omits the completed terminal when every path hands off', () => {
    const asl = compileJourneyToAsl(baseJourney([{ stepId: 'handoff', type: 'human_handoff', name: 'Handoff' }]))

    expect(asl.States.__journey_completed).toBeUndefined()
    expect(asl.States.__journey_handed_off).toBeDefined()
  })

  // A journey of nothing but Wait states has no Task, so nothing carries the
  // catch-all, so the failure terminal is unreachable too.
  it('omits the failure terminal when no state can fail', () => {
    const asl = compileJourneyToAsl(baseJourney([{ stepId: 'hold', type: 'wait', name: 'Hold', waitDays: 1 }]))

    expect(asl.States.__journey_failed).toBeUndefined()
    expect(asl.States.__journey_failed_terminal).toBeUndefined()
    expect(asl.States.__journey_completed).toBeDefined()
  })

  // The real invariant behind all three: Step Functions rejects ANY unreachable
  // state, so every emitted state must be a transition target or the StartAt.
  it('emits no unreachable state, whatever the journey shape', () => {
    for (const journey of [
      baseJourney([{ stepId: 'greet', type: 'send_message', name: 'Greet' }]),
      baseJourney([{ stepId: 'handoff', type: 'human_handoff', name: 'Handoff' }]),
      baseJourney([{ stepId: 'hold', type: 'wait', name: 'Hold', waitDays: 1 }]),
      baseJourney([
        { stepId: 'greet', type: 'send_message', name: 'Greet', next: 'handoff' },
        { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
      ]),
    ]) {
      const asl = compileJourneyToAsl(journey)
      const targets = new Set<string>([asl.StartAt])
      for (const state of Object.values(asl.States) as unknown as Record<string, unknown>[]) {
        if (typeof state.Next === 'string') targets.add(state.Next)
        if (typeof state.Default === 'string') targets.add(state.Default)
        for (const c of (state.Choices as { Next: string }[] | undefined) ?? []) targets.add(c.Next)
        for (const c of (state.Catch as { Next: string }[] | undefined) ?? []) targets.add(c.Next)
      }
      const unreachable = Object.keys(asl.States).filter((name) => !targets.has(name))
      expect(unreachable).toEqual([])
    }
  })

  // A stepId colliding with a terminal name would silently overwrite it in the
  // states map and lose either the step or the ending.
  it('rejects a stepId in the compiler reserved namespace', () => {
    expect(() =>
      compileJourneyToAsl(baseJourney([{ stepId: '__journey_completed', type: 'send_message', name: 'Sneaky' }]))
    ).toThrow(JourneyCompileError)
  })
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

// REGRESSION, verified against real Step Functions before it was fixed. A Task
// without ResultPath has its result REPLACE the state output, so the next
// state's Parameters resolve against the Lambda's return value instead of the
// execution context:
//
//   States.Runtime: The JSONPath '$.botId' specified for the field 'botId.$'
//   could not be found in the input '{"sent":false,"reason":"no_phone"}'
//
// Re-declaring CONTEXT_PASSTHROUGH_PARAMETERS on every Task is useless without
// this, and the two are only correct together. The shipped real-estate template
// died on its second state.
describe('compileJourneyToAsl — every Task must preserve execution context', () => {
  it('sets a non-root ResultPath on every Task state it emits', () => {
    const journey = baseJourney([
      { stepId: 'greet', type: 'send_message', name: 'Greet', messageHint: 'hi', next: 'book' },
      { stepId: 'book', type: 'tool_call', name: 'Book', toolName: 'booking', next: 'recheck' },
      {
        stepId: 'recheck',
        type: 'wait_and_recheck',
        name: 'Recheck',
        waitDays: 1,
        maxIterations: 2,
        recheckField: 'appointment_booked',
        onSatisfied: 'handoff',
        onExhausted: 'handoff',
      },
      { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
    ])

    const asl = compileJourneyToAsl(journey)
    const tasks = Object.entries(asl.States).filter(([, state]) => state.Type === 'Task')

    expect(tasks.length).toBeGreaterThan(0)
    for (const [name, state] of tasks) {
      const resultPath = (state as { ResultPath?: string }).ResultPath
      expect(resultPath, `Task state "${name}" has no ResultPath and would destroy execution context`).toBeDefined()
      expect(resultPath, `Task state "${name}" writes its result to the root, replacing the context`).not.toBe('$')
    }
  })

  it('keeps the context readable by the state after a send_message', () => {
    const journey = baseJourney([
      { stepId: 'greet', type: 'send_message', name: 'Greet', messageHint: 'hi', next: 'handoff' },
      { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
    ])

    const asl = compileJourneyToAsl(journey)

    // greet merges its result under a scratch key, so $.botId still resolves
    // for handoff's own Parameters.
    expect((asl.States.greet as { ResultPath?: string }).ResultPath).toBe('$.lastResult')
    expect((asl.States.handoff as { Parameters?: Record<string, unknown> }).Parameters).toMatchObject({
      'botId.$': '$.botId',
    })
  })
})

describe('compileJourneyToAsl — await_reply', () => {
  const journey = () =>
    baseJourney([
      { stepId: 'ask', type: 'await_reply', name: 'Ask', next: 'book', onNoReply: 'handoff' },
      { stepId: 'book', type: 'tool_call', name: 'Book', toolName: 'booking', next: 'handoff' },
      { stepId: 'handoff', type: 'human_handoff', name: 'Handoff' },
    ])

  it('compiles to the callback pattern, not a plain Lambda invoke', () => {
    const ask = compileJourneyToAsl(journey()).States.ask as unknown as {
      Resource: string
      Parameters: { FunctionName: string; Payload: Record<string, unknown> }
    }

    // The execution must NOT resume when the Lambda returns -- only when
    // someone sends the task token back.
    expect(ask.Resource).toBe('arn:aws:states:::lambda:invoke.waitForTaskToken')
    expect(ask.Parameters.FunctionName).toEqual(expect.any(String))
    expect(ask.Parameters.Payload).toMatchObject({ 'taskToken.$': '$$.Task.Token', operation: 'await_reply' })
  })

  it('times out at the WhatsApp session window and routes to onNoReply', () => {
    const ask = compileJourneyToAsl(journey()).States.ask as unknown as {
      TimeoutSeconds: number
      Catch: { ErrorEquals: string[]; Next: string; ResultPath?: string }[]
    }

    expect(ask.TimeoutSeconds).toBe(24 * 60 * 60)
    expect(ask.Catch[0]).toMatchObject({ ErrorEquals: ['States.Timeout'], Next: 'handoff' })
  })

  // Same defect class as the Task ResultPath bug: without this the onNoReply
  // branch receives the timeout error where its execution context should be.
  it('gives the timeout Catch its own ResultPath so onNoReply keeps its context', () => {
    const ask = compileJourneyToAsl(journey()).States.ask as unknown as {
      Catch: { ResultPath?: string }[]
    }

    expect(ask.Catch[0].ResultPath).toBeDefined()
    expect(ask.Catch[0].ResultPath).not.toBe('$')
  })

  it('enforces forward-only references on both edges, so it cannot smuggle a loop', () => {
    const backward = baseJourney(
      [
        { stepId: 'first', type: 'send_message', name: 'First', next: 'ask' },
        { stepId: 'ask', type: 'await_reply', name: 'Ask', next: 'first', onNoReply: 'done' },
        { stepId: 'done', type: 'human_handoff', name: 'Done' },
      ],
      'first'
    )

    expect(() => compileJourneyToAsl(backward)).toThrow(JourneyCompileError)
  })

  it('rejects an onNoReply pointing at a step that does not exist', () => {
    const broken = baseJourney([
      { stepId: 'ask', type: 'await_reply', name: 'Ask', next: 'done', onNoReply: 'nowhere' },
      { stepId: 'done', type: 'human_handoff', name: 'Done' },
    ])

    expect(() => compileJourneyToAsl(broken)).toThrow(/onNoReply/)
  })
})
