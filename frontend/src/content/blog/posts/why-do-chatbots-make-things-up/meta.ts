import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'why-do-chatbots-make-things-up',
  title: 'Why Do Chatbots Make Things Up, and How Do You Stop It?',
  excerpt:
    'A chatbot invents an answer when its sources do not hold one and nothing tells it to stop. Where made-up answers come from, which ones cost a business most, and the five things that prevent them.',
  publishedAt: '2026-10-25',
  authorId: 'vinayak-tiwari',
  category: 'Comparison',
  market: 'global',
  tags: ['Chatbot', 'Knowledge Base'],
  readingMinutes: 6,
  seoTitle: 'Why Chatbots Make Things Up (and the Fix)',
  seoDescription:
    'Why AI chatbots invent prices and policies, which wrong answers cost a business most, and five ways to stop a chatbot hallucinating on your website.',
  relatedFeatures: ['/features/chatbot'],
  faq: [
    {
      question: 'Why do chatbots make things up?',
      answer:
        'Because the language model underneath is built to write plausible text, not to check it. When a question is not answered by the chatbot’s sources and nothing tells it to stop, it writes the most likely-sounding reply, and a likely-sounding price or policy reads exactly like a real one.',
    },
    {
      question: 'How do you stop a chatbot from hallucinating?',
      answer:
        'Make it answer only from your own website and knowledge base, tell it explicitly to say so when those sources do not contain the answer, give it a next step such as passing the question to your team, keep the sources current, and test it with questions you know it cannot answer.',
    },
    {
      question: 'Can a chatbot be 100% accurate?',
      answer:
        'No. What you can control is how it fails. A chatbot limited to your own text fails by saying it does not know and handing the visitor to your team; one without those limits fails by inventing a confident answer.',
    },
    {
      question: 'What should a chatbot say when it does not know the answer?',
      answer:
        'Something short that admits the gap and offers a next step, such as: "I don’t have that information right now. Would you like someone from our team to get back to you?" Avoid replies that guess, or that ask the visitor to rephrase when the real problem is a missing answer.',
    },
  ],
}

export default meta
