// The WhatsApp message templates every WABA needs before a journey can send
// anything outside an open 24h session window.
//
// These live in lib/ rather than in a script because templates are per-WABA,
// NOT per-app: a client who connects their own WhatsApp through Embedded
// Signup starts with zero templates, so onboarding has to create this same set
// on their WABA and wait for approval before their journeys can run. The
// script in scripts/create-whatsapp-templates.ts is just the manual entry
// point to the same definitions.
//
// Each definition is paired below with the code that actually sends it, so a
// template can never be quietly orphaned from its send site.

export type WhatsAppTemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION'

export interface WhatsAppTemplateButton {
  type: 'QUICK_REPLY' | 'URL'
  text: string
  // Required for URL buttons, absent for quick replies. Static only —
  // a dynamic URL suffix would need its own example value at create time.
  url?: string
}

export interface WhatsAppTemplateDefinition {
  name: string
  category: WhatsAppTemplateCategory
  body: string
  // One sample value per {{n}} placeholder, in order. Meta REJECTS a template
  // whose body has placeholders and no example, so this is not optional
  // whenever body contains {{.
  bodyExample: string[]
  buttons?: WhatsAppTemplateButton[]
  // Which code path sends this. Documentation only, but it is the thing that
  // makes an unused template obvious in review.
  sentBy: string
}

// Single source of truth for the language code. Meta matches the language of a
// send request against the approved template EXACTLY — sending 'en_US' against
// a template approved as 'en' fails with error 132001. Keeping create-side and
// send-side on one constant is what stops that drift.
export const WHATSAPP_TEMPLATE_LANGUAGE = 'en'

export const WHATSAPP_TEMPLATES: WhatsAppTemplateDefinition[] = [
  {
    name: 'lead_notification_1',
    category: 'UTILITY',
    // Goes to the CLIENT's notificationNumber, not to the lead. Always
    // business-initiated, so it can never rely on an open session window.
    body: 'New lead from {{1}}\n\nName: {{2}}\nPhone: {{3}}\nInterest: {{4}}\n\nOpen your Vyostra inbox to reply.',
    bodyExample: ['Website chat', 'Ravi Kumar', '+91 98765 43210', '3 BHK in Wakad'],
    buttons: [{ type: 'URL', text: 'Open inbox', url: 'https://vyostra.com/dashboard/leads' }],
    sentBy: 'whatsapp-service.ts sendLeadNotification',
  },
  {
    name: 'lead_welcome_qualify_1',
    // Submitted as UTILITY because it answers an enquiry the lead initiated,
    // but Meta reclassifies openers like this to MARKETING fairly often. If it
    // comes back MARKETING that is a pricing change, not a bug — do not
    // rewrite the copy to fight it.
    category: 'UTILITY',
    body: "Hi {{1}}, thanks for your interest in {{2}}.\n\nTo point you to the right property, could you tell me your budget range and which area you're considering?",
    bodyExample: ['Ravi', 'Skyline Residences'],
    sentBy: 'journey-templates/real-estate-lead-qualification.ts step "greet"',
  },
  {
    name: 'lead_followup_nudge_1',
    // Genuinely MARKETING — it re-engages a lead who went quiet. Submitting it
    // as UTILITY would get it reclassified or rejected.
    category: 'MARKETING',
    body: 'Hi {{1}}, just checking in — would a weekend site visit work for you?\n\nI can hold a slot and share the exact location and directions.',
    bodyExample: ['Ravi'],
    buttons: [
      { type: 'QUICK_REPLY', text: 'Yes, this weekend' },
      { type: 'QUICK_REPLY', text: 'Not right now' },
    ],
    sentBy: 'journey-templates/real-estate-lead-qualification.ts step "nudge"',
  },
  {
    name: 'site_visit_confirmed_1',
    category: 'UTILITY',
    body: "Your site visit is confirmed.\n\nProperty: {{1}}\nDate: {{2}}\nTime: {{3}}\n\nI'll send the location and a reminder before your visit.",
    bodyExample: ['Skyline Residences', 'Sat, 22 Aug', '11:00 AM'],
    sentBy: 'journey-templates/real-estate-lead-qualification.ts step "confirm_visit"',
  },
  {
    name: 'site_visit_reminder_1',
    category: 'UTILITY',
    body: 'Reminder: your site visit at {{1}} is tomorrow, {{2}} at {{3}}.',
    bodyExample: ['Skyline Residences', 'Sat 22 Aug', '11:00 AM'],
    buttons: [
      { type: 'QUICK_REPLY', text: 'Confirm' },
      { type: 'QUICK_REPLY', text: 'Reschedule' },
    ],
    sentBy: 'appointment-service.ts / lead_reminder ScheduledAction',
  },
  {
    name: 'agent_handoff_1',
    category: 'UTILITY',
    body: "Hi {{1}}, {{2}} from our team will call you shortly about your enquiry.\n\nIf now isn't a good time, reply with a time that suits you.",
    bodyExample: ['Ravi', 'Priya'],
    sentBy: 'journey-templates/real-estate-lead-qualification.ts step "hand_to_agent"',
  },
]
