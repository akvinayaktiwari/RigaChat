import type { BlogPostMeta } from '../../../../types/blog'

const meta: BlogPostMeta = {
  slug: 'how-to-add-a-chatbot-to-your-website',
  title: 'How to Add a Chatbot to Your Website',
  excerpt:
    'Adding a chatbot is one script tag, pasted once. What the embed code does, where it goes on WordPress, Webflow, Shopify, Wix and Squarespace, which pages should show it, and what to check when the bubble does not appear.',
  publishedAt: '2026-10-26',
  authorId: 'vinayak-tiwari',
  category: 'Comparison',
  market: 'global',
  tags: ['Chatbot'],
  readingMinutes: 5,
  seoTitle: 'How to Add a Chatbot to Your Website',
  seoDescription:
    'Where to paste a chatbot embed code on WordPress, Webflow, Shopify, Wix and Squarespace, which pages should show it, and how to fix a bubble that won’t appear.',
  relatedFeatures: ['/features/chatbot'],
  faq: [
    {
      question: 'How do I add a chatbot to my website?',
      answer:
        'Copy the embed code from your chatbot provider and paste it just before the closing </body> tag of a template every page shares, such as the site footer. Most website builders have a place for this called custom code, footer code or code injection. No programming is needed.',
    },
    {
      question: 'Where do I paste a chatbot script?',
      answer:
        'Just before the closing </body> tag, on every page where the chatbot should appear. Pasting it into a shared footer or layout adds it to every page at once; paste it once only, or the bubble may load twice.',
    },
    {
      question: 'Why is my chatbot not showing on my website?',
      answer:
        'Most often the site was not published after the code was added, the code was saved somewhere that is not in the live page, or the bot id in the tag is wrong. After those, check the browser console for a blocked script, whether a cookie banner covers the bubble, and whether the chatbot is set to appear only after a delay or scroll.',
    },
    {
      question: 'Does a chatbot slow down my website?',
      answer:
        'A well-built one has little effect, because it loads after the page’s own content and stays small until a visitor opens it. Run a speed test on the page with and without the tag to check yours.',
    },
  ],
}

export default meta
