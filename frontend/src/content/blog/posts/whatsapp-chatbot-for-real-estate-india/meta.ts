import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'whatsapp-chatbot-for-real-estate-india',
  title: 'WhatsApp Chatbot for Real Estate in India: What Actually Works',
  excerpt:
    'Most property enquiries in India end up on WhatsApp, and most of them go cold waiting for a reply. Here is how the WhatsApp Business Platform actually behaves — the 24-hour window, templates, opt-in — and how to design a qualification and site-visit flow around those rules rather than against them.',
  publishedAt: '2026-09-16',
  category: 'Lead Generation Playbook',
  tags: ['WhatsApp', 'Real Estate', 'India', 'Lead Generation'],
  readingMinutes: 9,
  seoTitle: 'WhatsApp Chatbot for Real Estate in India',
  seoDescription:
    'A WhatsApp chatbot for real estate replies to property enquiries instantly and qualifies them. How the 24-hour window, templates and opt-in shape the flow.',
  relatedFeatures: ['/features/whatsapp', '/features/crm'],
  faq: [
    {
      question: 'What is a WhatsApp chatbot for real estate?',
      answer:
        'It is an automated agent on a WhatsApp Business number that replies to a property enquiry the moment it arrives, asks the qualifying questions a site visit depends on — budget, locality, possession timeline, financing — writes the answers to your CRM, and either books the visit or hands the conversation to a human. It runs on the WhatsApp Business Platform (the API), not on the free WhatsApp Business app, because only the API can be driven by software.',
    },
    {
      question: 'Do I need permission before messaging a lead on WhatsApp?',
      answer:
        'Yes. WhatsApp requires opt-in before a business sends a message, and the opt-in has to be obtained where the person can see what they are agreeing to — the form, the ad, or the portal enquiry itself. A lead who messages you first has opened the conversation themselves, which is the cleanest opt-in there is. Buying a list of numbers and messaging them is the fastest route to getting a number blocked.',
    },
    {
      question: 'What is the 24-hour window, and what happens after it closes?',
      answer:
        "WhatsApp lets a business send free-form messages only within 24 hours of the customer's last message. After that window closes, the only thing you can send is a pre-approved template message. This single rule decides most of the design: a follow-up sequence that assumes it can send anything at any time will silently fail on every lead who went quiet for a day.",
    },
    {
      question: 'Can a chatbot replace the sales team?',
      answer:
        'No, and it should not try. A chatbot is good at the first ten minutes: answering instantly at 11pm, capturing budget and locality, and telling you which enquiries are worth a call. Negotiation, objection handling and the site visit itself are human work. The measurable win is that a qualified lead reaches a human sooner, with the context already collected.',
    },
    {
      question: 'How do WhatsApp chatbots handle leads from Facebook and Instagram ads?',
      answer:
        'A Meta lead ad hands you the form submission through a webhook, which is what lets the first WhatsApp message go out within seconds of the form being submitted rather than after the next CRM export. Click-to-WhatsApp ads work differently and more simply: the person taps the ad and opens a chat themselves, which means they have started the conversation and the 24-hour window is already open.',
    },
    {
      question: 'What does a WhatsApp chatbot for real estate cost in India?',
      answer:
        'Two separate costs. WhatsApp itself is billed by Meta through your Business Solution Provider, priced per message and varying by message category and country — check Meta’s current pricing, as the model has changed more than once. On top of that sits whatever software runs the conversations, typically a monthly SaaS subscription. Treat any quote that hides the Meta component inside one number with suspicion.',
    },
  ],
}

export default meta
