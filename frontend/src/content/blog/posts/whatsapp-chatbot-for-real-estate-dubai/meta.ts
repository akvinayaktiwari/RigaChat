import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'whatsapp-chatbot-for-real-estate-dubai',
  title: 'WhatsApp Chatbot for Real Estate in Dubai: A Practical Guide',
  excerpt:
    'A WhatsApp chatbot for a Dubai brokerage answers a buyer’s enquiry in seconds, asks the few questions a viewing depends on, and hands the lead to an agent with the conversation attached. How it should work around portal enquiries, off-plan launches, permit rules and WhatsApp’s own limits, and what it cannot do.',
  publishedAt: '2026-10-08',
  authorId: 'vinayak-tiwari',
  category: 'WhatsApp',
  market: 'ae',
  tags: ['WhatsApp', 'Real Estate', 'Dubai', 'Chatbot', 'Lead Follow-up'],
  readingMinutes: 8,
  seoTitle: 'WhatsApp Chatbot for Real Estate in Dubai',
  seoDescription:
    'How a WhatsApp chatbot works for a Dubai brokerage: instant replies, viewing-focused questions, permit and consent rules, and the limits to know first.',
  relatedFeatures: ['/features/whatsapp', '/features/crm'],
  faq: [
    {
      question: 'What is a WhatsApp chatbot for real estate in Dubai?',
      answer:
        'It is an automated agent on a WhatsApp Business number that replies to a property enquiry as soon as it arrives, asks the few questions a viewing depends on (budget, area, ready or off-plan, timeline, cash or mortgage), records the answers against the lead, and either proposes a viewing or hands the chat to an agent. It runs on the WhatsApp Business Platform (the API), because the free WhatsApp Business app cannot be driven by software.',
    },
    {
      question: 'Can a WhatsApp chatbot reply to Property Finder and Bayut enquiries?',
      answer:
        'Only if the enquiry reaches the chatbot. A portal enquiry can arrive by email, phone call or WhatsApp, depending on what the seeker taps, so a bot that lives on WhatsApp sees only the third kind. Ask any vendor exactly which portals and which enquiry types it captures. Vyostra AI does not import portal enquiries.',
    },
    {
      question: 'Can the chatbot message a lead first on WhatsApp?',
      answer:
        'Only with a message template that Meta has approved, and only if the person has opted in. Free-form messages are allowed only within 24 hours of the person’s last message to you. A buyer who taps a click-to-WhatsApp ad starts the conversation themselves, so your first reply is free-form.',
    },
    {
      question: 'Does a WhatsApp chatbot need a Trakheesi permit?',
      answer:
        'The permit belongs to the advertisement, not to the software. The Dubai Land Department’s permit service covers electronic and SMS advertising among other types, so wording that promotes a specific property should be wording you have had approved. A chatbot should repeat approved text and permit details, not write its own property claims.',
    },
    {
      question: 'Does the chatbot speak Arabic?',
      answer:
        'Vyostra AI works in English today. Arabic support has not been tested on a live bot, so we do not claim it. If your buyers mostly write in Arabic, ask any vendor to show a real conversation before you rely on it.',
    },
    {
      question: 'How much does a WhatsApp chatbot cost to run?',
      answer:
        'Two costs: the chatbot platform, and Meta’s charge for template messages. Since 1 July 2025 Meta charges per delivered template message, at a rate that depends on the template category and the recipient’s country calling code. Replies inside the 24-hour window are free, and so is every message during the 72-hour window that follows a reply to a click-to-WhatsApp ad enquiry.',
    },
  ],
}

export default meta
