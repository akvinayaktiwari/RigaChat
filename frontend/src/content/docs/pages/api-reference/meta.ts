import type { DocMeta } from '../../../../types/docs'

const meta: DocMeta = {
  slug: 'api-reference',
  title: 'REST API reference',
  metaTitle: 'Chatbot API Reference: Leads, Bots, Forms, Voice',
  description: 'Every endpoint of the Vyostra AI REST API: leads, chatbots, lead forms and voice agents, with parameters, response fields and example requests.',
  lead: 'The Vyostra AI REST API has nine endpoints under /v1, covering four resources: leads, chatbots, lead forms and voice agents. Eight are GET requests that read data, and one, POST /v1/forms, creates a lead form. Every request carries an API key in the Authorization header and returns JSON. This page lists each endpoint, its parameters and its response fields.',
  section: 'API reference',
  order: 1,
  publishedAt: '2026-10-05',
  authorId: 'vinayak-tiwari',
  faq: [
    {
      question: 'Can the Vyostra AI API create or update leads?',
      answer: 'Not yet. The Vyostra AI API can list and fetch leads but cannot create or change them. Leads are created by the chatbot, form and voice widgets and by connected Meta lead ads. The one thing the API can create is a lead form, with POST /v1/forms, and submissions to that form then arrive as leads.',
    },
    {
      question: 'Can I create a Vyostra AI lead form from code?',
      answer: 'Yes. POST /v1/forms creates a Vyostra AI lead form from a JSON list of fields and returns its formId. It needs an API key with the forms:write scope on a Growth or Agency plan. Call it once during setup, not on every submission: sending the same request again returns the existing form instead of a duplicate.',
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
