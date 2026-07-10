import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ClipboardList, X, XCircle } from 'lucide-react'
import { getFormById, getFormLeads, getIntegrationStatus } from '../services/api'
import type { FormConfig, FormLead } from '../types/index'

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return minutes <= 0 ? 'just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getFields(lead: FormLead): Record<string, string> {
  return typeof lead.customFields === 'string' ? {} : lead.customFields
}

function SyncBadge({ lead }: { lead: FormLead }) {
  if (lead.crmSynced === true) {
    return (
      <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full flex items-center gap-1 w-fit">
        <CheckCircle2 size={12} />
        Synced
      </span>
    )
  }

  if (lead.crmSynced === false && lead.crmSyncError) {
    return (
      <span
        className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full flex items-center gap-1 w-fit"
        title={lead.crmSyncError}
      >
        <XCircle size={12} />
        Sync failed
      </span>
    )
  }

  return <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded-full w-fit">Not synced</span>
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mt-4 overflow-hidden">
      <div className="p-4 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse grid grid-cols-4 gap-4">
            <div className="h-4 bg-slate-100 rounded" />
            <div className="h-4 bg-slate-100 rounded" />
            <div className="h-4 bg-slate-100 rounded" />
            <div className="h-4 bg-slate-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function FormLeadsPage() {
  const { formId } = useParams<{ formId: string }>()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormConfig | null>(null)
  const [leads, setLeads] = useState<FormLead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<FormLead | null>(null)
  const [crmConnected, setCrmConnected] = useState(false)

  useEffect(() => {
    if (!formId) {
      setLoading(false)
      return
    }
    Promise.all([getFormById(formId), getFormLeads(formId), getIntegrationStatus()]).then(
      ([formRes, leadsRes, crmRes]) => {
        if (formRes.success && formRes.data) setForm(formRes.data)
        setLeads(leadsRes.data ?? [])
        setCrmConnected(Boolean(crmRes.success && crmRes.data?.connected))
        setLoading(false)
      }
    )
  }, [formId])

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeekCount = leads.filter((l) => new Date(l.createdAt) >= weekAgo).length

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayCount = leads.filter((l) => new Date(l.createdAt) >= today).length

  const fields = form?.fields ?? []

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/dashboard/forms')}
        className="flex items-center gap-1 text-slate-500 text-sm hover:text-slate-700 transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Form Leads</h1>
          <p className="text-slate-500 text-sm">{form?.name ?? '—'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <div className="bg-white border border-slate-100 rounded-xl px-4 py-2 text-sm">
          <span className="text-slate-500">Total: </span>
          <span className="font-bold text-indigo-600">{leads.length}</span>
          <span className="text-slate-500"> leads</span>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl px-4 py-2 text-sm">
          <span className="text-slate-500">This week: </span>
          <span className="font-bold text-indigo-600">{thisWeekCount}</span>
          <span className="text-slate-500"> leads</span>
        </div>
        <div className="bg-white border border-slate-100 rounded-xl px-4 py-2 text-sm">
          <span className="text-slate-500">Today: </span>
          <span className="font-bold text-indigo-600">{todayCount}</span>
          <span className="text-slate-500"> leads</span>
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : leads.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <ClipboardList size={48} className="text-slate-300 mb-4" />
          <p className="text-slate-800 font-medium">No leads captured yet</p>
          <p className="text-slate-500 text-sm mt-1">Share your form embed code to start capturing leads</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mt-4 overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                {fields.map((field) => (
                  <th key={field.fieldId} className="text-left px-4 py-3 font-medium whitespace-nowrap">
                    {field.label}
                  </th>
                ))}
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Date</th>
                {crmConnected && (
                  <th className="text-left px-4 py-3 font-medium whitespace-nowrap bg-slate-50">CRM Sync</th>
                )}
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const values = getFields(lead)
                return (
                  <tr key={lead.leadId} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    {fields.map((field) => (
                      <td key={field.fieldId} className="px-4 py-3 text-slate-700 text-sm whitespace-nowrap">
                        {field.fieldId ? (values[field.fieldId] ?? '-') : '-'}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-slate-400 text-sm whitespace-nowrap">
                      {formatRelativeDate(new Date(lead.createdAt))}
                    </td>
                    {crmConnected && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SyncBadge lead={lead} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedLead(lead)}
                        className="text-indigo-600 text-sm hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedLead && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              type="button"
              onClick={() => setSelectedLead(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg font-bold text-slate-800">
              {Object.values(getFields(selectedLead))[0] ?? 'Lead Detail'}
            </h2>

            <div className="mt-4 space-y-3">
              {fields.map((field) => (
                <div key={field.fieldId} className="flex items-start justify-between gap-4">
                  <span className="text-sm text-slate-500 shrink-0">{field.label}</span>
                  <span className="text-sm font-medium text-slate-800 text-right">
                    {field.fieldId ? (getFields(selectedLead)[field.fieldId] ?? '-') : '-'}
                  </span>
                </div>
              ))}
              <div className="h-px bg-slate-100" />
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-slate-500 shrink-0">Source URL</span>
                <span className="text-sm font-medium text-slate-800 text-right break-all">
                  {selectedLead.sourceUrl || '-'}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="text-sm text-slate-500 shrink-0">Captured</span>
                <span className="text-sm font-medium text-slate-800 text-right">
                  {new Date(selectedLead.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
