import type { DocMeta } from '../../../../types/docs'

const meta: DocMeta = {
  slug: 'quickstart',
  title: 'Quickstart: your first API request',
  metaTitle: 'Chatbot API Quickstart: First Request in 5 Minutes',
  description: 'Create a Vyostra AI API key and make your first request to the chatbot and leads API with curl, Node.js or Python, in about five minutes.',
  lead: 'To call the Vyostra AI API, create an API key in the dashboard under Settings, then send it as a Bearer token to an endpoint under /v1. The steps below take about five minutes and end with a JSON list of the leads your chatbot, forms and voice agent have captured.',
  section: 'Get started',
  order: 1,
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  faq: [
    {
      question: 'Do I need an SDK to use the Vyostra AI API?',
      answer: 'No. The Vyostra AI API is plain HTTPS and JSON, so any language with an HTTP client can call it. There is no official SDK yet; the examples in these docs use curl, the fetch function built into Node.js 18 and later, and the Python requests library.',
    },
    {
      question: 'Can I call the Vyostra AI API from a web page?',
      answer: 'No. Vyostra AI API keys are secrets and the API does not answer cross-origin browser requests, so calls must come from a server, a serverless function or a script. To put the chatbot on a web page, use the widget script tag instead, which needs no key.',
    },
    {
      question: 'Which Vyostra AI plans include API access?',
      answer: 'Vyostra AI API access is included in the Starter, Growth and Agency plans. It is not available on the free trial. If an account moves to a plan without API access, its keys stop working until the plan includes it again.',
    },
  ],
}

export default meta
