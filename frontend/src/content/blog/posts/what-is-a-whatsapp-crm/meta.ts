import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'what-is-a-whatsapp-crm',
  title: 'What Is a WhatsApp CRM? What It Does and What to Check',
  excerpt:
    'A WhatsApp CRM keeps each WhatsApp conversation with a customer on that customer’s record, so the chat, the contact details and the follow-up status live in one place. What it stores, the WhatsApp rules it has to work inside, and what to check before you buy one.',
  publishedAt: '2026-10-06',
  authorId: 'vinayak-tiwari',
  category: 'WhatsApp',
  market: 'global',
  tags: ['WhatsApp', 'CRM', 'Lead Management'],
  readingMinutes: 6,
  seoTitle: 'What Is a WhatsApp CRM? A Plain Guide',
  seoDescription:
    'A WhatsApp CRM keeps each WhatsApp conversation on the customer’s record. What it stores, the WhatsApp rules it works inside, and what to check before buying.',
  relatedFeatures: ['/features/whatsapp', '/features/crm'],
  faq: [
    {
      question: 'What is a WhatsApp CRM?',
      answer:
        'A WhatsApp CRM is a customer or lead database in which each person’s WhatsApp conversation is attached to their record. Your team sees who the person is, what was said on WhatsApp and what the next step is in one place, instead of in separate phones and spreadsheets.',
    },
    {
      question: 'Does WhatsApp have its own CRM?',
      answer:
        'No. The WhatsApp Business app has labels, quick replies and a catalog, but it is a messaging app for one phone, not a shared record of customers and follow-up. A WhatsApp CRM is a separate product that connects to the WhatsApp Business Platform, which is the API businesses use to send and receive messages at scale.',
    },
    {
      question: 'Can a WhatsApp CRM message anyone at any time?',
      answer:
        'No. WhatsApp requires that a person has opted in before a business messages them, and free-form messages are allowed only within 24 hours of the person’s last message. After that, the business can only send a message template that Meta has approved. These rules apply to every WhatsApp CRM, whoever makes it.',
    },
    {
      question: 'Do I need the WhatsApp Business API to use a WhatsApp CRM?',
      answer:
        'For anything beyond one person on one phone, yes. A CRM that sends and receives WhatsApp messages on your behalf does it through the WhatsApp Business Platform, either directly with Meta or through a provider. Check which route a product uses and whose account the number sits in.',
    },
    {
      question: 'Is Vyostra AI a WhatsApp CRM?',
      answer:
        'Vyostra AI is a lead CRM with WhatsApp follow-up built in. Leads from your chat agents, lead forms and Meta lead ads land in one list, and a follow-up journey messages a new chat or Meta lead ad lead on WhatsApp, waits for a real reply and hands the lead to your team when it needs a person. It is a follow-up queue with four statuses, not a pipeline CRM with deal stages.',
    },
  ],
}

export default meta
