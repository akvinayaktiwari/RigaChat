import type { IndustryContent } from './types'

/**
 * Every product statement here describes code as it is:
 *   - the lead fields: LeadFieldId in backend/src/services/lead-service.ts
 *     (name, phone, email, propertyInterest, budgetRange);
 *   - the follow-up: backend/src/lib/journey-templates/real-estate-lead-qualification.ts,
 *     step by step, with the wording of its two WhatsApp templates
 *     (lead_welcome_qualify_2, lead_followup_nudge_2 in lib/whatsapp-templates.ts).
 *     If that template changes, sampleFlow changes in the same commit;
 *   - which leads start a journey: igniteJourneysForLead is called for chat
 *     and Meta leads, not form leads;
 *   - alerts: lead-notification-service.ts (chat, form and Meta leads);
 *   - Zoho: form and Meta lead ad leads only (zoho-claims.test.ts holds this).
 *
 * No market figures, response times or conversion rates: none are sourced.
 */
export const REAL_ESTATE: IndustryContent = {
  slug: 'real-estate',
  name: 'Real Estate',
  summary: 'How Vyostra AI answers property enquiries, qualifies buyers on budget and area, and follows up on WhatsApp towards a site visit.',
  title: 'AI Agent for Real Estate Leads — Vyostra AI',
  description:
    'An AI agent for property enquiries: answers buyers on chat and voice from your project details, captures budget and interest, and follows up on WhatsApp.',
  headline: 'AI agent for real estate leads',
  answerFirstIntro:
    'Vyostra AI for real estate is an AI agent that answers property enquiries on your project website by chat and voice, using only the project details you give it. It captures each buyer’s contact details, budget range and property interest in a built-in lead CRM, then follows up on WhatsApp to invite a site visit and hands the lead to your sales team.',
  qualifying: {
    heading: 'What does the agent ask a property buyer?',
    questions: [
      { question: 'What is your name and phone number?', why: 'Asked by the chat agent’s lead form. Without a phone number there is no WhatsApp follow-up.' },
      { question: 'Which property are you interested in?', why: 'A lead form field, stored on the lead as its property interest and named in the first WhatsApp message.' },
      { question: 'What budget are you working with?', why: 'The first WhatsApp message asks this, with three ranges the buyer can tap instead of typing.' },
      { question: 'Which day suits you for a site visit?', why: 'Asked once the buyer has replied, because a visit is the step a property sale moves on.' },
      { question: 'Would a weekend site visit work for you?', why: 'The one nudge, sent only after 24 hours of silence. The buyer can tap this weekend, next weekend or not right now.' },
    ],
  },
  sampleFlow: {
    heading: 'What happens to a property lead, step by step?',
    steps: [
      { title: 'The enquiry arrives', body: 'A buyer asks the chat agent on your project page, fills in one of your lead forms, or submits a Meta lead ad. All three land in the same lead CRM.' },
      { title: 'Your team is alerted', body: 'If WhatsApp lead notifications are on, you get a WhatsApp message with the lead’s name and phone number as it arrives.' },
      { title: 'The agent greets the buyer on WhatsApp', body: 'For a chat or Meta lead ad lead, the prebuilt real estate journey sends a first message that greets the buyer by name, names the property they asked about and asks their budget.' },
      { title: 'It waits for a real reply', body: 'The journey does not run on a timer. It moves on when the buyer answers, and then offers a site visit and asks for a day.' },
      { title: 'It nudges once', body: 'If the buyer goes quiet for 24 hours, the journey sends one follow-up message. It does not send a second.' },
      { title: 'It hands over to your team', body: 'When a visit is booked the journey confirms it. If none is booked after three daily checks, it hands the lead to a person instead of messaging again.' },
    ],
  },
  limits: {
    heading: 'What does the agent leave to your sales team?',
    points: [
      'Final price, discounts and negotiation. The agent is instructed never to invent a price, availability, a floor plan, a possession date or an approval status.',
      'Anything not in your knowledge base. The agent says it does not have the answer and offers a person, rather than guessing.',
      'Local advertising rules (for example RERA registration in India, or Trakheesi permits in Dubai). It repeats only the registration or permit text you have given it; check what your local authority requires in marketing.',
      'Languages other than English on voice. The voice agent is English-first today.',
      'Following up on lead form submissions. A form lead is saved and alerted, but only chat and Meta lead ad leads start the WhatsApp follow-up journey today.',
      'Sending chat and voice leads to Zoho CRM. Only leads from your lead forms and Meta lead ads are created in Zoho CRM.',
    ],
  },
  faqs: [
    {
      question: 'Can the agent quote prices and availability for my project?',
      answer:
        'Only what you have written into its knowledge base, and only as you wrote it. It is instructed never to invent a price, availability or a possession date, and to offer a person when the answer is not there. Keep the knowledge base current, or tell it to leave both to your sales team.',
    },
    {
      question: 'Where do my property leads come from?',
      answer:
        'From the chat agent on your website, from Vyostra AI lead forms, and from Meta lead ads on the Facebook Pages you connect. All of them appear in one lead CRM.',
    },
    {
      question: 'Does the agent book site visits?',
      answer:
        'It asks the buyer for a day and waits for the visit to be booked, then confirms it on WhatsApp. If no visit is booked, it hands the lead to your team instead of following up again.',
    },
    {
      question: 'How many follow-up messages does a buyer get?',
      answer:
        'In the prebuilt real estate journey: a greeting, a site visit offer once they reply, and one nudge if they go quiet for 24 hours. After that the lead goes to a person. You can edit the journey after adding it to your account.',
    },
    {
      question: 'What do I need to set it up?',
      answer:
        'Your project website or brochure text for the knowledge base, and a WhatsApp Business API connection for alerts and follow-up. The follow-up messages are WhatsApp templates, which Meta reviews before they can be sent. To receive Meta lead ads you also need a Facebook Page that you manage.',
    },
  ],
  relatedPosts: [
    'whatsapp-chatbot-for-real-estate-india',
    'ai-voice-agent-for-real-estate-india',
    'click-to-whatsapp-ads-vs-lead-forms-real-estate-india',
  ],
  lastModified: '2026-10-05',
}
