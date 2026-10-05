import type { DocMeta } from '../../../../types/docs'

const meta: DocMeta = {
  slug: 'api-reference',
  title: 'REST API reference',
  metaTitle: 'Chatbot API Reference: Leads, Bots, Forms, Voice',
  description: 'Every endpoint of the Vyostra AI REST API: leads, chatbots, lead forms and voice agents, with parameters, response fields and example requests.',
  lead: 'The Vyostra AI REST API has eight read-only endpoints under /v1, covering four resources: leads, chatbots, lead forms and voice agents. Every endpoint takes a GET request with an API key in the Authorization header and returns JSON. This page lists each endpoint, its parameters and every field in its response.',
  section: 'API reference',
  order: 1,
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  faq: [
    {
      question: 'Can the Vyostra AI API create or update leads?',
      answer: 'Not yet. Every endpoint in the Vyostra AI API today is read-only: it can list and fetch leads, chatbots, forms and voice agents, and cannot create, change or delete them. Leads are created by the chatbot, form and voice widgets and by connected Meta lead ads.',
    },
    {
      question: 'Does the Vyostra AI API have webhooks?',
      answer: 'No. The Vyostra AI API does not send webhooks today, so an integration that needs new leads has to poll GET /v1/leads on a schedule. The sync guide in these docs shows a polling loop that stays inside the rate limit.',
    },
    {
      question: 'In what order does GET /v1/leads return leads?',
      answer: 'In the same order as the Vyostra AI dashboard inbox, which is by urgency rather than by date: overdue follow-ups first, then untouched leads, then scheduled, in-progress and closed ones. To get every lead, follow nextCursor until it is null instead of relying on the order.',
    },
  ],
}

export default meta
