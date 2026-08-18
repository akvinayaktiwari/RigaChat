import { describe, expect, it } from 'vitest'
import {
  buildSystemPrompt,
  DEFAULT_PLAN,
  journeyToPlan,
  planDurationDays,
  planTimeline,
  planToAgent,
  planToJourney,
  planToSteps,
} from './journey-plan'
import type { JourneyPlan } from './journey-plan'
import type { AgentConfig, JourneyStep } from '../types/index'

function plan(patch: Partial<JourneyPlan> = {}): JourneyPlan {
  return { ...DEFAULT_PLAN, ...patch }
}

// Mirrors backend/src/services/journey-compiler-service.ts:117 assertForwardReference.
// A journey whose edges point backward cannot be expressed in ASL and is
// rejected at publish, so the generator must never produce one.
function forwardReferenceErrors(steps: JourneyStep[]): string[] {
  const rank = new Map(steps.map((s, i) => [s.stepId, i]))
  const errors: string[] = []

  const check = (from: JourneyStep, target: string | undefined, field: string) => {
    if (!target) return
    const fromRank = rank.get(from.stepId)
    const targetRank = rank.get(target)
    if (targetRank === undefined) {
      errors.push(`${from.stepId}.${field} -> unknown step "${target}"`)
      return
    }
    if (fromRank === undefined || targetRank <= fromRank) {
      errors.push(`${from.stepId}.${field} -> "${target}" is not later in the list`)
    }
  }

  for (const step of steps) {
    switch (step.type) {
      case 'send_message':
      case 'wait':
      case 'tool_call':
        check(step, step.next, 'next')
        break
      case 'await_reply':
        check(step, step.next, 'next')
        check(step, step.onNoReply, 'onNoReply')
        break
      case 'wait_and_recheck':
        check(step, step.onSatisfied, 'onSatisfied')
        check(step, step.onExhausted, 'onExhausted')
        break
      case 'condition':
        check(step, step.onTrue, 'onTrue')
        check(step, step.onFalse, 'onFalse')
        break
      case 'human_handoff':
        break
    }
  }
  return errors
}

// Mirrors validateSteps() in JourneyBuilderPage.tsx, which blocks saving.
function validationErrors(steps: JourneyStep[]): string[] {
  const errors: string[] = []
  for (const step of steps) {
    if (step.type === 'await_reply' && (!step.next || !step.onNoReply)) {
      errors.push(`${step.stepId}: await_reply needs both branches`)
    }
    if (step.type === 'wait_and_recheck') {
      if (!step.onSatisfied || !step.onExhausted) errors.push(`${step.stepId}: recheck needs both branches`)
      if (!Number.isInteger(step.maxIterations) || step.maxIterations < 1 || step.maxIterations > 30) {
        errors.push(`${step.stepId}: maxIterations out of range`)
      }
      if (!Number.isInteger(step.waitDays) || step.waitDays < 1) errors.push(`${step.stepId}: waitDays invalid`)
    }
    if (step.type === 'wait' && (!Number.isInteger(step.waitDays) || step.waitDays < 1)) {
      errors.push(`${step.stepId}: waitDays invalid`)
    }
    // booking as a tool_call would need toolInput.requestedAt, which nobody can
    // know at authoring time. The generator must not emit one.
    if (step.type === 'tool_call') {
      if (!step.toolName) errors.push(`${step.stepId}: no tool chosen`)
      if (step.toolName === 'booking' && !step.toolInput?.requestedAt) {
        errors.push(`${step.stepId}: booking tool_call has no requestedAt`)
      }
    }
  }
  return errors
}

// Every meaningful combination of the switches an operator can flip.
const PERMUTATIONS: Array<[string, JourneyPlan]> = [
  ['defaults', plan()],
  ['no nudges', plan({ followUp: { ...DEFAULT_PLAN.followUp, maxNudges: 0 } })],
  ['no booking', plan({ booking: { ...DEFAULT_PLAN.booking, enabled: false } })],
  ['no handoff', plan({ handoff: { enabled: false, reason: '' } })],
  ['no nudges, no booking', plan({ followUp: { ...DEFAULT_PLAN.followUp, maxNudges: 0 }, booking: { ...DEFAULT_PLAN.booking, enabled: false } })],
  ['no booking, no handoff', plan({ booking: { ...DEFAULT_PLAN.booking, enabled: false }, handoff: { enabled: false, reason: '' } })],
  ['nothing but the conversation', plan({
    followUp: { ...DEFAULT_PLAN.followUp, maxNudges: 0 },
    booking: { ...DEFAULT_PLAN.booking, enabled: false },
    handoff: { enabled: false, reason: '' },
  })],
  ['nothing to learn', plan({ learn: [] })],
  ['long chase', plan({ booking: { enabled: true, recheckDays: 3, maxRechecks: 10 } })],
]

