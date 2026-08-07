import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Mail, Phone, Users } from 'lucide-react'
import { getLeadInbox, updateLeadState } from '../services/api'
import FilterBar from '../components/FilterBar/FilterBar'
import type { FilterChip } from '../components/FilterBar/FilterBar'
import { useToast } from '../components/Toast/Toast'
import { exportInboxCsv } from '../lib/csv'
import { leadDetailPath } from '../lib/lead-ref'
import {
  leadInitials,
  leadStatus,
  leadUrgency,
  SOURCE_BADGE_CLASSES,
  SOURCE_LABELS,
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  STATUS_ORDER,
  URGENCY_CLASSES,
} from '../lib/lead-display'
import type { LeadSource, LeadStatus, UnifiedLead } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const PAGE_SIZE = 10
const DAY_MS = 24 * 60 * 60 * 1000

type DateRange = 'all' | '7d' | '30d' | '90d'
type SourceFilter = 'all' | LeadSource
type StatusFilter = 'all' | 'open' | LeadStatus

const DATE_RANGE_OPTIONS: { value: DateRange; label: string; days: number | null }[] = [
  { value: 'all', label: 'All time', days: null },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
]

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'chat', label: 'Chatbot' },
  { value: 'form', label: 'Form' },
  { value: 'meta', label: 'Meta Ads' },
]

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open leads' },
  { value: 'all', label: 'All statuses' },
  ...STATUS_ORDER.map((status) => ({ value: status as StatusFilter, label: STATUS_LABELS[status] })),
]

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/5 mt-4 overflow-hidden">
      <div className="p-4 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse grid grid-cols-6 gap-4">
            {[0, 1, 2, 3, 4, 5].map((j) => (
              <div key={j} className="h-4 bg-gray-100 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function PaginationButton({ active, children, ...rest }: { active?: boolean } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={`w-9 h-9 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-violet-600 text-white'
          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white'
      }`}
      {...rest}
    >
      {children}
    </button>
  )
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full border ${className}`}>
      {children}
    </span>
  )
}

function matchesStatus(lead: UnifiedLead, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  const status = leadStatus(lead)
  if (filter === 'open') return status !== 'closed'
  return status === filter
}

