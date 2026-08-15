import type { JourneyTemplate } from '../../types/index.js'

// The first prebuilt agent: qualify an inbound real-estate lead over WhatsApp,
// nudge once if they go quiet, hand to a human rather than nagging forever.
//
// Step order is load-bearing, not cosmetic. journey-compiler-service.ts
// validates that every reference (next / onNoReply / onSatisfied / onExhausted)
// points to a LATER array index -- that forward-only rule is what makes a
// journey a DAG by construction, and await_reply is held to it too so it cannot
// be used to smuggle in a loop. Reordering this array without re-checking the
// references fails the compile, which is exactly the intent.
//
//   0 greet ──────────────────► 1 await_qualification
//   1 await_qualification ─ reply ──► 2 offer_visit
//                          └ 24h ───► 4 nudge
//   2 offer_visit ────────────► 3 await_visit_time
//   3 await_visit_time ── reply ───► 5 wait_for_booking
//                          └ 24h ───► 4 nudge
//   4 nudge ──────────────────► 5 wait_for_booking
//   5 wait_for_booking ─ satisfied ► 6 confirm_visit
//                       └ exhausted ► 7 hand_to_agent
//
// The two await_reply steps are what make this a conversation rather than a
// drip campaign: the execution parks (costing nothing) until the lead actually
// answers, and only then moves on. Each falls back to the same nudge when the
// 24h WhatsApp window closes without a reply.
//
// Outbound outside the 24h window now works: send_message falls back to the
// step's approved WhatsApp template when the session is shut, so greet and
// nudge can actually reach a lead who has never messaged first. Free text is
// still used while a window is open, because it is free and reads better.
//
// STILL A LIMITATION, and an honest one: send_message delivers messageHint
// literally today rather than composing a reply from what the lead just said,
// so the journey can branch on a reply arriving but not yet on its content. The
// lead's words are available downstream at $.lastResult.message for whenever
// AI-composed sends land. Booking is still a passive wait on
// appointment_booked rather than a tool_call, because a booking needs a
// concrete requestedAt and parsing one out of free text is that same
// composition problem.
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
      // Agent-wide default for send_message steps that name no template of
      // their own. Steps that do name one (greet, nudge) override this.
      whatsapp: { messageTemplateName: 'connection_test_1' },
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
          'Hi! Thanks for your interest. To point you to the right property, could you tell me your budget range and which area you are considering?',
        // This step fires on lead_captured, so the session window is almost
        // always shut -- the template is the path that actually sends.
        whatsappTemplateName: 'lead_welcome_qualify_1',
        whatsappTemplateParams: ['{{lead.name}}', '{{lead.propertyInterest}}'],
        next: 'await_qualification',
      },
      {
        stepId: 'await_qualification',
        name: 'Wait for them to tell us budget and area',
        type: 'await_reply',
        promptHint: 'budget range and preferred area',
        next: 'offer_visit',
        onNoReply: 'nudge',
      },
      {
        stepId: 'offer_visit',
        name: 'Acknowledge and offer a site visit',
        type: 'send_message',
        messageHint:
          'Thanks, that helps. Would you like to see the property in person? Tell me a day that suits you and I will arrange a site visit.',
        next: 'await_visit_time',
      },
      {
        stepId: 'await_visit_time',
        name: 'Wait for them to name a day',
        type: 'await_reply',
        promptHint: 'a day that suits them for a site visit',
        next: 'wait_for_booking',
        onNoReply: 'nudge',
      },
      {
        stepId: 'nudge',
        name: 'Nudge once when they go quiet',
        type: 'send_message',
        messageHint:
          'Just checking in -- would a weekend site visit work for you? I can hold a slot and share the exact location and directions.',
        // Reached only after 24h of silence, so the window is shut by
        // definition. Without a template this step could never send at all.
        whatsappTemplateName: 'lead_followup_nudge_1',
        whatsappTemplateParams: ['{{lead.name}}'],
        next: 'wait_for_booking',
      },
      {
        stepId: 'wait_for_booking',
        name: 'Wait for a booking to be confirmed',
        type: 'wait_and_recheck',
        waitDays: 1,
        maxIterations: 3,
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
        reason: 'Lead did not book a site visit after qualification, a nudge, and a wait.',
      },
    ],
  },
}
