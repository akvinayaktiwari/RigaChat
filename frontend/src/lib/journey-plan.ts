// The sales plan an operator actually authors, and the compiler that turns it
// into the JourneyDefinition + AgentConfig the executor runs.
//
// WHY A PLAN AND NOT STEPS
//   A real-estate operator does not think in send_message and await_reply. They
//   think "greet them, find out budget and area, offer a visit, chase twice,
//   then give it to a human". The steps are an implementation detail of that
//   sentence, and asking the operator to author them is asking them to compile
//   by hand.
//
// THE SEAM
//   The plan is split by what the AGENT MAY DECIDE versus what the SYSTEM MUST
//   ENFORCE. That is deliberately NOT a split by step type: a condition is
//   deterministic when it reads structured data and a judgment call when the
//   agent has to infer it from messy language, so a step-type split would not
//   survive a change to the step union.
//
//     guide  -> goal, facts to learn, hard limits, when to escalate, tone.
//               Becomes the agent's systemPrompt. The agent writes the words.
//     rules  -> timings, retry counts, booking, handoff. Becomes the step
//               graph. These must not vary run to run.
//
// DIRECTION
//   plan -> journey is the real direction. journeyToPlan() exists only to give
//   an existing bundle a plan to start from, and it REFUSES rather than guesses
//   when the journey has a shape a plan cannot represent. A lossy inference
//   that silently drops a branch would destroy a client's live automation.

import type { AgentConfig, JourneyDefinition, JourneyStep, McpCapability } from '../types/index'

export interface JourneyPlan {
  version: 1

  // --- Conversation guide: what the agent may decide -------------------------
  goal: string
  agentName: string
  tone?: string
  // Facts the agent should find out before offering a visit. Free text, because
  // every client qualifies differently and an enum would be wrong by the second
  // client.
  learn: string[]
  // Hard limits. These become "never" lines in the prompt, and they are the
  // difference between an agent that is useful and one that invents a price.
  never: string[]
  // When to stop and get a person. Judgment, not a rule, which is why it is
  // prose in the prompt rather than a condition step.
  escalateWhen: string[]

  // --- Follow-up rules: what the system must enforce -------------------------
  followUp: {
    // Days of silence before the first nudge.
    waitDays: number
    // 0 disables nudging entirely.
    maxNudges: number
    // Sent after the 24h WhatsApp window closes, so it must be an approved
    // template. Stored here so the timeline can show the real words.
    nudgeMessage: string
  }
  booking: {
    enabled: boolean
    recheckDays: number
    maxRechecks: number
  }
  handoff: {
    enabled: boolean
    reason: string
  }
}

export const DEFAULT_PLAN: JourneyPlan = {
  version: 1,
  goal: 'Get the lead to book a site visit.',
  agentName: 'Site visit assistant',
  tone: 'Warm, direct, and brief. Never pushy.',
  learn: ['Budget range', 'Preferred area'],
  never: ['Invent prices', 'Promise availability', 'Give possession dates'],
  escalateWhen: ['They ask for a human', 'They start negotiating'],
  followUp: { waitDays: 1, maxNudges: 1, nudgeMessage: 'Just checking in — would a quick site visit help?' },
  booking: { enabled: true, recheckDays: 1, maxRechecks: 3 },
  handoff: { enabled: true, reason: 'Lead did not book after qualification and a nudge.' },
}

// Stable step ids. Generated journeys are regenerated on every save, so random
// uuids would churn the whole graph on every keystroke and make the diff between
// two saves unreadable.
const ID = {
  greet: 'plan-greet',
  awaitQualify: 'plan-await-qualify',
  offer: 'plan-offer',
  awaitDay: 'plan-await-day',
  nudge: 'plan-nudge',
  recheck: 'plan-recheck',
  confirm: 'plan-confirm',
  handoff: 'plan-handoff',
} as const

