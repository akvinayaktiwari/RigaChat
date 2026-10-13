import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'ai-assistant-for-real-estate-agents-us',
  title: 'AI Assistant for Real Estate Agents: What to Hand Off in the US',
  excerpt:
    'An AI assistant for a real estate agent answers new enquiries, asks the first qualifying questions and hands a ready lead to a person. What it can safely take off your plate, what it cannot, and the federal consent law (the TCPA) you still have to respect when it sends a text.',
  publishedAt: '2026-10-10',
  authorId: 'vinayak-tiwari',
  category: 'Real Estate',
  market: 'us',
  tags: ['Real Estate', 'AI Assistant', 'Lead Follow-up', 'United States', 'TCPA'],
  readingMinutes: 5,
  seoTitle: 'AI Assistant for Real Estate Agents in the US',
  seoDescription:
    'What an AI assistant can handle for a US real estate agent: first replies, qualifying questions, handoff and the TCPA text-consent rule. Not legal advice.',
  relatedFeatures: ['/features/crm'],
  faq: [
    {
      question: 'What can an AI assistant do for a real estate agent?',
      answer:
        'It can reply to a new enquiry at any hour, answer questions about listings you have given it, ask a few qualifying questions such as budget and timeline, and pass the conversation to you with the answers attached. It should not negotiate, quote a price you have not approved, or give legal or mortgage advice.',
    },
    {
      question: 'Does the TCPA apply to a text sent by an AI assistant?',
      answer:
        'It can. The Telephone Consumer Protection Act, 47 U.S.C. § 227, restricts calls to a cell phone that use an automatic telephone dialing system or an artificial or prerecorded voice unless the call is made with the prior express consent of the called party. A private person can sue for actual loss or $500 per violation, whichever is greater, and a court may increase that for a willful or knowing violation. Whether a particular text falls under the statute is a legal question to put to a lawyer.',
    },
    {
      question: 'Does Vyostra AI pull leads from Zillow or Realtor.com?',
      answer:
        'No. Vyostra AI captures leads from a chat agent and lead forms on your own website and from Meta lead ads, keeps them in one list and follows up on WhatsApp. It does not import enquiries from Zillow, Realtor.com or other portals.',
    },
  ],
}

export default meta
