import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'whatsapp-business-app-vs-api',
  title: 'WhatsApp Business App vs API: Which Does Your Business Need?',
  excerpt:
    'The WhatsApp Business app is a phone app your team types into. The WhatsApp Business Platform, usually called the API, is a connection your software sends through. What each can do, how Meta charges for the API since October 2026, and how to tell when you have outgrown the app.',
  publishedAt: '2026-10-22',
  authorId: 'vinayak-tiwari',
  category: 'WhatsApp',
  market: 'global',
  tags: ['WhatsApp', 'Lead Management'],
  readingMinutes: 7,
  seoTitle: 'WhatsApp Business App vs API: Which to Use',
  seoDescription:
    'The Business app is a phone app your team types into; the API is a connection software sends through. Features, Meta’s per-message pricing and limits, compared.',
  relatedFeatures: ['/features/whatsapp'],
  faq: [
    {
      question: 'What is the difference between the WhatsApp Business app and the API?',
      answer:
        'Who sends the messages. The WhatsApp Business app is an app a person on your team opens and types into. The WhatsApp Business Platform, usually called the API, has no app of its own: your software, or a provider’s, sends and receives messages through it, so replies can be automated and connected to your CRM.',
    },
    {
      question: 'Is the WhatsApp Business API free?',
      answer:
        'No. Meta charges per delivered message from a business to a user, at a rate set by the message category and the recipient’s country calling code. Messages from users to businesses are not charged. Since 1 October 2026, service replies inside the 24-hour window are also charged after a free tier of 1,000 per business phone number per month.',
    },
    {
      question: 'What is the 24-hour customer service window?',
      answer:
        'When a user messages or calls your business, a 24-hour window opens, and each new message from them restarts it. Inside the window you can send ordinary, non-template messages. Outside it you can only send template messages that Meta has approved.',
    },
    {
      question: 'How many people can I message with the WhatsApp Business API?',
      answer:
        'Meta limits how many unique users you can message outside a customer service window in a moving 24-hour period. A new business portfolio starts at 250. The limit rises to 2,000 when you verify your business or meet Meta’s other scaling conditions, and then to 10,000, 100,000 and unlimited as you keep message quality high and use at least half your limit.',
    },
    {
      question: 'When should a business move from the WhatsApp Business app to the API?',
      answer:
        'When the work no longer fits one phone. The usual signs are leads arriving faster than one person can reply, wanting an automatic first reply to every lead, needing leads and conversations in a CRM, or sending updates to more customers than you can message by hand.',
    },
  ],
}

export default meta
