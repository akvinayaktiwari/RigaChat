import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'how-to-test-a-chatbot-before-launch',
  title: 'How to Test a Chatbot Before You Launch It',
  excerpt:
    'An hour of testing catches most of what would otherwise reach customers first. A checklist: real customer questions, questions it cannot answer, tricky wording, the lead hand-off, and the widget on your live site.',
  publishedAt: '2026-10-29',
  authorId: 'vinayak-tiwari',
  category: 'Comparison',
  market: 'global',
  tags: ['Chatbot', 'Knowledge Base', 'Lead Management'],
  readingMinutes: 7,
  seoTitle: 'How to Test a Chatbot Before Launch',
  seoDescription:
    'A pre-launch chatbot testing checklist: real customer questions, questions it should refuse, typos and vague wording, the lead hand-off, and the live widget.',
  relatedFeatures: ['/features/chatbot', '/features/crm'],
  faq: [
    {
      question: 'How do you test a chatbot before launch?',
      answer:
        'Ask it the questions your customers really ask, in their wording, and check every answer against what is true today. Then ask for things you do not offer to check it admits what it does not know, try typos and vague questions, walk through the lead hand-off as a visitor, and check the widget on your live site on a phone and a laptop.',
    },
    {
      question: 'How do you check a chatbot is not making things up?',
      answer:
        'Ask it things you know your website does not answer, such as a price for a product you do not sell or a service in a city you do not cover. A well-built chatbot says it does not have that information and offers to pass the question on. If it gives a confident number or a yes, it is inventing answers.',
    },
    {
      question: 'How many questions should you test a chatbot with?',
      answer:
        'Twenty or thirty real customer questions is a practical start, taken from your inbox, phone notes and sales team, plus a handful of questions it should not be able to answer. After fixing a gap, ask again in different words, not the exact sentence you tested before.',
    },
    {
      question: 'When is a chatbot ready to launch?',
      answer:
        'When every answer about money, policies and availability is right, every question it cannot answer is admitted rather than guessed, and a test lead reaches your team with the conversation attached. Smaller gaps can be fixed after launch by reading the first week of conversations.',
    },
  ],
}

export default meta
