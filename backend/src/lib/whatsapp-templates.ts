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
  // Overrides WHATSAPP_TEMPLATE_LANGUAGE for this template only. Needed
  // because a template's identity is name + language, so an en and an en_US
  // template of the same name are two DIFFERENT templates. Only set it where
  // matching an existing template exactly matters (hello_world).
  language?: string
  // Optional TEXT header shown above the body in bold. No placeholders
  // supported here -- a parameterised header needs its own example payload.
  header?: string
  // Optional small grey line under the body. Never takes placeholders.
  footer?: string
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

// The template the dashboard's "send test message" button uses. Named here
// rather than inlined at the call sites so the route, the UI copy and the
// definition below can never drift apart.
export const WHATSAPP_SMOKE_TEST_TEMPLATE = 'connection_test_1'

export const WHATSAPP_TEMPLATES: WhatsAppTemplateDefinition[] = [
  {
    // A zero-parameter smoke-test template, so that every WABA -- ours and
    // each client's -- has one known-good template to prove delivery with
    // before any real template has cleared review. Meta auto-creates its
    // sample on TEST WABAs only, never on a real one, which is exactly when a
    // working smoke test matters most.
    //
    // The wording is deliberately OURS and must stay that way. Meta rejects
    // any template reusing its sample's exact body text ("Welcome and
    // congratulations!! This message demonstrates your ability to send...")
    // even under a different template name, and reports it as
    // "(#200) Permissions error" -- an error that points nowhere near the
    // actual cause. Verified against the live API 2026-08-15 by creating the
    // same three components with generic copy (accepted) and with Meta's copy
    // (rejected). Do not "restore" the original text.
    //
    // The name is NOT hello_world, and cannot be. Meta reserves that name on
    // every WABA whether or not the sample actually exists there: creating it
    // fails with "Template name is already used as a sample template"
    // (observed 2026-08-15 on WABA 1353319399571291). This is a SECOND,
    // independent reservation on top of the body-text one above -- a real
    // WABA rejects both the name and the copy, so a faithful hello_world
    // clone is impossible by two separate mechanisms.
    //
    // Test WABAs hide this: Meta pre-creates hello_world there, so the script
    // skips it and never attempts the create that would have revealed it.
    name: 'connection_test_1',
    category: 'UTILITY',
    language: 'en_US',
    header: 'Connection test',
    footer: 'Sent by Vyostra AI',
    body:
      'This is a test message confirming that WhatsApp delivery is configured correctly for this account. No action is needed.',
    bodyExample: [],
    sentBy: 'Manual smoke tests only -- not sent by application code.',
  },
  {
    name: 'lead_notification_1',
    category: 'UTILITY',
    // Goes to the CLIENT's notificationNumber, not to the lead. Always
    // business-initiated, so it can never rely on an open session window.
    body: 'New lead from {{1}}\n\nName: {{2}}\nPhone: {{3}}\nInterest: {{4}}\n\nOpen your Vyostra inbox to reply.',
    bodyExample: ['Website chat', 'Ravi Kumar', '+91 98765 43210', '3 BHK in Wakad'],
    buttons: [{ type: 'URL', text: 'Open inbox', url: 'https://vyostra.com/dashboard/leads' }],
    sentBy: 'lead-notification-service.ts sendLeadNotification',
  },
  {
    // Goes to the CLIENT's notificationNumber on a weekly schedule, so it is
    // business-initiated by definition and can never rely on a session window.
    // It shipped for months as a free-text send and therefore never once
    // arrived -- same 131047 that killed lead_notification_1's path. See
    // weekly-report-service.ts for the full account.
    //
    // UTILITY because it reports activity on the recipient's own account and
    // asks nothing of them. Meta may still reclassify it to MARKETING on
    // review, as it did to lead_welcome_qualify_1 -- that is a pricing change,
    // not a breakage, and the send path does not care either way.
    name: 'weekly_report_1',
    category: 'UTILITY',
    body:
      'Your weekly Vyostra report\n\nNew leads this week: {{1}}\n- Chat widget: {{2}}\n- Forms: {{3}}\n\nOpen your dashboard for the details.',
    bodyExample: ['7', '5', '2'],
    buttons: [{ type: 'URL', text: 'Open dashboard', url: 'https://vyostra.com/dashboard/leads' }],
    sentBy: 'weekly-report-service.ts sendWeeklyReport',
  },
  {
    name: 'lead_welcome_qualify_1',
    // Submitted as UTILITY because it answers an enquiry the lead initiated.
    // Meta RECLASSIFIED it to MARKETING on review (observed 2026-08-15 on WABA
    // 1678448677253148: created UTILITY, approved MARKETING). Left as UTILITY
    // deliberately — submitting the cheaper category costs nothing, since Meta
    // reclassifies rather than rejects, and a future wording might hold as
    // UTILITY. Budget for MARKETING pricing on this one regardless.
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
    // Trailing sentence is required, not decorative: Meta rejects a body that
    // ends with a variable (error_subcode 2388299, "Variables can't be at the
    // start or end of the template"), and a trailing "." does not satisfy it.
    body: 'Reminder: your site visit at {{1}} is tomorrow, {{2}} at {{3}}. Tap below to confirm or reschedule.',
    bodyExample: ['Skyline Residences', 'Sat 22 Aug', '11:00 AM'],
    buttons: [
      { type: 'QUICK_REPLY', text: 'Confirm' },
      { type: 'QUICK_REPLY', text: 'Reschedule' },
    ],
    // NOT SENT BY ANYTHING YET. It previously claimed the lead_reminder
    // ScheduledAction, which as of 2026-08-16 sends lead_handoff_alert_1 to
    // the CLIENT instead -- a reminder is "look at this lead", not a message
    // to the lead about a visit. Approved and waiting for the appointment
    // reminder path that will send it.
    sentBy: 'Nothing yet -- reserved for the appointment reminder path.',
  },
  {
    name: 'agent_handoff_1',
    category: 'UTILITY',
    body: "Hi {{1}}, {{2}} from our team will call you shortly about your enquiry.\n\nIf now isn't a good time, reply with a time that suits you.",
    bodyExample: ['Ravi', 'Priya'],
    sentBy: 'journey-templates/real-estate-lead-qualification.ts step "hand_to_agent"',
  },
  {
    // The other half of hand_to_agent. agent_handoff_1 above tells the LEAD a
    // human is coming; this one tells the human. Both fire from the same step,
    // and shipping only the lead-facing half is what made the handoff a
    // promise nobody was told to keep.
    //
    // Also sent for the lead_reminder ScheduledAction, which is the same
    // capability -- "a person needs to look at this lead now" -- reached by a
    // timer instead of by an exhausted journey. {{3}} carries the difference.
    name: 'lead_handoff_alert_1',
    category: 'UTILITY',
    // Business-initiated to the client's notificationNumber, so it can never
    // ride an open session window: the client may not have messaged us in
    // days. UTILITY is honest here -- it reports on a transaction already in
    // progress rather than promoting anything.
    header: 'A lead needs you',
    footer: 'Sent by Vyostra AI',
    // The deep link is a BODY variable, not a URL button, because a LeadRef
    // needs query params (?source=chat&botId=...) and Meta only allows a
    // button's variable as a trailing path suffix. A static "Open inbox"
    // button like lead_notification_1's would land the client on the list and
    // make them hunt for the lead the message just named.
    //
    // {{4}} is a FLATTENED transcript summary. Template parameters cannot
    // contain newlines, tabs, or 4+ consecutive spaces -- Meta rejects the
    // send, not the template, so this would pass review and fail in
    // production. The send site joins turns with a middot for that reason.
    //
    // The closing line is load-bearing: Meta rejects a body ending in a
    // variable (error_subcode 2388299), and the link is the last real content.
    body:
      'Your AI agent has stopped and handed this lead over.\n\n' +
      'Name: {{1}}\n' +
      'Phone: {{2}}\n' +
      'Reason: {{3}}\n\n' +
      'Recent messages: {{4}}\n\n' +
      'Open the lead: {{5}}\n\n' +
      'Reply to the lead from your Vyostra inbox to take over.',
    bodyExample: [
      'Ravi Kumar',
      '+91 98765 43210',
      'No booking after 3 follow-ups',
      'Lead: I just want to know about pricing \u00b7 Agent: I do not have that information right now. Would you like to speak with our team?',
      'https://vyostra.com/dashboard/leads/5383cb15-1f28-4eda-9914-834a90c0facd?source=chat&botId=b1f2',
    ],
    sentBy: 'notification-service.ts sendHandoffAlert (hand_to_agent + lead_reminder)',
  },
  {
    // The fallback for the one above, and the reason it exists is scheduling
    // rather than design: lead_handoff_alert_1 sat PENDING for a day while
    // every other template on this WABA cleared in minutes, blocking the whole
    // handoff feature behind a queue nobody can hurry.
    //
    // It is the same message with the two things that plausibly pushed _1 into
    // human review removed: five body variables becomes three, and the deep
    // link stops being a URL-valued PARAMETER. What replaces it is a STATIC URL
    // button, which is exactly the shape lead_notification_1 above already got
    // approved on this same WABA -- so this is a pattern with evidence behind
    // it, not a guess.
    //
    // The cost is real and worth stating: the human gets the lead's name and
    // the reason, but lands on the inbox and has to find that lead themselves
    // rather than arriving at it. Prefer _1 whenever it is approved; see
    // notification-service.ts HANDOFF_ALERT_TEMPLATE for the switch.
    name: 'lead_handoff_alert_2',
    category: 'UTILITY',
    header: 'A lead needs you',
    footer: 'Sent by Vyostra AI',
    // Same rule as site_visit_reminder_1: the closing sentence is required, not
    // decorative. Meta rejects a body ending in a variable (error_subcode
    // 2388299).
    body:
      'Your AI agent has stopped and handed this lead over.\n\n' +
      'Name: {{1}}\n' +
      'Phone: {{2}}\n' +
      'Reason: {{3}}\n\n' +
      'Open your Vyostra inbox to read the conversation and take over.',
    bodyExample: ['Ravi Kumar', '+91 98765 43210', 'No booking after 3 follow-ups'],
    buttons: [{ type: 'URL', text: 'Open inbox', url: 'https://vyostra.com/dashboard/leads' }],
    sentBy: 'notification-service.ts sendHandoffAlert, when _1 is not yet approved',
  },
]

// Resolves a template by name so callers can send it without restating its
// language. Sending a template under the wrong language code fails with error
// 132001, so the language must always come from the definition rather than a
// literal at the call site.
export function findTemplate(name: string): WhatsAppTemplateDefinition | undefined {
  return WHATSAPP_TEMPLATES.find((template) => template.name === name)
}

export function templateLanguageOf(name: string): string {
  return findTemplate(name)?.language ?? WHATSAPP_TEMPLATE_LANGUAGE
}
