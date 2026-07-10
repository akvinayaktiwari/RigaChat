import { Helmet } from 'react-helmet-async'
import { Bot, Filter, RefreshCw, Database, MessageSquare, FileText } from 'lucide-react'
import UseCaseLayout from '../../components/landing/UseCaseLayout'

interface LeadRow {
  name: string
  source: string
  date: string
  status: 'New' | 'Contacted' | 'Qualified'
}

const LEAD_ROWS: LeadRow[] = [
  { name: 'Rahul Sharma', source: 'Property Bot', date: 'Today', status: 'New' },
  { name: 'Priya Mehta', source: 'Chatbot', date: 'Yesterday', status: 'Contacted' },
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
      <Helmet>
        <title>Built-in Lead CRM — BeepBoop</title>
        <meta
          name="description"
          content="Every lead captured, stored, and organized automatically. Filter, track, and sync to Zoho CRM in real-time."
        />
      </Helmet>
      <UseCaseLayout
        badge="LEAD CRM"
        headline="Every lead, organized automatically"
        subheadline="BeepBoop stores every lead captured by your chatbots and forms in a built-in CRM dashboard. Filter, track status, and sync to Zoho CRM in one click."
        heroVisual={<CrmTableMockup />}
        howItWorksSteps={[
          {
            number: '1',
            title: 'Chatbot Captures the Lead',
            body: 'Every visitor who shares their contact details through your chatbot or form is automatically saved as a lead in your CRM dashboard.',
            icon: <Bot className="w-6 h-6" />,
          },
          {
            number: '2',
            title: 'Filter and Track',
            body: 'Filter leads by date, bot, source, and status. Update status from New to Contacted to Qualified as your team follows up.',
            icon: <Filter className="w-6 h-6" />,
          },
          {
            number: '3',
            title: 'Sync to Zoho CRM',
            body: 'Connect Zoho CRM once. Every new lead syncs automatically in real-time. Your sales team always has fresh, accurate data.',
            icon: <RefreshCw className="w-6 h-6" />,
          },
        ]}
        benefits={[
          {
            icon: <Database className="w-5 h-5" />,
            title: 'Automatic Lead Storage',
            body: 'Every lead from every chatbot and form lands in your CRM automatically. No manual entry, no missed submissions, no spreadsheets.',
          },
          {
            icon: <Filter className="w-5 h-5" />,
            title: 'Powerful Filtering',
            body: 'Filter by bot name, date range, lead source, and status. Find any lead in seconds across your entire pipeline.',
          },
          {
            icon: <RefreshCw className="w-5 h-5" />,
            title: 'Zoho CRM Integration',
            body: 'One-click Zoho CRM connection. Leads sync in real-time with full field mapping — name, phone, email, source, and bot name.',
          },
        ]}
        integrations={[
          { icon: <Bot className="w-4 h-4" />, title: 'AI Chatbot', href: '/features/chatbot' },
          { icon: <MessageSquare className="w-4 h-4" />, title: 'WhatsApp Alerts', href: '/features/whatsapp' },
          { icon: <FileText className="w-4 h-4" />, title: 'Form Builder', href: '/features/forms' },
        ]}
        ctaHeadline="See every lead in one place"
        ctaBody="BeepBoop captures and organizes your leads automatically. Connect Zoho CRM in one click."
      />
    </>
  )
}
