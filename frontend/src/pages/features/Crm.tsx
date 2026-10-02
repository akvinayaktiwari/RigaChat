import PageMeta from '../../components/seo/PageMeta'
import StructuredData from '../../components/seo/StructuredData'
import { faqPageSchema, featurePageNodes, jsonLdGraph, type FaqItem } from '../../lib/structured-data'
import { Bot, Filter, RefreshCw, Database, MessageSquare, FileText } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

interface LeadRow {
  name: string
  source: string
  date: string
  status: 'New' | 'Contacted' | 'Qualified'
}

/**
 * Rendered on the page and published as FAQPage from this one array.
 *
 * Each answer matches the leads page as it is: its three filters and search
 * box, its four statuses, and the archive and erase actions on a lead.
 */
export const LEAD_CRM_FAQ: FaqItem[] = [
  {
    question: 'Which leads appear in the Vyostra AI lead CRM?',
    answer:
      'Every lead Vyostra AI captures: from your chat agents, your lead forms and your Meta lead ads. They arrive in one list, each with its conversation transcript or the answers the lead submitted.',
  },
  {
    question: 'What statuses can a lead have?',
    answer:
      'Four: New, Contacted, Qualified and Closed. You move a lead from one to the next as your team follows up, and you can add notes to it along the way.',
  },
  {
    question: 'How do I find a lead in the CRM?',
    answer:
      'Filter the list by source, by status and by date range, or search by name. The date ranges are the last 7, 30 or 90 days, or all time.',
  },
  {
    question: 'Does the lead CRM sync with other CRMs?',
    answer:
      'It syncs with Zoho CRM. You connect Zoho once from Settings, and every new lead from a lead form or a Meta lead ad is then sent to Zoho automatically. Leads from chat and voice conversations stay in the Vyostra AI CRM.',
  },
  {
    question: 'Can I remove a lead from the CRM?',
    answer:
      'Yes, in two ways. Archiving hides a lead from the list and can be undone. Erasing deletes the lead and its history permanently and cannot be undone.',
  },
]

const PAGE = { name: 'Lead CRM', path: '/features/crm/' }

const LEAD_ROWS: LeadRow[] = [
  { name: 'Rahul Sharma', source: 'Property Bot', date: 'Today', status: 'New' },
  { name: 'Priya Mehta', source: 'Agent', date: 'Yesterday', status: 'Contacted' },
  { name: 'Arjun Singh', source: 'Form', date: '2 days ago', status: 'Qualified' },
]

const STATUS_CLASSES: Record<LeadRow['status'], string> = {
  New: 'bg-emerald-50 text-emerald-700',
  Contacted: 'bg-blue-50 text-blue-700',
  Qualified: 'bg-purple-50 text-purple-700',
}

function CrmTableMockup() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant shadow-lg overflow-hidden max-w-sm w-full">
      <div className="bg-surface-container-low px-4 py-3 grid grid-cols-4 gap-2 text-[10px] font-bold text-on-surface-variant uppercase">
        <span>Name</span>
        <span>Bot</span>
        <span>Date</span>
        <span>Status</span>
      </div>
      {LEAD_ROWS.map((row) => (
        <div key={row.name} className="px-4 py-3 grid grid-cols-4 gap-2 items-center border-t border-outline-variant/20">
          <span className="text-xs font-semibold text-on-surface truncate">{row.name}</span>
          <span className="text-xs text-on-surface-variant truncate">{row.source}</span>
          <span className="text-xs text-on-surface-variant truncate">{row.date}</span>
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 w-fit ${STATUS_CLASSES[row.status]}`}>{row.status}</span>
        </div>
      ))}
      <div className="bg-surface-container-low/50 px-4 py-2 text-[10px] text-on-surface-variant">3 leads this week</div>
    </div>
  )
}

export default function Crm() {
  return (
    <>
      <PageMeta
        title="Built-in Lead CRM — Vyostra AI"
        description="Every lead captured, stored and organized automatically. Filter and track leads, and sync form and Meta lead ad leads to Zoho CRM."
        path="/features/crm/"
      />
      <StructuredData data={jsonLdGraph([...featurePageNodes(PAGE), faqPageSchema(LEAD_CRM_FAQ)])} />
      <UseCaseLayout
        featurePath="/features/crm"
        badge="LEAD CRM"
        headline="A built-in lead CRM for every enquiry"
        subheadline="The Vyostra AI lead CRM is the dashboard where every captured lead lands, from your chat agents, lead forms and Meta lead ads. Each lead keeps its transcript or form answers, a status and your notes, and new form and Meta lead ad leads can sync to Zoho CRM automatically."
        howItWorksHeading="How does the Vyostra AI lead CRM work?"
        benefitsHeading="Why keep leads in a built-in CRM?"
        heroVisual={<CrmTableMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Agent Captures the Lead',
            body: 'Every visitor who shares their contact details through your agent or form is automatically saved as a lead in your CRM dashboard.',
            icon: <Bot className="w-6 h-6" />,
          },
          {
            number: '2',
            title: 'Filter and Track',
            body: 'Filter leads by date, source, and status. Move each lead from New to Contacted, Qualified and Closed as your team follows up.',
            icon: <Filter className="w-6 h-6" />,
          },
          {
            number: '3',
            title: 'Sync to Zoho CRM',
            body: 'Connect Zoho CRM once. Every new lead from a form or a Meta lead ad is then created in Zoho as it arrives, so nobody types it in.',
            icon: <RefreshCw className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <Database className="w-5 h-5" />,
            title: 'Automatic Lead Storage',
            body: 'Every lead from every agent and form lands in your CRM automatically. No manual entry, no missed submissions, no spreadsheets.',
          },
          {
            icon: <Filter className="w-5 h-5" />,
            title: 'Powerful Filtering',
            body: 'Filter by date range, lead source, and status, or search by name. Find any lead in seconds across your entire pipeline.',
          },
          {
            icon: <RefreshCw className="w-5 h-5" />,
            title: 'Zoho CRM Integration',
            body: 'Connect Zoho CRM from Settings. Form and Meta lead ad leads arrive in Zoho with their name, email, phone and source page.',
          },
        ]}
        integrations={[
          { icon: <Bot className="w-4 h-4" />, title: 'AI Agent', href: '/features/chatbot' },
          { icon: <MessageSquare className="w-4 h-4" />, title: 'WhatsApp Alerts', href: '/features/whatsapp' },
          { icon: <FileText className="w-4 h-4" />, title: 'Form Builder', href: '/features/forms' },
        ]}
        faq={{ heading: 'What do people ask about the Vyostra AI lead CRM?', items: LEAD_CRM_FAQ }}
        ctaHeadline="See every lead in one place"
        ctaBody="Vyostra AI captures and organizes your leads automatically. Connect Zoho CRM in one click."
      />
    </>
  )
}
