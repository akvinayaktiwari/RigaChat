import type { IntegrationContent } from './types'

/**
 * Every statement here describes backend/src/providers/zoho-provider.ts and
 * backend/src/services/crm-service.ts as they are. If the sync changes (a new
 * lead source, another Zoho data centre, a new mapped field), change this file
 * in the same commit: an answer engine quotes it as fact.
 */
export const ZOHO_CRM: IntegrationContent = {
  slug: 'zoho-crm',
  name: 'Zoho CRM',
  summary: 'Leads from your lead forms and Meta Lead Ads are created in Zoho CRM as they arrive.',
  title: 'Zoho CRM Integration — Vyostra AI',
  description:
    'Connect Zoho CRM to Vyostra AI and each lead from your lead forms and Meta Lead Ads is created in Zoho as it arrives. What is sent, where, and the limits.',
  headline: 'Zoho CRM integration',
  lead: 'The Vyostra AI Zoho CRM integration creates a lead in your Zoho CRM each time a lead arrives from a Vyostra AI lead form or from Meta Lead Ads. You connect your Zoho account once from Settings, and from then on each lead is sent as it is captured, with its name, phone, email and the page it came from.',
  setup: {
    heading: 'How do you connect Zoho CRM to Vyostra AI?',
    steps: [
      { title: 'Open Integrations', body: 'In your Vyostra AI dashboard, go to Settings, then Integrations, and choose Connect on the Zoho CRM card.' },
      { title: 'Approve in Zoho', body: 'Zoho asks you to sign in and approve access. Vyostra AI asks only for permission to create and update records in the Leads module.' },
      { title: 'Leads start arriving', body: 'You return to Vyostra AI with Zoho shown as connected. The next lead from a form or a Meta lead ad appears in Zoho CRM under Leads.' },
    ],
  },
  flow: {
    heading: 'What happens to a lead once Zoho CRM is connected?',
    points: [
      'The lead is saved in the Vyostra AI lead CRM first, so a Zoho problem never loses it.',
      'Vyostra AI then creates a new record in the Leads module of your Zoho CRM, straight away, not on a schedule.',
      'If Zoho is briefly unavailable, Vyostra AI tries up to three times.',
      'If Zoho rejects the record, for example as a duplicate, the lead stays in the Vyostra AI lead CRM and is not sent again.',
    ],
  },
  mapping: {
    heading: 'Which lead details are sent to which Zoho CRM field?',
    fromLabel: 'From the lead',
    toLabel: 'Zoho CRM field',
    rows: [
      { from: 'Name', to: 'Last Name' },
      { from: 'Email', to: 'Email' },
      { from: 'Phone', to: 'Phone' },
      { from: 'Company, when the form asks for one', to: 'Company' },
      { from: 'The page the form was submitted from', to: 'Website' },
      { from: 'Every other answer, with its question', to: 'Description' },
      { from: 'Always "VyostraAI"', to: 'Lead Source' },
    ],
    note: 'The mapping is fixed. A field is recognised by its type or by its label, so a field labelled "Mobile number" is sent as Phone.',
  },
  limits: {
    heading: 'What are the limits of the Zoho CRM integration?',
    points: [
      'It sends leads from lead forms and Meta Lead Ads. Leads captured by the chat agent stay in the Vyostra AI lead CRM and are not sent to Zoho.',
      'It works with Zoho accounts on the India data centre (zoho.in).',
      'It is one-way: changes you make in Zoho are not copied back to Vyostra AI.',
      'It creates Leads only. It does not create Contacts, Deals or activities.',
    ],
  },
  faq: [
    {
      question: 'Which leads does Vyostra AI send to Zoho CRM?',
      answer:
        'Leads from your Vyostra AI lead forms and from Meta Lead Ads. Leads captured by the chat agent stay in the built-in Vyostra AI lead CRM and are not sent to Zoho.',
    },
    {
      question: 'How quickly does a lead reach Zoho CRM?',
      answer: 'As it is captured. Vyostra AI sends each lead to Zoho straight after saving it, not in a batch, and tries up to three times if Zoho is briefly unavailable.',
    },
    {
      question: 'What access does Vyostra AI need in Zoho?',
      answer: 'Permission to create and update records in the Leads module, which you approve on Zoho’s own sign-in screen. Vyostra AI does not ask to read your existing Zoho records.',
    },
    {
      question: 'Does it work with every Zoho data centre?',
      answer: 'It works with Zoho accounts on the India data centre, zoho.in. Accounts hosted on Zoho’s other data centres cannot be connected today.',
    },
    {
      question: 'How do I stop sending leads to Zoho CRM?',
      answer: 'Disconnect Zoho CRM from Settings, Integrations. New leads then stay in Vyostra AI only. Leads already created in Zoho are not removed.',
    },
  ],
  lastModified: '2026-10-02',
}