describe('every plan compiles to a journey the backend will accept', () => {
  for (const [label, p] of PERMUTATIONS) {
    it(`${label}: no backward references`, () => {
      expect(forwardReferenceErrors(planToSteps(p))).toEqual([])
    })

    it(`${label}: passes save validation`, () => {
      expect(validationErrors(planToSteps(p))).toEqual([])
    })

    it(`${label}: every edge lands on a real step`, () => {
      const steps = planToSteps(p)
      const ids = new Set(steps.map((s) => s.stepId))
      for (const step of steps) {
        for (const target of [
          (step as { next?: string }).next,
          (step as { onNoReply?: string }).onNoReply,
          (step as { onSatisfied?: string }).onSatisfied,
          (step as { onExhausted?: string }).onExhausted,
        ]) {
          if (target) expect(ids.has(target)).toBe(true)
        }
      }
    })

    it(`${label}: startStepId is the first step`, () => {
      const journey = planToJourney(p, 'j1', 'lead_captured', 'Test')
      expect(journey.startStepId).toBe(journey.steps[0].stepId)
    })
  }
})

describe('booking is a capability, not a step', () => {
  // A tool_call for booking needs toolInput.requestedAt, a concrete date the
  // operator cannot know at authoring time. Granting it through the toolbox lets
  // the agent book when the lead actually names a day.
  it('never emits a booking tool_call', () => {
    expect(planToSteps(plan()).some((s) => s.type === 'tool_call')).toBe(false)
  })

  it('grants booking through the toolbox when enabled', () => {
    expect(planToAgent(plan(), 'p1').mcpToolbox).toContain('booking')
  })

  it('withholds it when disabled', () => {
    const p = plan({ booking: { ...DEFAULT_PLAN.booking, enabled: false } })
    expect(planToAgent(p, 'p1').mcpToolbox).not.toContain('booking')
  })

  it('waits on the booking with a recheck step', () => {
    const recheck = planToSteps(plan()).find((s) => s.type === 'wait_and_recheck')
    expect(recheck).toBeTruthy()
    expect(recheck && 'recheckField' in recheck && recheck.recheckField).toBe('appointment_booked')
  })
})

describe('step ids are stable', () => {
  // Steps are regenerated on every save. Random ids would churn the entire graph
  // on each keystroke and make the diff between two saves unreadable.
  it('produces identical ids across calls', () => {
    expect(planToSteps(plan()).map((s) => s.stepId)).toEqual(planToSteps(plan()).map((s) => s.stepId))
  })

  it('keeps ids stable when unrelated copy changes', () => {
    const before = planToSteps(plan()).map((s) => s.stepId)
    const after = planToSteps(plan({ goal: 'Something else entirely' })).map((s) => s.stepId)
    expect(after).toEqual(before)
  })
})

describe('the system prompt', () => {
  // The anti-hallucination instruction is not the operator's to remove. It is
  // the difference between an agent that is useful and one that invents a price
  // to a real buyer.
  it('always keeps the only-answer-from-context rule', () => {
    const p = plan({ never: [], escalateWhen: [], learn: [] })
    expect(buildSystemPrompt(p)).toMatch(/Only answer from the provided context/)
  })

  it('carries the goal, the facts to learn, and the limits', () => {
    const prompt = buildSystemPrompt(plan({ goal: 'Book a visit.', learn: ['Budget'], never: ['Invent prices'] }))
    expect(prompt).toContain('Book a visit.')
    expect(prompt).toContain('Budget')
    expect(prompt).toContain('Invent prices')
  })

  it('omits empty sections rather than emitting a dangling label', () => {
    const prompt = buildSystemPrompt(plan({ never: [], escalateWhen: [] }))
    expect(prompt).not.toMatch(/Never do any of the following: \./)
    expect(prompt).not.toMatch(/bring in a human when: \./)
  })
})

