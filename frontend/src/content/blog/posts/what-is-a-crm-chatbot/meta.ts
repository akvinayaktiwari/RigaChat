import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'what-is-a-crm-chatbot',
  title: 'What Is a CRM Chatbot? How It Works and When You Need One',
  excerpt:
    'A CRM chatbot is a chatbot that saves every conversation as a lead record, either in its own built-in CRM or in one you already use. What it stores, the two ways it is built, and how a small business should choose between them.',
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  category: 'Comparison',
  market: 'global',
  tags: ['CRM', 'Chatbot', 'Lead Management'],
  readingMinutes: 6,
  seoTitle: 'What Is a CRM Chatbot? How It Works',
  seoDescription:
    'A CRM chatbot answers visitors and saves each conversation as a lead record. How it works, built-in CRM versus integration, and how to choose between them.',
  relatedFeatures: ['/features/crm', '/features/chatbot'],
  faq: [
    {
      question: 'What is a CRM chatbot?',
      answer:
        'A CRM chatbot is a chatbot that answers people on a website or messaging app and saves each conversation as a lead record: who the person is, how to reach them and what they asked. The record sits either in a CRM built into the chatbot product or in a separate CRM the chatbot is connected to.',
    },
    {
      question: 'What is the difference between a chatbot and a CRM?',
      answer:
        'A chatbot talks to people; a CRM remembers them. A chatbot answers questions and collects details in a conversation. A CRM stores those details as records and tracks what your team does next. A CRM chatbot joins the two, so the conversation and the record are the same thing rather than two systems someone has to keep in step.',
    },
    {
      question: 'Do I need a separate CRM if my chatbot has one built in?',
      answer:
        'Not if your follow-up is simple: someone looks at new leads, contacts them and marks what happened. You need a separate CRM when you have a sales process a lead list cannot hold, such as deal stages with values, several teams with different access, or forecasting and custom reports.',
    },
    {
      question: 'Can a chatbot send leads to Zoho CRM?',
      answer:
        'Many can, through a built-in integration or a connector tool. Check which leads are actually sent: some products sync every lead and some only certain sources. In Vyostra AI, leads from lead forms and Meta lead ads are created in Zoho CRM automatically, and leads from chat and voice conversations stay in the Vyostra AI lead CRM.',
    },
    {
      question: 'What should a CRM chatbot store about a lead?',
      answer:
        'At least five things: the person’s name and contact details, where the lead came from, the conversation or the answers they gave, a status your team updates, and notes. The transcript is the part a plain contact form cannot give you, and it is what lets a salesperson start the call knowing what was already asked.',
    },
  ],
}

export default meta
