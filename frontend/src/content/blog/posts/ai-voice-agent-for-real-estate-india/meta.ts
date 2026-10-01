import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'ai-voice-agent-for-real-estate-india',
  title: 'AI Voice Agent for Real Estate in India: What It Should Answer and What It Should Hand Off',
  excerpt:
    'A property buyer on your project page has questions that are simple to ask and costly to get wrong: is it available, what is the price, when is possession. A voice agent can answer some of them well. The skill is in deciding which, and in making the handoff to your sales team clean.',
  publishedAt: '2026-10-01',
  authorId: 'vinayak-tiwari',
  category: 'Lead Generation Playbook',
  tags: ['Voice AI', 'Real Estate', 'India', 'Lead Generation'],
  readingMinutes: 7,
  seoTitle: 'AI Voice Agent for Real Estate in India',
  seoDescription:
    'What a real estate AI voice agent should answer from your knowledge base, what it must hand to sales, and why availability and price are the risky questions.',
  relatedFeatures: ['/features/chatbot'],
  faq: [
    {
      question: 'What can an AI voice agent do for a real estate business?',
      answer:
        'It can talk to a visitor on a project page and answer routine questions from your knowledge base: location, configurations, amenities, how to book a site visit. It hands the conversation to your sales team when the visitor shows buying intent or asks something it cannot confirm. It does not replace a sales executive; it covers the first question so the visitor is not left waiting.',
    },
    {
      question: 'Should an AI voice agent quote the price of a flat?',
      answer:
        'Only a price or range you have written into its knowledge base and are prepared to stand behind, and ideally with the wording that it is indicative. Anything that depends on the unit, floor, payment plan, offers or taxes should go to a person. A spoken price is easy for a buyer to remember and quote back to you, so an improvised one is a liability.',
    },
    {
      question: 'Can a voice agent tell a buyer whether a unit is still available?',
      answer:
        'Only if your knowledge base is kept current, which in practice means someone updates it whenever a unit sells. Availability is the question where stale data does the most harm, since the agent will state an old answer with full confidence. If you cannot guarantee freshness, have the agent say it will confirm availability with the team rather than answer.',
    },
    {
      question: 'Does a real estate voice agent need to mention RERA?',
      answer:
        'It should not state RERA registration details unless they are in the knowledge base exactly as registered, because an incorrect spoken claim about regulatory status is a serious error. Rules on how projects are advertised differ by state authority, so check what your own state RERA requires for marketing, and give the agent only the verified registration information.',
    },
  ],
}

export default meta