describe('the timeline an operator reads instead of a graph', () => {
  it('flags the nudge as needing an approved template past 24h', () => {
    // WhatsApp only allows an approved template after 24h of silence. The
    // operator should never have to know that rule to avoid breaking it.
    const nudge = planTimeline(plan()).find((e) => /Nudges/.test(e.what))
    expect(nudge?.needsTemplate).toBe(true)
  })

  it('drops the nudge entry when nudging is off', () => {
    const p = plan({ followUp: { ...DEFAULT_PLAN.followUp, maxNudges: 0 } })
    expect(planTimeline(p).some((e) => /Nudges/.test(e.what))).toBe(false)
  })

  it('reports the total chase length', () => {
    expect(planDurationDays(plan({ followUp: { ...DEFAULT_PLAN.followUp, waitDays: 1 }, booking: { enabled: true, recheckDays: 2, maxRechecks: 3 } }))).toBe(7)
  })
})

describe('inferring a plan from an existing journey', () => {
  const agent: AgentConfig = {
    personaId: 'p1',
    name: 'Site visit assistant',
    systemPrompt: 'You are a helpful assistant.',
    toneDescription: 'Warm and brief.',
    mcpToolbox: ['booking'],
    channelConfig: {},
  }

  it('refuses rather than guessing when the journey branches on a condition', () => {
    // Guessing would silently drop a path from a client's live automation.
    const steps: JourneyStep[] = [
      { stepId: 'a', name: 'a', type: 'condition', field: 'replied', operator: 'equals', value: 'true', onTrue: 'b', onFalse: 'c' },
      { stepId: 'b', name: 'b', type: 'send_message' },
      { stepId: 'c', name: 'c', type: 'send_message' },
    ]
    const result = journeyToPlan({ steps }, agent)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/branches on a condition/)
  })

  it('refuses an empty journey', () => {
    expect(journeyToPlan({ steps: [] }, agent).ok).toBe(false)
  })

  it('reads the recheck budget off the existing step', () => {
    const steps: JourneyStep[] = [
      { stepId: 'a', name: 'a', type: 'send_message', next: 'b' },
      { stepId: 'b', name: 'b', type: 'wait_and_recheck', waitDays: 2, maxIterations: 5, recheckField: 'appointment_booked', onSatisfied: 'c', onExhausted: 'c' },
      { stepId: 'c', name: 'c', type: 'human_handoff', reason: 'gave up' },
    ]
    const result = journeyToPlan({ steps }, agent)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.booking.recheckDays).toBe(2)
    expect(result.plan.booking.maxRechecks).toBe(5)
    expect(result.plan.handoff.enabled).toBe(true)
    expect(result.plan.handoff.reason).toBe('gave up')
  })

  it('notices there is no handoff', () => {
    const steps: JourneyStep[] = [{ stepId: 'a', name: 'a', type: 'send_message' }]
    const result = journeyToPlan({ steps }, agent)
    expect(result.ok && result.plan.handoff.enabled).toBe(false)
  })

  it('carries the agent name and tone across', () => {
    const steps: JourneyStep[] = [{ stepId: 'a', name: 'a', type: 'send_message' }]
    const result = journeyToPlan({ steps }, agent)
    expect(result.ok && result.plan.agentName).toBe('Site visit assistant')
    expect(result.ok && result.plan.tone).toBe('Warm and brief.')
  })

  // An inferred plan must itself compile, or "open an old journey and save" would
  // produce something the backend rejects.
  it('produces a plan that compiles cleanly', () => {
    const steps: JourneyStep[] = [
      { stepId: 'a', name: 'a', type: 'send_message', next: 'b' },
      { stepId: 'b', name: 'b', type: 'wait_and_recheck', waitDays: 1, maxIterations: 3, recheckField: 'appointment_booked', onSatisfied: 'c', onExhausted: 'c' },
      { stepId: 'c', name: 'c', type: 'human_handoff' },
    ]
    const result = journeyToPlan({ steps }, agent)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(forwardReferenceErrors(planToSteps(result.plan))).toEqual([])
    expect(validationErrors(planToSteps(result.plan))).toEqual([])
  })
})