export default function LeadsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [leads, setLeads] = useState<UnifiedLead[]>([])
  const [loading, setLoading] = useState(true)
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    // Guards against setState-after-unmount if the user navigates away
    // before this resolves — same pattern DashboardHome.tsx already uses.
    getLeadInbox().then((res) => {
      if (cancelled) return
      setLeads(res.data ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const sourceParam = searchParams.get('source')
    if (sourceParam === 'chat' || sourceParam === 'form' || sourceParam === 'meta') {
      setSourceFilter(sourceParam)
    }
  }, [searchParams])

  useEffect(() => {
    setCurrentPage(1)
  }, [sourceFilter, statusFilter, searchQuery, dateRange])

  // Marking a lead contacted is the single most common action, and making
  // someone open a detail page to do it is why leads stop getting marked at
  // all. The row order is deliberately NOT recomputed here: re-sorting under
  // the cursor after a click moves the next row you were about to touch.
  async function handleStatusChange(lead: UnifiedLead, status: LeadStatus) {
    setSavingLeadId(lead.leadId)
    const res = await updateLeadState(lead.leadRef, { status })
    setSavingLeadId(null)

    if (!res.success || !res.data) {
      toast.show(res.error ?? 'Could not update this lead', 'error')
      return
    }
    const updated = res.data
    setLeads((prev) => prev.map((l) => (l.leadId === lead.leadId ? { ...l, state: updated } : l)))
  }

  const selectedDateRangeOption =
    DATE_RANGE_OPTIONS.find((option) => option.value === dateRange) ?? DATE_RANGE_OPTIONS[0]

  let filtered = leads
  if (sourceFilter !== 'all') {
    filtered = filtered.filter((l) => l.source === sourceFilter)
  }
  filtered = filtered.filter((l) => matchesStatus(l, statusFilter))
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(
      (l) =>
        (l.name ?? '').toLowerCase().includes(q) ||
        (l.email ?? '').toLowerCase().includes(q) ||
        (l.phone ?? '').toLowerCase().includes(q)
    )
  }
  if (selectedDateRangeOption.days !== null) {
    const cutoff = Date.now() - selectedDateRangeOption.days * DAY_MS
    filtered = filtered.filter((l) => new Date(l.createdAt).getTime() >= cutoff)
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedLeads = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const now = Date.now()
  const overdueCount = filtered.filter((l) => leadUrgency(l, now).tone === 'overdue').length

  const chips: FilterChip[] = []
  if (sourceFilter !== 'all') {
    chips.push({
      key: 'source',
      label: `Source: ${SOURCE_LABELS[sourceFilter]}`,
      onRemove: () => setSourceFilter('all'),
    })
  }
  if (statusFilter !== 'open') {
    const option = STATUS_OPTIONS.find((o) => o.value === statusFilter)
    chips.push({ key: 'status', label: option?.label ?? '', onRemove: () => setStatusFilter('open') })
  }
  if (searchQuery) {
    chips.push({ key: 'search', label: `Search: "${searchQuery}"`, onRemove: () => setSearchQuery('') })
  }
  if (dateRange !== 'all') {
    chips.push({
      key: 'dateRange',
      label: selectedDateRangeOption.label,
      onRemove: () => setDateRange('all'),
    })
  }

  function handleClearFilters() {
    setSourceFilter('all')
    setStatusFilter('open')
    setSearchQuery('')
    setDateRange('all')
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
            Leads
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {overdueCount > 0
              ? `${overdueCount} ${overdueCount === 1 ? 'lead needs' : 'leads need'} a follow-up today`
              : 'Every lead from your chatbots, forms and Meta Ads — most urgent first'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => exportInboxCsv('vyostra-leads.csv', filtered)}
          className="bg-white text-gray-700 font-medium px-4 py-2.5 rounded-xl text-sm border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-2"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="mt-6">
        <FilterBar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by name, email or phone..."
          chips={chips}
          onClearAll={handleClearFilters}
        >
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-white cursor-pointer min-w-40 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-white cursor-pointer min-w-40 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-white cursor-pointer outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
          >
            {DATE_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FilterBar>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <Users size={48} className="text-violet-300 mb-4" />
          <p className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
            {chips.length > 0 ? 'No leads match your filters' : 'No leads yet'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {chips.length > 0
              ? "Try adjusting or clearing your filters — there's nothing captured for this combination yet."
              : 'Leads from your chatbots, forms and Meta Ads will appear here'}
          </p>
          {chips.length > 0 && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-4 text-violet-600 text-sm font-medium hover:text-violet-700 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-6 py-3.5 font-semibold">Name</th>
                  <th className="text-left px-6 py-3.5 font-semibold">Contact</th>
                  <th className="text-left px-6 py-3.5 font-semibold">Source</th>
                  <th className="text-left px-6 py-3.5 font-semibold">Next step</th>
                  <th className="text-left px-6 py-3.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeads.map((lead) => {
                  const urgency = leadUrgency(lead, now)
                  const status = leadStatus(lead)
                  return (
                    <tr
                      key={lead.leadId}
                      onClick={() => navigate(leadDetailPath(lead.leadRef))}
                      className="border-b border-gray-50 hover:bg-violet-50/20 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                            {leadInitials(lead.name)}
                          </div>
                          <span className="font-semibold text-gray-900 text-sm">
                            {lead.name ?? 'Unnamed lead'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {lead.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone size={12} className="text-gray-400 shrink-0" />
                            {lead.phone}
                          </div>
                        )}
                        {lead.email && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Mail size={12} className="text-gray-400 shrink-0" />
                            {lead.email}
                          </div>
                        )}
                        {!lead.phone && !lead.email && <span className="text-gray-300">No contact</span>}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={SOURCE_BADGE_CLASSES[lead.source]}>
                          {SOURCE_LABELS[lead.source]}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={URGENCY_CLASSES[urgency.tone]}>{urgency.label}</Badge>
                      </td>
                      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={status}
                          disabled={savingLeadId === lead.leadId}
                          onChange={(e) => handleStatusChange(lead, e.target.value as LeadStatus)}
                          aria-label={`Status for ${lead.name ?? 'this lead'}`}
                          className={`text-xs font-medium px-2.5 py-1.5 rounded-full border cursor-pointer outline-none disabled:opacity-50 focus:ring-2 focus:ring-violet-100 ${STATUS_BADGE_CLASSES[status]}`}
                        >
                          {STATUS_ORDER.map((option) => (
                            <option key={option} value={option}>
                              {STATUS_LABELS[option]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-50">
            <p className="text-sm text-gray-500">
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} leads
            </p>
            <div className="flex items-center gap-1">
              <PaginationButton onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft size={14} className="mx-auto" />
              </PaginationButton>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <PaginationButton key={page} active={page === currentPage} onClick={() => setCurrentPage(page)}>
                  {page}
                </PaginationButton>
              ))}
              <PaginationButton
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight size={14} className="mx-auto" />
              </PaginationButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
