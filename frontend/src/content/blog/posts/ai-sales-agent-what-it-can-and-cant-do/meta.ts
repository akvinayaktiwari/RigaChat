import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'ai-sales-agent-what-it-can-and-cant-do',
  title: 'AI Sales Agent: What It Can and Can’t Do',
  excerpt:
    'An AI sales agent talks to prospects for you: it answers questions, asks qualifying questions, captures contact details and follows up. It does not negotiate, close or know things you never told it. What it does well, where it fails, and how to judge one.',
  publishedAt: '2026-10-06',
  authorId: 'vinayak-tiwari',
  category: 'Comparison',
  market: 'global',
  tags: ['AI Sales Agent', 'Lead Qualification', 'Lead Follow-up'],
  readingMinutes: 6,
  seoTitle: 'AI Sales Agent: What It Can and Can’t Do',
  seoDescription:
    'What an AI sales agent can do (answer, qualify, follow up) and cannot (negotiate, close, invent answers), and five questions to ask before you buy one.',
  relatedFeatures: ['/features/chatbot', '/features/crm'],
  faq: [
    {
      question: 'What is an AI sales agent?',
      answer:
        'An AI sales agent is software that talks to prospects on your behalf, usually in chat, voice or messaging. It answers questions from your content, asks qualifying questions, collects contact details and follows up, then hands the prospect to a person when a decision or negotiation is needed.',
    },
    {
      question: 'Can an AI sales agent close a sale?',
      answer:
        'For a simple purchase with fixed terms it can take an order. For anything that involves negotiation, custom pricing or a large commitment, the realistic job is to qualify the prospect and pass them to a person quickly with the conversation attached.',
    },
    {
      question: 'Can an AI sales agent make things up?',
      answer:
        'A general-purpose model can. A well-built agent answers only from the content you gave it and says so when that content does not contain the answer. Test this before you launch by asking questions you know your content does not cover.',
    },
    {
      question: 'What is the difference between an AI sales agent and a chatbot?',
      answer:
        'The terms overlap. A chatbot answers questions. An AI sales agent is expected to do sales work as well: qualify, capture the lead, follow up and hand over. Ask a vendor what it does after the first answer, not what it is called.',
    },
    {
      question: 'Does Vyostra AI have an AI sales agent?',
      answer:
        'Vyostra AI’s chat agent answers from your website and knowledge base, asks for contact details, and sends new leads a WhatsApp follow-up that waits for a reply and hands over to your team. It does not negotiate prices or close sales, and its voice agent runs on your web page, not on phone calls.',
    },
  ],
}

export default meta