export function buildSystemPrompt(plan: JourneyPlan): string {
  const parts: string[] = []

  parts.push(
    `You are a helpful assistant for a real estate business, talking to a prospective buyer on WhatsApp.`
  )
  parts.push(`Your goal: ${plan.goal}`)

  if (plan.learn.length > 0) {
    parts.push(
      `Before offering a site visit, find out: ${plan.learn.join(', ')}. Ask for these naturally, not as a form.`
    )
  }

  // The anti-hallucination instruction is not optional and is not the operator's
  // to remove. Their "never" list is appended to it, never substituted for it.
  parts.push(
    `Only answer from the provided context. If the context does not contain the answer, say so clearly and offer to connect them with a human agent.`
  )

  if (plan.never.length > 0) {
    parts.push(`Never do any of the following: ${plan.never.join('; ')}.`)
  }

  if (plan.escalateWhen.length > 0) {
    parts.push(`Offer to bring in a human when: ${plan.escalateWhen.join('; ')}.`)
  }

  parts.push(
    `Keep replies short and conversational. This is WhatsApp, not email. Two or three sentences at most.`
  )

  if (plan.tone) parts.push(`Tone: ${plan.tone}`)

  return parts.join('\n\n')
}

export function planToAgent(plan: JourneyPlan, personaId: string): AgentConfig {
  const mcpToolbox: McpCapability[] = []
  if (plan.booking.enabled) mcpToolbox.push('booking')

  return {
    personaId,
    name: plan.agentName,
    systemPrompt: buildSystemPrompt(plan),
    ...(plan.tone ? { toneDescription: plan.tone } : {}),
    mcpToolbox,
    channelConfig: {},
  }
}

// TWO COMPILER CONSTRAINTS THAT SHAPE EVERYTHING BELOW
//
// 1. Forward references only. journey-compiler-service.ts:117 rejects any edge
//    whose target is not LATER in the steps array, because a backward edge
//    cannot be expressed in ASL. wait_and_recheck is the only way to say
//    "try again". So the step order below is load-bearing, not cosmetic, and
//    every target is resolved against the ORDER, not just the id.
//
// 2. Booking is a capability, not a step. A tool_call for 'booking' requires
//    toolInput.requestedAt (a concrete date/time), which nobody can know when
//    authoring the plan -- the lead picks it mid-conversation. So booking is
//    granted through the agent's mcpToolbox and the agent calls it when the
//    lead names a day. wait_and_recheck on appointment_booked is what waits for
//    the result. This also happens to be truer to the plan's own seam: choosing
//    WHEN to book is judgment; the retry budget around it is enforcement.
export function planToSteps(plan: JourneyPlan): JourneyStep[] {
  const wantsNudge = plan.followUp.maxNudges > 0
  const wantsBooking = plan.booking.enabled

  // The terminal every dead end resolves to. A journey must not leave an edge
  // empty: validateSteps rejects an await_reply missing either branch, and an
  // unreachable dead end would strand the lead.
  const terminalId = plan.handoff.enabled ? ID.handoff : ID.confirm

  // Declared in execution order first, so target resolution below can never
  // produce a backward reference.
  const order: string[] = [
    ID.greet,
    ID.awaitQualify,
    ID.offer,
    ID.awaitDay,
    ...(wantsNudge ? [ID.nudge] : []),
    ...(wantsBooking ? [ID.recheck] : []),
    ID.confirm,
    ...(plan.handoff.enabled ? [ID.handoff] : []),
  ]
  const rank = new Map(order.map((id, i) => [id, i]))

  // Resolves a preferred target, falling back forward until something valid and
  // strictly later than `from` is found. Guarantees constraint 1 by construction
  // rather than by careful hand-ordering that breaks the next time an option is
  // added to the plan.
  const forward = (from: string, ...preferred: string[]): string => {
    const fromRank = rank.get(from) ?? -1
    for (const candidate of preferred) {
      const r = rank.get(candidate)
      if (r !== undefined && r > fromRank) return candidate
    }
    return terminalId
  }

  const steps: JourneyStep[] = []

  steps.push({
    stepId: ID.greet,
    name: 'Greet and qualify',
    type: 'send_message',
    messageHint:
      plan.learn.length > 0
        ? `Greet them warmly and ask about ${plan.learn.join(' and ').toLowerCase()}.`
        : 'Greet them warmly and ask what they are looking for.',
    next: forward(ID.greet, ID.awaitQualify),
  })

  steps.push({
    stepId: ID.awaitQualify,
    name: 'Wait for what they want',
    type: 'await_reply',
    promptHint: plan.learn.join(', '),
    next: forward(ID.awaitQualify, ID.offer),
    onNoReply: forward(ID.awaitQualify, ID.nudge, ID.recheck),
  })

  steps.push({
    stepId: ID.offer,
    name: 'Offer a site visit',
    type: 'send_message',
    messageHint: 'Acknowledge what they told you, then offer a site visit and ask which day suits them.',
    next: forward(ID.offer, ID.awaitDay),
  })

  steps.push({
    stepId: ID.awaitDay,
    name: 'Wait for a day that suits them',
    type: 'await_reply',
    promptHint: 'a day that suits them for a site visit',
    next: forward(ID.awaitDay, ID.recheck, ID.confirm),
    onNoReply: forward(ID.awaitDay, ID.nudge, ID.recheck),
  })

  if (wantsNudge) {
    steps.push({
      stepId: ID.nudge,
      name: 'Nudge when they go quiet',
      type: 'send_message',
      messageHint: plan.followUp.nudgeMessage,
      // Chase after nudging rather than giving up immediately, which is what
      // makes maxRechecks the real follow-up budget.
      next: forward(ID.nudge, ID.recheck),
    })
  }

  if (wantsBooking) {
    steps.push({
      stepId: ID.recheck,
      name: 'Wait for the booking to be confirmed',
      type: 'wait_and_recheck',
      waitDays: plan.booking.recheckDays,
      maxIterations: plan.booking.maxRechecks,
      recheckField: 'appointment_booked',
      onSatisfied: forward(ID.recheck, ID.confirm),
      onExhausted: forward(ID.recheck, ID.handoff),
    })
  }

  steps.push({
    stepId: ID.confirm,
    name: wantsBooking ? 'Confirm the booked visit' : 'Sign off',
    type: 'send_message',
    messageHint: wantsBooking
      ? 'Confirm the visit, and say you will send the location and a reminder beforehand.'
      : 'Thank them and say someone will follow up.',
  })

  if (plan.handoff.enabled) {
    steps.push({
      stepId: ID.handoff,
      name: 'Hand to a human',
      type: 'human_handoff',
      reason: plan.handoff.reason,
    })
  }

  return steps
}

