import type { JourneyTemplate } from '../../types/index.js'

// The first prebuilt agent: qualify an inbound real-estate lead over WhatsApp,
// nudge once if they go quiet, hand to a human rather than nagging forever.
//
// Step order is load-bearing, not cosmetic. journey-compiler-service.ts
// validates that every reference (next / onSatisfied / onExhausted) points to a
// LATER array index -- that forward-only rule is what makes a journey a DAG by
// construction. Reordering this array without re-checking the references will
// fail the compile, which is exactly the intent.
//
//   0 greet ───────────────► 1 wait_for_booking
//                               ├─ satisfied ──────────────► 4 confirm_visit
//                               └─ exhausted ─► 2 nudge
//   2 nudge ───────────────► 3 wait_after_nudge
//                               ├─ satisfied ──────────────► 4 confirm_visit
//                               └─ exhausted ─────────────► 5 hand_to_agent
//
// KNOWN LIMITATION, deliberate: there is no tool_call step booking a slot,
// because a booking needs a concrete requestedAt and this journey has no way
// to ask the lead for one yet -- the engine cannot consume an inbound reply
// until the await_reply primitive lands. So this template waits for a booking
// to appear (recheckField 'appointment_booked') rather than negotiating one.
// When await_reply ships, the qualification turn goes between steps 0 and 1
// and a booking tool_call replaces the passive wait. mcpToolbox already
// carries 'booking' and 'reminder' so a client can add those steps by hand in
// the builder today.
export const realEstateLeadQualification: JourneyTemplate = {
  templateId: 'real-estate-lead-qualification-v1',
  name: 'Real estate lead qualification',
  description:
    'Greets a new lead on WhatsApp, invites them to book a site visit, nudges once if they go quiet, and hands to a human instead of following up forever.',
  vertical: 'real_estate',

  agent: {
    personaId: 'real-estate-qualifier-v1',
    name: 'Site visit assistant',
    // The "only answer from provided context" instruction is not optional --
    // it is the hallucination guard required by this project's RAG standards.
    // Do not remove it when editing this prompt.
    systemPrompt: [
      'You are a helpful assistant for a real estate business, talking to a prospective buyer on WhatsApp.',
      'Your goal is to understand what they are looking for and invite them to book a site visit.',
      'Only answer from the provided context. If the context does not contain the answer, say so clearly and offer to connect them with a human agent.',
      'Never invent prices, availability, floor plans, possession dates, or legal/approval status.',
      'Keep replies short and conversational -- this is WhatsApp, not email. Two or three sentences at most.',
    ].join(' '),
    toneDescription: 'Warm, direct, and brief. Never pushy.',
    mcpToolbox: ['booking', 'reminder'],
    channelConfig: {
      // Empty rather than absent: WhatsApp template config only applies once
      // outbound-outside-the-24h-window is real (blocked on Meta template
      // approval). Until then this journey only sends inside an open session.
      whatsapp: {},
    },
  },

  journey: {
    journeyId: 'real-estate-lead-qualification-v1',
    name: 'Real estate lead qualification',
    triggerType: 'lead_captured',
    startStepId: 'greet',
    steps: [
      {
        stepId: 'greet',
        name: 'Greet and ask what they are looking for',
        type: 'send_message',
        // messageHint is currently sent literally (the agent does not yet
        // compose from it), so it is written as a real sendable message rather
        // than as an instruction to the model.
        messageHint:
          'Hi! Thanks for your interest. To point you to the right property, could you tell me your budget range and which area you are considering? Happy to arrange a site visit whenever suits you.',
        next: 'wait_for_booking',
      },
      {
        stepId: 'wait_for_booking',
        name: 'Wait a day for them to book',
        type: 'wait_and_recheck',
        waitDays: 1,
        maxIterations: 3,
        recheckField: 'appointment_booked',
        onSatisfied: 'confirm_visit',
        onExhausted: 'nudge',
      },
      {
        stepId: 'nudge',
        name: 'Nudge once with a concrete offer',
        type: 'send_message',
        messageHint:
          'Just checking in -- would a weekend site visit work for you? I can hold a slot and share the exact location and directions.',
        next: 'wait_after_nudge',
      },
      {
        stepId: 'wait_after_nudge',
        name: 'Give them two more days after the nudge',
        type: 'wait_and_recheck',
        waitDays: 2,
        maxIterations: 2,
        recheckField: 'appointment_booked',
        onSatisfied: 'confirm_visit',
        onExhausted: 'hand_to_agent',
      },
      {
        stepId: 'confirm_visit',
        name: 'Confirm the booked visit',
        type: 'send_message',
        messageHint:
          'Your site visit is confirmed. I will send the location and a reminder before it. Looking forward to showing you around!',
      },
      {
        stepId: 'hand_to_agent',
        name: 'Hand to a human instead of following up again',
        type: 'human_handoff',
        reason: 'Lead did not book a site visit after an initial message and one nudge.',
      },
    ],
  },
}
