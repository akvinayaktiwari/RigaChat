import type { DocMeta } from '../../../../types/docs'

const meta: DocMeta = {
  slug: 'embed-widgets',
  title: 'Embed the chatbot, form and voice widgets',
  metaTitle: 'Add an AI Chatbot to Your Website With One Script Tag',
  description: 'Add the Vyostra AI chatbot, lead form and voice agent to any website: the script tag for each widget, where to paste it, and its options.',
  lead: 'To add the Vyostra AI chatbot to a website, paste one script tag before the closing body tag of each page, with your bot id in the data-bot-id attribute. No API key or build step is needed. The lead form and the voice agent are embedded the same way, each with its own script and id.',
  section: 'Guides',
  order: 1,
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  faq: [
    {
      question: 'Do I need an API key to embed the Vyostra AI chatbot?',
      answer: 'No. The Vyostra AI chatbot script tag identifies your bot by its bot id, which is safe to publish in your page source. API keys are only for reading your data from your own server and must never be placed in a web page.',
    },
    {
      question: 'Does the Vyostra AI chatbot work on WordPress, Shopify or Webflow?',
      answer: 'The Vyostra AI chatbot works on any site where you can add a script tag to the page HTML, because the widget is plain JavaScript with no framework dependency. On a hosted site builder, paste the tag wherever the builder accepts custom code for the footer or the end of the body.',
    },
    {
      question: 'Will the chatbot script slow my page down?',
      answer: 'The Vyostra AI script tag carries the async attribute, so the browser downloads it without pausing the rest of the page. The widget draws itself after your own content has loaded.',
    },
  ],
}

export default meta
