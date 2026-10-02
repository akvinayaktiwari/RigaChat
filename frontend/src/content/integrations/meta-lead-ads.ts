import type { IntegrationContent } from './types'

/**
 * Every statement here describes backend/src/services/meta-lead-service.ts and
 * the Meta Ads dashboard page as they are. The four permissions are
 * META_OAUTH_SCOPES in backend/src/providers/meta-provider.ts; if that list
 * changes, this file changes in the same commit.
 */
export const META_LEAD_ADS: IntegrationContent = {
  slug: 'meta-lead-ads',
  name: 'Meta Lead Ads',
  summary: 'Leads from your Meta lead forms land in the lead CRM the moment they are submitted.',
  title: 'Meta Lead Ads Integration — Vyostra AI',
  description:
    'Connect your Facebook Pages to Vyostra AI and every Meta Lead Ads submission lands in your lead CRM as it is submitted, with a WhatsApp alert and follow-up.',
  headline: 'Meta Lead Ads integration',
  lead: 'The Vyostra AI Meta Lead Ads integration brings every lead from your Meta lead forms into the Vyostra AI lead CRM the moment the form is submitted. You connect the Facebook Pages your ads run from, and each new lead arrives with every answer it gave, ready for a WhatsApp alert, a follow-up journey and your CRM.',
  setup: {
    heading: 'How do you connect Meta Lead Ads to Vyostra AI?',
    steps: [
      { title: 'Open Meta Ads', body: 'In your Vyostra AI dashboard, open Meta Ads and choose Connect with Facebook.' },
      { title: 'Approve your Pages', body: 'Facebook asks which Pages Vyostra AI may access. Approve every Page that runs Lead Ads; you are not limited to one.' },
      { title: 'Pick the Pages to connect', body: 'Back in Vyostra AI, choose the Pages to connect. Each is listed as connected once Meta confirms it will send that Page’s leads.' },
    ],
  },
  flow: {
    heading: 'What happens when someone submits a Meta lead form?',
    points: [
      'Meta notifies Vyostra AI as the form is submitted, and the lead is saved in your lead CRM with its name, phone, email and every other answer.',
      'If you have published a follow-up journey for Meta leads, it starts for that lead.',
      'If Zoho CRM is connected, the lead is created there too.',
      'If WhatsApp lead notifications are on, you get a WhatsApp message with the lead’s name and phone number.',
    ],
  },
  limits: {
    heading: 'What should you know before connecting?',
    points: [
      'You need a Facebook Page that you manage. Lead Ads belong to a Page, so an ad account alone is not enough.',
      'A Facebook Page can be connected to one Vyostra AI account at a time.',
      'Vyostra AI receives leads submitted after a Page is connected. It does not import leads submitted before that.',
      'Vyostra AI reads leads. It does not create, edit or pay for your ads.',
    ],
  },
  faq: [
    {
      question: 'Can I connect more than one Facebook Page?',
      answer: 'Yes. You can connect every Page you approve during the Facebook sign-in, and disconnect any one of them later without affecting the others.',
    },
    {
      question: 'Which permissions does Vyostra AI ask Meta for?',
      answer:
        'Four: pages_show_list to list your Pages, pages_manage_metadata to subscribe to a Page’s lead notifications, and pages_read_engagement with leads_retrieval to read the answers in each lead form submission.',
    },
    {
      question: 'How fast does a Meta lead reach Vyostra AI?',
      answer: 'As the form is submitted. Meta sends Vyostra AI a notification for each new lead, so there is no file to download and no schedule to wait for.',
    },
    {
      question: 'What happens to my leads if I disconnect a Page?',
      answer: 'New leads from that Page stop arriving. The leads already in your Vyostra AI lead CRM are kept.',
    },
    {
      question: 'What if a Page stops sending leads?',
      answer: 'Vyostra AI rechecks each connected Page’s subscription with Meta when you open the Meta Ads page, at most every 12 hours, and subscribes it again if Meta has dropped it.',
    },
  ],
  lastModified: '2026-10-02',
}
