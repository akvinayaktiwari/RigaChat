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

// Mirrors MAX_WAIT_AND_RECHECK_ITERATIONS in
// backend/src/services/journey-compiler-service.ts:22. A plan above this
// regenerates a journey the compiler rejects at publish.
const MAX_RECHECK_ITERATIONS = 30

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

  // The actual words sent to the lead.
  //
  // NOT hints. journey-executor-service.ts:81 resolves a send as
  // `composedReply ?? messageHint ?? DEFAULT`, and composedReply only exists
  // when the agent is answering an inbound message. The opening greet has no
  // inbound message to answer, so whatever sits here is delivered to a real
  // person verbatim. Writing "Greet them warmly and ask about budget" here
  // would send that sentence to the lead.
  //
  // So these are customer-facing copy with sensible defaults, and the operator
  // edits them directly. That is also exactly the customization people ask for
  // first: "on day 3 say this, in Hindi".
  messages: {
    greet: string
    offer: string
    // Sent when a booking actually happened.
    confirm: string
    // Sent when the journey ends WITHOUT a booking. Separate from `confirm`
    // because reusing it there told a lead "Your site visit is confirmed" when
    // they had never booked anything.
    signOff: string
  }

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
  messages: {
    greet:
      'Hi! Thanks for your interest. To point you to the right property, could you tell me your budget range and which area you are considering?',
    offer:
      'Thanks, that helps. Would you like to see one of these in person? Tell me a day that suits you and I will set it up.',
    confirm:
      'Your site visit is confirmed. I will send the location and a reminder before the day.',
    signOff: 'Thanks for your time. Someone from our team will follow up with you shortly.',
  },
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
  // One wait+send pair per nudge, numbered. maxNudges used to emit a single
  // step while the timeline claimed "up to N times".
  nudgeWait: (i: number) => `plan-nudge-wait-${i}`,
  nudge: (i: number) => `plan-nudge-${i}`,
  recheck: 'plan-recheck',
  close: 'plan-close',
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
  const nudgeCount = Math.max(0, Math.floor(plan.followUp.maxNudges))
  const wantsBooking = plan.booking.enabled

  // The terminal every dead end resolves to. A journey must not leave an edge
  // empty: validateSteps rejects an await_reply missing either branch, and an
  // unreachable dead end would strand the lead.
  const terminalId = plan.handoff.enabled ? ID.handoff : ID.close

  // Execution order, declared before anything is emitted, so target resolution
  // can never produce a backward reference (journey-compiler-service.ts:117).
  //
  // Each nudge is a WAIT followed by a SEND. Previously waitDays was never
  // emitted at all and maxNudges produced exactly one step, so the timeline
  // promised "wait 3 days, nudge twice" while the journey nudged once, roughly
  // 24 hours later, off the await_reply timeout.
  const nudgeIds: string[] = []
  for (let i = 0; i < nudgeCount; i += 1) {
    nudgeIds.push(ID.nudgeWait(i), ID.nudge(i))
  }

  const order: string[] = [
    ID.greet,
    ID.awaitQualify,
    ID.offer,
    ID.awaitDay,
    ...nudgeIds,
    ...(wantsBooking ? [ID.recheck] : []),
    ID.close,
    ...(plan.handoff.enabled ? [ID.handoff] : []),
  ]
  const rank = new Map(order.map((id, i) => [id, i]))

  // Resolves a preferred target, falling forward until something valid and
  // strictly later than `from` is found, so the forward-only rule holds by
  // construction rather than by hand-ordering that breaks the next time a plan
  // option is added.
  const forward = (from: string, ...preferred: string[]): string => {
    const fromRank = rank.get(from) ?? -1
    for (const candidate of preferred) {
      const r = rank.get(candidate)
      if (r !== undefined && r > fromRank) return candidate
    }
    return terminalId
  }

  const firstNudge = nudgeCount > 0 ? ID.nudgeWait(0) : undefined
  const quietTarget = (from: string) =>
    firstNudge ? forward(from, firstNudge, ID.recheck) : forward(from, ID.recheck)

  const steps: JourneyStep[] = []

  steps.push({
    stepId: ID.greet,
    name: 'Greet and qualify',
    type: 'send_message',
    // Sent verbatim. See JourneyPlan.messages for why this is copy, not an
    // instruction to the agent.
    messageHint: plan.messages.greet,
    next: forward(ID.greet, ID.awaitQualify),
  })

  steps.push({
    stepId: ID.awaitQualify,
    name: 'Wait for what they want',
    type: 'await_reply',
    promptHint: plan.learn.join(', '),
    next: forward(ID.awaitQualify, ID.offer),
    onNoReply: quietTarget(ID.awaitQualify),
  })

  steps.push({
    stepId: ID.offer,
    name: 'Offer a site visit',
    type: 'send_message',
    messageHint: plan.messages.offer,
    next: forward(ID.offer, ID.awaitDay),
  })

  steps.push({
    stepId: ID.awaitDay,
    name: 'Wait for a day that suits them',
    type: 'await_reply',
    promptHint: 'a day that suits them for a site visit',
    next: forward(ID.awaitDay, ID.recheck, ID.close),
    onNoReply: quietTarget(ID.awaitDay),
  })

  for (let i = 0; i < nudgeCount; i += 1) {
    const waitId = ID.nudgeWait(i)
    const sendId = ID.nudge(i)

    steps.push({
      stepId: waitId,
      name: nudgeCount === 1 ? 'Wait before following up' : `Wait before follow-up ${i + 1}`,
      type: 'wait',
      waitDays: plan.followUp.waitDays,
      next: forward(waitId, sendId),
    })

    // The last nudge chases the booking; earlier ones wait and nudge again.
    const nextAfterSend = i + 1 < nudgeCount ? ID.nudgeWait(i + 1) : ID.recheck
    steps.push({
      stepId: sendId,
      name: nudgeCount === 1 ? 'Nudge when they go quiet' : `Follow-up ${i + 1}`,
      type: 'send_message',
      messageHint: plan.followUp.nudgeMessage,
      next: forward(sendId, nextAfterSend, ID.recheck),
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
      onSatisfied: forward(ID.recheck, ID.close),
      onExhausted: forward(ID.recheck, ID.handoff),
    })
  }

  steps.push({
    stepId: ID.close,
    name: wantsBooking ? 'Confirm the booked visit' : 'Sign off',
    type: 'send_message',
    // Distinct copy per outcome. Reusing `confirm` here told a lead their site
    // visit was confirmed when no booking had happened at all.
    messageHint: wantsBooking ? plan.messages.confirm : plan.messages.signOff,
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
  // Which piece of copy this entry sends, when it sends one. The timeline is
  // where an operator reads what will happen, so it is also where they should be
  // able to change the words -- rather than hunting for a step editor that this
  // design deliberately does not have.
  edits?: 'greet' | 'offer' | 'confirm' | 'signOff' | 'nudge'
}

export function planTimeline(plan: JourneyPlan): TimelineEntry[] {
  const out: TimelineEntry[] = []
  out.push({ when: 'Day 0', what: 'Greets and asks what they are looking for', edits: 'greet' })
  out.push({ when: 'Day 0', what: 'Offers a site visit once they answer', edits: 'offer' })

  if (plan.followUp.maxNudges > 0) {
    const day = plan.followUp.waitDays
    const last = day * plan.followUp.maxNudges
    out.push({
      when: plan.followUp.maxNudges === 1 ? `Day ${day}` : `Day ${day}–${last}`,
      what:
        plan.followUp.maxNudges === 1
          ? 'Waits a day, then nudges once if they go quiet'
          : `Nudges ${plan.followUp.maxNudges} times if they go quiet, every ${day === 1 ? 'day' : `${day} days`}`,
      // Past 24h of silence WhatsApp only allows an approved template. This is
      // computed, not asked: the operator should never have to know the rule to
      // avoid breaking it.
      needsTemplate: day >= 1,
      edits: 'nudge',
    })
  }

  if (plan.booking.enabled) {
    const total = plan.booking.recheckDays * plan.booking.maxRechecks
    const startsAt = plan.followUp.waitDays * Math.max(0, plan.followUp.maxNudges)
    out.push({
      when: `Day ${startsAt}–${startsAt + total}`,
      what: `Checks for a booking ${plan.booking.maxRechecks} times, every ${plan.booking.recheckDays === 1 ? 'day' : `${plan.booking.recheckDays} days`}`,
    })
    out.push({ when: 'On booking', what: 'Confirms the visit and promises a reminder', edits: 'confirm' })
  } else {
    out.push({ when: 'At the end', what: 'Signs off without a booking', edits: 'signOff' })
  }

  if (plan.handoff.enabled) {
    out.push({ when: 'If nothing works', what: 'Hands the lead to you, with the whole conversation' })
  }

  return out
}

export function planDurationDays(plan: JourneyPlan): number {
  // Each nudge is now a real wait step, so N nudges genuinely take N*waitDays.
  const nudging = plan.followUp.waitDays * Math.max(0, plan.followUp.maxNudges)
  const chase = plan.booking.enabled ? plan.booking.recheckDays * plan.booking.maxRechecks : 0
  return nudging + chase
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


// Is `regenerated` the same journey as `original`, ignoring step ids?
//
// THIS IS THE GUARD THE WHOLE INFERENCE PATH RESTS ON.
//   journeyToPlan reads a saved journey into a plan; saving regenerates the
//   journey FROM that plan. So inference must refuse anything it cannot
//   reproduce, not merely anything it cannot parse. Refusing only on
//   unparseable shapes meant an accepted-but-different journey was silently
//   replaced by the canonical one the moment an operator opened it and hit
//   save -- losing extra messages, wait steps, custom edges and tool calls.
//
// Ids are compared positionally rather than literally, because a journey
// authored before the plan builder has its own ids ('greet') and the generator
// mints its own ('plan-greet'). Same shape with different names is still the
// same journey.
function stepsReproduce(original: JourneyStep[], regenerated: JourneyStep[]): boolean {
  if (original.length !== regenerated.length) return false

  const idMap = new Map<string, string>()
  for (let i = 0; i < original.length; i += 1) {
    if (original[i].type !== regenerated[i].type) return false
    idMap.set(original[i].stepId, regenerated[i].stepId)
  }

  // An edge matches when the original's target maps onto the regenerated one.
  const edgeMatches = (from: string | undefined, to: string | undefined): boolean => {
    if (!from && !to) return true
    if (!from || !to) return false
    return idMap.get(from) === to
  }

  for (let i = 0; i < original.length; i += 1) {
    const a = original[i]
    const b = regenerated[i]

    switch (a.type) {
      case 'send_message': {
        const other = b as Extract<JourneyStep, { type: 'send_message' }>
        if ((a.messageHint ?? '') !== (other.messageHint ?? '')) return false
        if (!edgeMatches(a.next, other.next)) return false
        break
      }
      case 'wait': {
        const other = b as Extract<JourneyStep, { type: 'wait' }>
        if (a.waitDays !== other.waitDays) return false
        if (!edgeMatches(a.next, other.next)) return false
        break
      }
      case 'await_reply': {
        const other = b as Extract<JourneyStep, { type: 'await_reply' }>
        if (!edgeMatches(a.next, other.next)) return false
        if (!edgeMatches(a.onNoReply, other.onNoReply)) return false
        break
      }
      case 'wait_and_recheck': {
        const other = b as Extract<JourneyStep, { type: 'wait_and_recheck' }>
        if (a.waitDays !== other.waitDays) return false
        if (a.maxIterations !== other.maxIterations) return false
        if (a.recheckField !== other.recheckField) return false
        if (!edgeMatches(a.onSatisfied, other.onSatisfied)) return false
        if (!edgeMatches(a.onExhausted, other.onExhausted)) return false
        break
      }
      case 'tool_call':
      case 'condition':
        // The plan emits neither, so any occurrence is unreproducible.
        return false
      case 'human_handoff':
        break
    }
  }

  return true
}

export function journeyToPlan(
  journey: Pick<JourneyDefinition, 'steps'>,
  agent: AgentConfig
): PlanInference {
  const { steps } = journey

  if (steps.length === 0) return { ok: false, reason: 'This journey has no steps yet.' }

  if (steps.some((s) => s.type === 'condition')) {
    return {
      ok: false,
      reason: 'This journey branches on a condition, which the plan view cannot show without hiding a path.',
    }
  }

  // The plan grants tools through the agent's toolbox and only ever grants
  // booking, so any other capability would be silently revoked on the next
  // save. The shipped real-estate template carries ['booking','reminder'],
  // which is exactly this case.
  const unsupportedTools = agent.mcpToolbox.filter((tool) => tool !== 'booking')
  if (unsupportedTools.length > 0) {
    return {
      ok: false,
      reason: `This agent uses ${unsupportedTools.join(' and ')}, which the plan view cannot describe without switching ${unsupportedTools.length === 1 ? 'it' : 'them'} off.`,
    }
  }

  // Ordered outbound copy, so an existing journey's real words survive.
  const sends = steps.filter(
    (s): s is Extract<JourneyStep, { type: 'send_message' }> => s.type === 'send_message'
  )

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

  const candidate: JourneyPlan = {
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
      // Copy IS carried across, unlike the prose fields above. These are the
      // literal words already being sent to leads, so defaulting them would
      // silently rewrite a client's live messages the first time they save.
      messages: {
        greet: sends[0]?.messageHint ?? DEFAULT_PLAN.messages.greet,
        offer: sends[1]?.messageHint ?? DEFAULT_PLAN.messages.offer,
        confirm: sends[sends.length - 1]?.messageHint ?? DEFAULT_PLAN.messages.confirm,
        signOff: DEFAULT_PLAN.messages.signOff,
      },
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
  }

  // THE GATE. Saving in plan mode regenerates the journey from this plan, so a
  // plan that does not reproduce the journey it came from is a data-loss bug
  // waiting for someone to press Save. Refusing sends the operator to the step
  // editor instead, which edits their journey in place and changes nothing.
  if (!stepsReproduce(steps, planToSteps(candidate))) {
    return {
      ok: false,
      reason:
        'This journey has a shape the plan view cannot rebuild exactly, so editing it as a plan would change it.',
    }
  }

  return { ok: true, plan: candidate }
}

// Narrows a stored plan off a JourneyBundle.
//
// The field is `unknown` on the wire because it is client-authored JSON that
// DynamoDB stored verbatim -- nothing on the server validates its shape, so
// trusting it here would let an old or hand-edited record crash the builder
// with a missing property. A failed narrow is not an error: it simply means
// "no usable plan", and the caller falls back to inferring one from the steps,
// which is the same path a bundle authored before this field takes.
export function parseStoredPlan(value: unknown): JourneyPlan | null {
  if (typeof value !== 'object' || value === null) return null
  const p = value as Record<string, unknown>

  if (p.version !== 1) return null
  if (typeof p.goal !== 'string' || typeof p.agentName !== 'string') return null

  const isStringArray = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === 'string')
  if (!isStringArray(p.learn) || !isStringArray(p.never) || !isStringArray(p.escalateWhen)) return null

  const messages = p.messages as Record<string, unknown> | undefined
  if (
    !messages ||
    typeof messages.greet !== 'string' ||
    typeof messages.offer !== 'string' ||
    typeof messages.confirm !== 'string' ||
    typeof messages.signOff !== 'string'
  ) {
    return null
  }

  // Bounds, not just types. Plan-mode saves skip validateSteps because the
  // generator is proven by tests -- which only holds if the plan feeding it is
  // in range. A stored recheckDays of 0 or a fractional maxRechecks would
  // regenerate a step the compiler rejects at publish. Mirrors MIN_WAIT_DAYS
  // and MAX_WAIT_AND_RECHECK_ITERATIONS in journey-compiler-service.ts.
  const wholeAtLeast = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): boolean =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max

  const followUp = p.followUp as Record<string, unknown> | undefined
  if (
    !followUp ||
    !wholeAtLeast(followUp.waitDays, 1) ||
    !wholeAtLeast(followUp.maxNudges, 0) ||
    typeof followUp.nudgeMessage !== 'string'
  ) {
    return null
  }

  const booking = p.booking as Record<string, unknown> | undefined
  if (
    !booking ||
    typeof booking.enabled !== 'boolean' ||
    !wholeAtLeast(booking.recheckDays, 1) ||
    !wholeAtLeast(booking.maxRechecks, 1, MAX_RECHECK_ITERATIONS)
  ) {
    return null
  }

  const handoff = p.handoff as Record<string, unknown> | undefined
  if (!handoff || typeof handoff.enabled !== 'boolean' || typeof handoff.reason !== 'string') return null

  return {
    version: 1,
    goal: p.goal,
    agentName: p.agentName,
    ...(typeof p.tone === 'string' ? { tone: p.tone } : {}),
    learn: p.learn,
    never: p.never,
    escalateWhen: p.escalateWhen,
    messages: {
      greet: messages.greet,
      offer: messages.offer,
      confirm: messages.confirm,
      signOff: messages.signOff,
    },
    followUp: {
      waitDays: followUp.waitDays as number,
      maxNudges: followUp.maxNudges as number,
      nudgeMessage: followUp.nudgeMessage,
    },
    booking: {
      enabled: booking.enabled,
      recheckDays: booking.recheckDays as number,
      maxRechecks: booking.maxRechecks as number,
    },
    handoff: { enabled: handoff.enabled, reason: handoff.reason },
  }
}

// Does a STORED plan still describe the journey saved alongside it?
//
// parseStoredPlan proves the shape is valid; it cannot prove the plan is still
// the one this journey was built from. A bundle written by anything other than
// the plan builder -- an API call, a restored backup, a future migration --
// can carry a plan that disagrees with its own journey, and plan mode would
// then overwrite the live journey with the stale plan's version on the next
// save. Same gate as inference, applied to the stored value.
export function storedPlanMatchesJourney(plan: JourneyPlan, steps: JourneyStep[]): boolean {
  return stepsReproduce(steps, planToSteps(plan))
}

