/**
 * The terms /glossary/ defines, in the order the page shows them.
 *
 * Read by the page AND by its DefinedTermSet schema, so the two cannot drift:
 * a term published in structured data that the page does not show is the same
 * spam-policy problem as hidden FAQ answers.
 *
 * A definition is generic (true of the category, not of Vyostra AI) and makes
 * no numeric claim it cannot point to. Platform rules are restated from Meta's
 * own docs, as the WhatsApp app vs API post cites them. Every `link` must be a
 * route the site actually serves; glossary.test.ts checks it.
 */
export interface GlossaryTerm {
  /** Fragment id on the page and the tail of the term's schema @id. */
  id: string
  term: string
  /** Plain text: rendered and serialised into JSON-LD. One to three sentences. */
  definition: string
  /** A page on this site that goes further, as a routed path without the trailing slash. */
  link?: { label: string; path: string }
}

export const GLOSSARY_TERMS: readonly GlossaryTerm[] = [
  {
    id: 'ai-agent',
    term: 'AI agent',
    definition:
      'Software that holds a conversation and takes actions on its own, such as answering a question, asking for contact details or booking a follow-up, instead of only following a fixed script.',
    link: { label: 'What an AI sales agent can and cannot do', path: '/blog/ai-sales-agent-what-it-can-and-cant-do' },
  },
  {
    id: 'ai-receptionist',
    term: 'AI receptionist',
    definition:
      'An AI agent that answers phone calls to a business: it picks up, answers common questions, takes messages or books appointments. It works on a phone line, unlike an on-page voice agent, which works inside a web page.',
    link: { label: 'AI receptionist vs website voice agent', path: '/blog/ai-receptionist-vs-website-voice-agent' },
  },
  {
    id: 'chatbot',
    term: 'Chatbot',
    definition:
      'Software that replies to messages on its own, in a chat window on a website or in a messaging app. Older chatbots follow scripted flows; AI chatbots write replies from content they have been given.',
    link: { label: 'The real estate chatbot guide', path: '/blog/real-estate-chatbot-guide' },
  },
  {
    id: 'click-to-whatsapp-ad',
    term: 'Click to WhatsApp ad',
    definition:
      'A Facebook or Instagram ad whose button opens a WhatsApp chat with the advertiser instead of a website or a form. The person who taps it starts the conversation.',
    link: { label: 'Click to WhatsApp ads vs lead forms', path: '/blog/click-to-whatsapp-ads-vs-lead-forms-real-estate-india' },
  },
  {
    id: 'crm',
    term: 'CRM',
    definition:
      'Customer relationship management: the system a business keeps its leads and customers in, with their contact details, history and where each one stands.',
    link: { label: 'What a CRM chatbot is', path: '/blog/what-is-a-crm-chatbot' },
  },
  {
    id: 'customer-service-window',
    term: 'Customer service window',
    definition:
      'On the WhatsApp Business Platform, the 24 hours after a user last messaged or called a business. Inside it the business can send ordinary messages; outside it, only template messages Meta has approved.',
    link: { label: 'WhatsApp Business app vs API', path: '/blog/whatsapp-business-app-vs-api' },
  },
  {
    id: 'embed-code',
    term: 'Embed code',
    definition:
      'A short snippet, usually one script tag, pasted into a website’s HTML to add a chat widget, form or other tool to every page that carries it.',
    link: { label: 'Widget embeds in the developer docs', path: '/docs' },
  },
  {
    id: 'exit-intent',
    term: 'Exit intent',
    definition:
      'A trigger that shows something, such as a chat bubble, when the visitor’s mouse moves toward the top of the window as if to leave. It relies on a mouse, so it applies on desktop, not on phones.',
    link: { label: 'Chatbot greeting messages and when to show them', path: '/blog/chatbot-greeting-message-examples' },
  },
  {
    id: 'free-entry-point',
    term: 'Free entry point',
    definition:
      'On the WhatsApp Business Platform, a window of up to 7 days that opens when a business replies in time to someone who messaged from a Click to WhatsApp ad. Meta does not charge for marketing, utility, authentication or service messages while it is open.',
    link: { label: 'WhatsApp Business app vs API', path: '/blog/whatsapp-business-app-vs-api' },
  },
  {
    id: 'hallucination',
    term: 'Hallucination',
    definition:
      'An AI model stating something that is not true as if it were, such as an invented price or policy. A chatbot that answers only from given content, and says when the answer is not there, hallucinates less.',
  },
  {
    id: 'handoff',
    term: 'Handoff',
    definition:
      'The moment a chatbot passes a conversation or a lead to a person. In a live handoff a person joins the chat; in a lead handoff the chatbot collects contact details and a person follows up.',
    link: { label: 'Chatbot vs live chat', path: '/blog/chatbot-vs-live-chat' },
  },
  {
    id: 'knowledge-base',
    term: 'Knowledge base',
    definition:
      'The content a chatbot answers from: pages read from a website, plus entries a business writes for questions the website does not answer.',
    link: { label: 'What to put in a chatbot knowledge base', path: '/blog/what-to-put-in-a-real-estate-chatbot-knowledge-base' },
  },
  {
    id: 'lead',
    term: 'Lead',
    definition: 'A person who has shown interest in buying and left a way to reach them, such as a phone number or an email address.',
  },
  {
    id: 'lead-capture',
    term: 'Lead capture',
    definition:
      'Collecting a visitor’s contact details so the business can follow up, through a form, a chatbot, an ad form or a phone call.',
    link: { label: 'Lead form vs chatbot', path: '/blog/lead-form-vs-chatbot' },
  },
  {
    id: 'lead-form',
    term: 'Lead form',
    definition: 'A web form that asks a visitor for contact details and, often, a few questions about what they want. Each submission becomes a lead.',
    link: { label: 'Lead forms', path: '/features/forms' },
  },
  {
    id: 'lead-qualification',
    term: 'Lead qualification',
    definition:
      'Working out whether a lead is likely to buy and how soon, usually by asking about need, budget and timing, so the team spends its time on the leads most likely to close.',
    link: { label: 'Chatbot lead qualification questions', path: '/blog/real-estate-chatbot-lead-qualification-questions' },
  },
  {
    id: 'messaging-limit',
    term: 'Messaging limit',
    definition:
      'On the WhatsApp Business Platform, the number of unique users a business can message outside a customer service window in a moving 24 hours. Meta starts new business portfolios at 250 and raises the limit as the business is verified and keeps message quality high.',
    link: { label: 'WhatsApp Business app vs API', path: '/blog/whatsapp-business-app-vs-api' },
  },
  {
    id: 'meta-lead-ads',
    term: 'Meta lead ads',
    definition:
      'Facebook and Instagram ads with a form built in: the person fills it in without leaving the app, and the advertiser receives their details as a lead.',
    link: { label: 'The Meta Lead Ads integration', path: '/integrations/meta-lead-ads' },
  },
  {
    id: 'rag',
    term: 'Retrieval-augmented generation (RAG)',
    definition:
      'A way of building AI chatbots in which the system first finds the passages of its knowledge base that match a question, then writes the answer from those passages rather than from the model’s general training.',
  },
  {
    id: 'template-message',
    term: 'Template message',
    definition:
      'On the WhatsApp Business Platform, message wording a business submits to Meta in advance for review. Only approved templates can be sent outside a customer service window, for example the first message to a new lead.',
    link: { label: 'WhatsApp Business app vs API', path: '/blog/whatsapp-business-app-vs-api' },
  },
  {
    id: 'voice-agent',
    term: 'Voice agent',
    definition:
      'An AI agent that talks instead of typing. An on-page voice agent runs in the browser when a visitor taps a button; a phone voice agent answers or makes calls.',
    link: { label: 'The AI voice agent', path: '/features/voice-agent' },
  },
  {
    id: 'whatsapp-business-app',
    term: 'WhatsApp Business app',
    definition:
      'Meta’s free WhatsApp app for small businesses. A person on the team types every reply, with a few automatic messages such as a greeting and an away message.',
    link: { label: 'WhatsApp Business app vs API', path: '/blog/whatsapp-business-app-vs-api' },
  },
  {
    id: 'whatsapp-business-api',
    term: 'WhatsApp Business API',
    definition:
      'The common name for the WhatsApp Business Platform: a connection software sends and receives WhatsApp messages through, with no app of its own. Meta charges per delivered message from the business.',
    link: { label: 'WhatsApp Business app vs API', path: '/blog/whatsapp-business-app-vs-api' },
  },
  {
    id: 'whatsapp-bsp',
    term: 'WhatsApp Business Solution Provider (BSP)',
    definition:
      'A company Meta authorises to connect businesses to the WhatsApp Business Platform and send messages for them. Gupshup is one.',
  },
  {
    id: 'whatsapp-crm',
    term: 'WhatsApp CRM',
    definition: 'A CRM that stores WhatsApp conversations against each lead, so the team sees who said what without scrolling a phone.',
    link: { label: 'What a WhatsApp CRM is', path: '/blog/what-is-a-whatsapp-crm' },
  },
  {
    id: 'widget-trigger',
    term: 'Widget trigger',
    definition:
      'The rule that decides when a chat widget appears on a page: immediately, after a delay, after the visitor scrolls part of the page, or on exit intent.',
    link: { label: 'Chatbot greeting messages and when to show them', path: '/blog/chatbot-greeting-message-examples' },
  },
]

export const GLOSSARY_LAST_MODIFIED = '2026-10-22'