export function planToJourney(
  plan: JourneyPlan,
  journeyId: string,
  triggerType: JourneyDefinition['triggerType'],
  name: string
): Omit<JourneyDefinition, 'botId' | 'clientId'> {
  const steps = planToSteps(plan)
  return { journeyId, name, triggerType, startStepId: steps[0].stepId, steps }
}

// A human-readable account of what the plan will actually do, day by day. This
// is what replaces reading a graph: an operator should be able to check their
// automation without learning to read one.
export interface TimelineEntry {
  when: string
  what: string
  // True for anything WhatsApp requires an approved template for, so the UI can
  // mark it without the operator needing to know the rule.
  needsTemplate?: boolean
}

export function planTimeline(plan: JourneyPlan): TimelineEntry[] {
  const out: TimelineEntry[] = []
  out.push({ when: 'Day 0', what: `Greets and asks about ${plan.learn.join(', ').toLowerCase() || 'what they want'}` })
  out.push({ when: 'Day 0', what: 'Offers a site visit once they answer' })

  if (plan.followUp.maxNudges > 0) {
    const day = plan.followUp.waitDays
    out.push({
      when: `Day ${day}`,
      what: `Nudges ${plan.followUp.maxNudges === 1 ? 'once' : `up to ${plan.followUp.maxNudges} times`} if they go quiet`,
      // Past 24h of silence WhatsApp only allows an approved template. This is
      // computed, not asked: the operator should never have to know the rule to
      // avoid breaking it.
      needsTemplate: day >= 1,
    })
  }

  if (plan.booking.enabled) {
    const total = plan.booking.recheckDays * plan.booking.maxRechecks
    out.push({
      when: `Day ${plan.followUp.waitDays}–${plan.followUp.waitDays + total}`,
      what: `Checks for a booking ${plan.booking.maxRechecks} times, every ${plan.booking.recheckDays === 1 ? 'day' : `${plan.booking.recheckDays} days`}`,
    })
    out.push({ when: 'On booking', what: 'Confirms the visit and promises a reminder' })
  }

  if (plan.handoff.enabled) {
    out.push({ when: 'If nothing works', what: 'Hands the lead to you, with the whole conversation' })
  }

  return out
}

