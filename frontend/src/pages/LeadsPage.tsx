import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Mail, Phone, TriangleAlert, Users } from 'lucide-react'
import { getLeadInbox, updateLeadState } from '../services/api'
import FilterBar from '../components/FilterBar/FilterBar'
import type { FilterChip } from '../components/FilterBar/FilterBar'
import { useToast } from '../components/Toast/Toast'
import Dropdown from '../components/Dropdown/Dropdown'
import { describeApiError } from '../lib/api-error'
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
  { value: 'chat', label: 'Agent' },
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

function PaginationButton({
  active,
  children,
  className = '',
  ...rest
}: { active?: boolean } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={`w-9 h-9 rounded-lg text-sm transition-colors ${
        active
          ? 'bg-violet-600 text-white'
          : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white'
      } ${className}`}
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

function ContactLines({ lead }: { lead: UnifiedLead }) {
  if (!lead.phone && !lead.email) return <span className="text-gray-300">No contact</span>
  return (
    <>
      {lead.phone && (
        <div className="flex items-center gap-1.5">
          <Phone size={12} className="text-gray-400 shrink-0" />
          <span className="truncate">{lead.phone}</span>
        </div>
      )}
      {lead.email && (
        <div className="flex items-center gap-1.5 mt-0.5">
          <Mail size={12} className="text-gray-400 shrink-0" />
          <span className="truncate">{lead.email}</span>
        </div>
      )}
    </>
  )
}

// Shared by the table row and the mobile card so the two layouts cannot drift
// apart -- the status control is the primary action on this screen and must
// behave identically in both.
function StatusSelect({
  lead,
  saving,
  onChange,
  className = '',
}: {
  lead: UnifiedLead
  saving: boolean
  onChange: (status: LeadStatus) => void
  className?: string
}) {
  const status = leadStatus(lead)
  return (
    <Dropdown<LeadStatus>
      value={status}
      disabled={saving}
      onChange={onChange}
      ariaLabel={`Status for ${lead.name ?? 'this lead'}`}
      variant="inline"
      // Keeps the status badge looking like a badge. Inheriting the form-field
      // chrome would turn a coloured pill in a table row into a white box.
      triggerClassName={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border cursor-pointer outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-violet-600 ${STATUS_BADGE_CLASSES[status]} ${className}`}
      options={STATUS_ORDER.map((option) => ({ value: option, label: STATUS_LABELS[option] }))}
    />
  )
}

function LeadAvatar({ name }: { name: string | undefined }) {
  return (
    <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
      {leadInitials(name)}
    </div>
  )
}

export default function LeadsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [leads, setLeads] = useState<UnifiedLead[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // A failed load must not look like an empty inbox. `res.data ?? []` alone
  // turns a 500 into a friendly "No leads yet", which is the worst possible
  // lie for this screen: the operator concludes nobody enquired and closes the
  // tab. The reload counter re-runs the effect for the Retry button.
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    // Guards against setState-after-unmount if the user navigates away
    // before this resolves — same pattern DashboardHome.tsx already uses.
    getLeadInbox()
      .then((res) => {
        if (cancelled) return
        if (res.success) setLeads(res.data?.leads ?? [])
        else
          setLoadError(
            describeApiError('leads/inbox', res.error, 'We couldn’t load your leads just now.')
          )
        setLoading(false)
      })
      .catch(() => {
        // apiClient throws when the request never completes at all (server
        // down, DNS, CORS). Without this the skeleton spins forever.
        if (cancelled) return
        setLoadError('Could not reach the server')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadCount])

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
      toast.show(describeApiError('leads/state', res.error, 'Couldn’t update this lead.'), 'error')
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
              : 'Every lead from your agents, forms and Meta Ads — most urgent first'}
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
          <Dropdown<SourceFilter>
            value={sourceFilter}
            onChange={setSourceFilter}
            ariaLabel="Filter by source"
            variant="inline"
            className="min-w-40"
            options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />

          <Dropdown<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter by status"
            variant="inline"
            className="min-w-40"
            options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />

          <Dropdown<DateRange>
            value={dateRange}
            onChange={setDateRange}
            ariaLabel="Filter by date"
            variant="inline"
            options={DATE_RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </FilterBar>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : loadError ? (
        <div className="py-16 flex flex-col items-center text-center">
          <TriangleAlert size={48} className="text-red-300 mb-4" />
          <p className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
            Couldn’t load your leads
          </p>
          <p className="text-sm text-gray-500 mt-2 max-w-md">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadCount((n) => n + 1)}
            className="mt-4 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <Users size={48} className="text-violet-300 mb-4" />
          <p className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
            {chips.length > 0 ? 'No leads match your filters' : 'No leads yet'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {chips.length > 0
              ? "Try adjusting or clearing your filters — there's nothing captured for this combination yet."
              : 'Leads from your agents, forms and Meta Ads will appear here'}
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
          {/* Cards below lg. A sideways-scrolling table is fine for a
              reference list, but this is a work queue: at 390px the Source,
              Next step and Status columns all sat off-screen, so the urgency
              ordering was invisible and the status control unreachable.
              The cutover is lg, not md: measured at exactly 768px the table
              renders but Status still clips off the right edge, so md would
              have swapped one unusable layout for another. */}
          <ul className="lg:hidden divide-y divide-gray-50">
            {paginatedLeads.map((lead) => {
              const urgency = leadUrgency(lead, now)
              return (
                <li
                  key={lead.leadId}
                  onClick={() => navigate(leadDetailPath(lead.leadRef))}
                  className="px-4 py-4 hover:bg-violet-50/20 cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <LeadAvatar name={lead.name} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {lead.name ?? 'Unnamed lead'}
                      </p>
                      <div className="text-sm text-gray-500 mt-1">
                        <ContactLines lead={lead} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-2.5">
                        <Badge className={SOURCE_BADGE_CLASSES[lead.source]}>
                          {SOURCE_LABELS[lead.source]}
                        </Badge>
                        <Badge className={URGENCY_CLASSES[urgency.tone]}>{urgency.label}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                    <StatusSelect
                      lead={lead}
                      saving={savingLeadId === lead.leadId}
                      onChange={(status) => handleStatusChange(lead, status)}
                      className="w-full"
                    />
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-4 xl:px-6 py-3.5 font-semibold w-[24%]">Name</th>
                  <th className="text-left px-4 xl:px-6 py-3.5 font-semibold w-[30%]">Contact</th>
                  <th className="text-left px-4 xl:px-6 py-3.5 font-semibold w-[14%]">Source</th>
                  <th className="text-left px-4 xl:px-6 py-3.5 font-semibold w-[16%]">Next step</th>
                  <th className="text-left px-4 xl:px-6 py-3.5 font-semibold w-[16%]">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeads.map((lead) => {
                  const urgency = leadUrgency(lead, now)
                  return (
                    <tr
                      key={lead.leadId}
                      onClick={() => navigate(leadDetailPath(lead.leadRef))}
                      className="border-b border-gray-50 hover:bg-violet-50/20 cursor-pointer transition-colors"
                    >
                      <td className="px-4 xl:px-6 py-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <LeadAvatar name={lead.name} />
                          <span className="font-semibold text-gray-900 text-sm truncate">
                            {lead.name ?? 'Unnamed lead'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 xl:px-6 py-4 text-sm text-gray-500 max-w-0">
                        <ContactLines lead={lead} />
                      </td>
                      <td className="px-4 xl:px-6 py-4">
                        <Badge className={SOURCE_BADGE_CLASSES[lead.source]}>
                          {SOURCE_LABELS[lead.source]}
                        </Badge>
                      </td>
                      <td className="px-4 xl:px-6 py-4">
                        <Badge className={URGENCY_CLASSES[urgency.tone]}>{urgency.label}</Badge>
                      </td>
                      <td className="px-4 xl:px-6 py-4" onClick={(e) => e.stopPropagation()}>
                        {/* w-full + min-w-0 so the select fills its fixed
                            column instead of forcing the table 6px wider than
                            its container, which clipped this control at lg. */}
                        <StatusSelect
                          lead={lead}
                          saving={savingLeadId === lead.leadId}
                          onChange={(status) => handleStatusChange(lead, status)}
                          className="w-full min-w-0"
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-3.5 border-t border-gray-50">
            <p className="text-sm text-gray-500">
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} leads
            </p>
            <div className="flex items-center gap-1">
              <PaginationButton onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft size={14} className="mx-auto" />
              </PaginationButton>
              {/* Numbered pages need room. Below sm they are replaced by a
                  plain "3 / 12" so prev/next stay thumb-sized. */}
              <span className="sm:hidden px-3 text-sm text-gray-500">
                {currentPage} / {totalPages}
              </span>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <PaginationButton
                  key={page}
                  active={page === currentPage}
                  onClick={() => setCurrentPage(page)}
                  className="hidden sm:block"
                >
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
