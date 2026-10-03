import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { faqPageSchema, featurePageNodes, jsonLdGraph, type FaqItem } from '../../lib/structured-data'
import { Link2, FileText, Database, Keyboard, ListChecks, RotateCw, Users, Bot } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * Every answer is checked against the backend, not the marketing copy:
 * - which leads sync: only form-lead-service and meta-lead-service call
 *   crm-service; chat and voice leads do not.
 * - fields: ZohoProvider.syncLead and mapLead in providers/zoho-provider.ts.
 *   A Meta lead's website is its Facebook Page URL (meta-lead-service.ts).
 * - access: the OAuth scope ZohoCRM.modules.leads.CREATE,UPDATE.
 * - data centre: ZOHO_ACCOUNTS_URL and ZOHO_API_URL are the .in hosts.
 * - retries: MAX_RETRY_ATTEMPTS in services/crm-service.ts counts attempts,
 *   the first one included, so 3 means tried three times, retried twice.
 *   PERMANENT_FAILURE_CODES is in providers/zoho-provider.ts.
 * - failure records: a lead Zoho turns down gets crmSyncError. A token refresh
 *   that throws is only logged for Meta leads, so do not promise every lead
 *   records its outcome.
 * Change the copy when the code changes, never the other way round.
 */
export const ZOHO_CRM_FAQ: FaqItem[] = [
  {
    question: 'Which leads does Vyostra AI send to Zoho CRM?',
    answer:
      'New leads from your Vyostra AI lead forms and from your Meta lead ads. Leads from chat and voice conversations are not sent to Zoho; they stay in the Vyostra AI lead CRM with their transcripts.',
  },
  {
    question: 'Which Zoho CRM fields does a synced lead fill?',
    answer:
      "Each lead is created in Zoho's Leads module with the lead's name, email, phone and company, the page of your site its form was on as the website (your Facebook Page, for a Meta lead ad), and VyostraAI as the lead source. Any other answers the lead gave go into the description.",
  },
  {
    question: 'What access does Vyostra AI ask for in Zoho?',
    answer:
      'Only permission to create and update records in the Leads module. Vyostra AI does not ask to read your contacts, deals or any other module.',
  },
  {
    question: 'Which Zoho CRM accounts can connect?',
    answer:
      "Accounts on Zoho's India data centre, the ones you sign in to at zoho.in. The integration connects to that data centre only.",
  },
  {
    question: 'What happens if a lead fails to sync?',
    answer:
      'A temporary error is tried up to three times. A lead Zoho rejects, for example as a duplicate or for a missing mandatory field, is not retried. Either way the lead stays in the Vyostra AI lead CRM, so nothing is lost.',
  },
  {
    question: 'How do I disconnect Zoho CRM?',
    answer:
      'From Settings, Integrations, in the same place you connected it. Disconnecting deletes the Zoho access Vyostra AI stored, and new leads stop syncing. Leads already in Zoho stay there.',
  },
]

const PAGE = { name: 'Zoho CRM Integration', path: '/features/zoho-crm/' }

interface SyncedField {
  zoho: string
  value: string
}

const SYNCED_FIELDS: SyncedField[] = [
  { zoho: 'Last Name', value: 'Rahul Sharma' },
  { zoho: 'Email', value: 'rahul@example.com' },
  { zoho: 'Phone', value: '+91 98xxx xxxxx' },
  { zoho: 'Lead Source', value: 'VyostraAI' },
  { zoho: 'Website', value: 'yoursite.com/3bhk' },
]

function ZohoLeadMockup() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant shadow-lg overflow-hidden max-w-sm w-full">
      <div className="bg-surface-container-low px-4 py-3 text-[10px] font-bold text-on-surface-variant uppercase">New lead in Zoho CRM</div>
      {SYNCED_FIELDS.map((field) => (
        <div key={field.zoho} className="px-4 py-2.5 grid grid-cols-2 gap-2 border-t border-outline-variant/20">
          <span className="text-xs text-on-surface-variant">{field.zoho}</span>
          <span className="text-xs font-semibold text-on-surface truncate">{field.value}</span>
        </div>
      ))}
      <div className="bg-surface-container-low/50 px-4 py-2 text-[10px] text-on-surface-variant">From a lead form, synced on arrival</div>
    </div>
  )
}

export default function ZohoCrm() {
  return (
    <>
      <PageMeta
        title="Zoho CRM Integration — Vyostra AI"
        description="Send new leads from Vyostra AI lead forms and Meta lead ads to Zoho CRM automatically, with name, email, phone and source page."
        path="/features/zoho-crm/"
      />
      <StructuredData data={jsonLdGraph([...featurePageNodes(PAGE), faqPageSchema(ZOHO_CRM_FAQ)])} />
      <UseCaseLayout
        featurePath="/features/zoho-crm"
        badge="ZOHO CRM INTEGRATION"
        headline="Send form and Meta lead ad leads to Zoho CRM"
        subheadline="The Vyostra AI Zoho CRM integration creates a Zoho lead for every new submission from your Vyostra AI lead forms and your Meta lead ads. You connect your Zoho account once from Settings, and each lead then arrives in the Zoho Leads module with its name, email, phone, company and the page it came from."
        howItWorksHeading="How does the Zoho CRM integration work?"
        benefitsHeading="Why send leads to Zoho automatically?"
        heroVisual={<ZohoLeadMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Connect Zoho Once',
            body: 'Open Settings, Integrations and connect Zoho CRM. You approve one permission in Zoho: creating and updating leads.',
            icon: <Link2 className="w-6 h-6" />,
          },
          {
            number: '2',
            title: 'A Lead Comes In',
            body: 'Someone submits one of your Vyostra AI lead forms or a Meta lead ad. The lead lands in the Vyostra AI lead CRM first.',
            icon: <FileText className="w-6 h-6" />,
          },
          {
            number: '3',
            title: 'Zoho Gets the Lead',
            body: 'Vyostra AI creates the lead in Zoho with VyostraAI as its lead source, so your team can filter and assign it there.',
            icon: <Database className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <Keyboard className="w-5 h-5" />,
            title: 'No Copying Leads by Hand',
            body: 'Form and Meta lead ad leads reach Zoho without anyone exporting a spreadsheet or retyping a phone number.',
          },
          {
            icon: <ListChecks className="w-5 h-5" />,
            title: 'Fields Where They Belong',
            body: 'Email, phone and company are matched by field type or label, so they land in their own Zoho fields rather than in one block of text.',
          },
          {
            icon: <RotateCw className="w-5 h-5" />,
            title: 'Retries, Then a Record',
            body: 'Temporary Zoho errors are tried up to three times, and a lead Zoho turns down is marked Sync failed in its lead list.',
          },
        ]}
        integrations={[
          { icon: <Users className="w-4 h-4" />, title: 'Lead CRM', href: '/features/crm' },
          { icon: <FileText className="w-4 h-4" />, title: 'Form Builder', href: '/features/forms' },
          { icon: <Bot className="w-4 h-4" />, title: 'AI Agent', href: '/features/chatbot' },
        ]}
        faq={{ heading: 'What do people ask about the Zoho CRM integration?', items: ZOHO_CRM_FAQ }}
        ctaHeadline="Put your form and lead ad leads into Zoho"
        ctaBody="Start your free trial, build a lead form or connect Meta lead ads, then connect Zoho CRM from Settings."
      />
    </>
  )
}