export function planDurationDays(plan: JourneyPlan): number {
  const chase = plan.booking.enabled ? plan.booking.recheckDays * plan.booking.maxRechecks : 0
  return (plan.followUp.maxNudges > 0 ? plan.followUp.waitDays : 0) + chase
}

// ---------------------------------------------------------------------------
// Inference, for bundles that predate the plan
// ---------------------------------------------------------------------------

export type PlanInference =
  | { ok: true; plan: JourneyPlan }
  // Refusal is a feature. An existing journey may branch in ways a plan cannot
  // express, and guessing would silently drop a path from a client's live
  // automation. The UI falls back to the step editor on this.
  | { ok: false; reason: string }

export function journeyToPlan(
  journey: Pick<JourneyDefinition, 'steps'>,
  agent: AgentConfig
): PlanInference {
  const { steps } = journey

  if (steps.length === 0) return { ok: false, reason: 'This journey has no steps yet.' }

  // A condition step is the clearest signal of a shape the plan does not model:
  // the plan has exactly one path with fallbacks, not operator-authored branches.
  if (steps.some((s) => s.type === 'condition')) {
    return {
      ok: false,
      reason: 'This journey branches on a condition, which the plan view cannot show without hiding a path.',
    }
  }

  const recheck = steps.find((s): s is Extract<JourneyStep, { type: 'wait_and_recheck' }> =>
    s.type === 'wait_and_recheck'
  )
  const nudge = steps.find(
    (s): s is Extract<JourneyStep, { type: 'send_message' }> =>
      s.type === 'send_message' && /nudge|checking in|follow/i.test(`${s.name} ${s.messageHint ?? ''}`)
  )
  const handoffStep = steps.find((s): s is Extract<JourneyStep, { type: 'human_handoff' }> =>
    s.type === 'human_handoff'
  )
  const bookingStep = steps.find(
    (s): s is Extract<JourneyStep, { type: 'tool_call' }> => s.type === 'tool_call' && s.toolName === 'booking'
  )
  const waitStep = steps.find((s): s is Extract<JourneyStep, { type: 'wait' }> => s.type === 'wait')

  return {
    ok: true,
    plan: {
      version: 1,
      goal: DEFAULT_PLAN.goal,
      agentName: agent.name,
      ...(agent.toneDescription ? { tone: agent.toneDescription } : {}),
      // Deliberately not parsed out of the prompt. Reverse-engineering prose into
      // a list would produce confident nonsense; the operator confirms these once
      // and from then on the plan is the source of truth.
      learn: DEFAULT_PLAN.learn,
      never: DEFAULT_PLAN.never,
      escalateWhen: DEFAULT_PLAN.escalateWhen,
      followUp: {
        waitDays: waitStep?.waitDays ?? recheck?.waitDays ?? DEFAULT_PLAN.followUp.waitDays,
        maxNudges: nudge ? 1 : 0,
        nudgeMessage: nudge?.messageHint ?? DEFAULT_PLAN.followUp.nudgeMessage,
      },
      booking: {
        enabled: Boolean(bookingStep) || agent.mcpToolbox.includes('booking'),
        recheckDays: recheck?.waitDays ?? DEFAULT_PLAN.booking.recheckDays,
        maxRechecks: recheck?.maxIterations ?? DEFAULT_PLAN.booking.maxRechecks,
      },
      handoff: {
        enabled: Boolean(handoffStep),
        reason: handoffStep?.reason ?? DEFAULT_PLAN.handoff.reason,
      },
    },
  }
}
