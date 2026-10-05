import type { DocMeta } from '../../../../types/docs'

const meta: DocMeta = {
  slug: 'sync-leads',
  title: 'Sync leads to your CRM or database',
  metaTitle: 'Sync Chatbot Leads to a CRM With the Leads API',
  description: 'Copy every Vyostra AI lead into your own CRM or database with the leads API: pagination, de-duplication, polling, and Node.js and Python code.',
  lead: 'To copy Vyostra AI leads into your own CRM or database, call GET /v1/leads with limit=200 and keep following nextCursor until it is null, saving each lead under its id. Run that loop on a schedule. The API has no webhooks yet, so polling is how a system outside Vyostra AI learns about new leads.',
  section: 'Guides',
  order: 2,
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  faq: [
    {
      question: 'How often should I poll the Vyostra AI leads API?',
      answer: 'Every few minutes is enough for most uses. Each Vyostra AI API key may make 120 requests a minute and a full read of 1,000 leads takes 5 requests at limit=200, so a poll every 5 minutes uses a small fraction of the limit. For an instant alert on each new lead, use the built-in WhatsApp lead alerts instead of polling faster.',
    },
    {
      question: 'How do I avoid importing the same lead twice?',
      answer: 'Store the id field of each lead and use it as the unique key in your own system. A Vyostra AI lead id never changes, so writing with an upsert keyed on it makes every run safe to repeat.',
    },
    {
      question: 'Can I fetch only the leads created since my last sync?',
      answer: 'Not with a filter. The Vyostra AI leads endpoint has no date parameter today, so a sync reads every page and relies on the lead id to skip what it already has. Each lead has a createdAt timestamp if you want to filter on your side.',
    },
  ],
}

export default meta
