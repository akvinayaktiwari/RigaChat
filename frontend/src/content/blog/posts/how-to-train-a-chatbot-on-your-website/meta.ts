import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'how-to-train-a-chatbot-on-your-website',
  title: 'How to Train a Chatbot on Your Website Content',
  excerpt:
    'A chatbot answers from what your pages say, so training it is mostly an editing job. What it reads from your site, what it misses, what to add by hand, and how often to retrain it.',
  publishedAt: '2026-10-24',
  authorId: 'vinayak-tiwari',
  category: 'Comparison',
  market: 'global',
  tags: ['Chatbot', 'Knowledge Base'],
  readingMinutes: 6,
  seoTitle: 'How to Train a Chatbot on Your Website',
  seoDescription:
    'What a chatbot reads from your website, what it misses, what to add to its knowledge base by hand, and how often to retrain it when your site changes.',
  relatedFeatures: ['/features/chatbot'],
  faq: [
    {
      question: 'How do you train a chatbot on your website?',
      answer:
        'Point it at your website address and let it read your pages, then add by hand anything your team answers often that the site does not say. The chatbot keeps your pages as searchable text and answers each question from the passages that match it, so what it can answer is what your pages say.',
    },
    {
      question: 'Which pages should a chatbot read?',
      answer:
        'The pages that answer what visitors ask before they buy: pricing, products or services, FAQ, about, contact and policy pages. Old blog and news posts are usually better left out, because they can contradict current prices and offers.',
    },
    {
      question: 'What can a chatbot not read on a website?',
      answer:
        'Text inside images, text that scripts load after the page opens, linked files such as PDFs, and anything your team knows but never wrote on a page. Add the last one to the knowledge base by hand.',
    },
    {
      question: 'How often should you retrain a chatbot?',
      answer:
        'Whenever the facts it answers from change. A chatbot answers from the text it read on the day it read it, so re-read the site the same day prices, plans or services change, and use a hand-written entry for one-off facts such as holiday hours.',
    },
  ],
}

export default meta
