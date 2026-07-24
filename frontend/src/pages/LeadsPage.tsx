import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Mail, Phone, Users } from 'lucide-react'
import { getAllLeads, getMyBots } from '../services/api'
import FilterBar from '../components/FilterBar/FilterBar'
import type { FilterChip } from '../components/FilterBar/FilterBar'
import { exportLeadsCsv } from '../lib/csv'
import { formatRelativeDate } from '../lib/date'
import type { BotConfig, Lead } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const PAGE_SIZE = 10
const DAY_MS = 24 * 60 * 60 * 1000

type DateRange = 'all' | '7d' | '30d' | '90d'

const DATE_RANGE_OPTIONS: { value: DateRange; label: string; days: number | null }[] = [
  { value: 'all', label: 'All time', days: null },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
]

function getInitials(name: string | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/5 mt-4 overflow-hidden">
      <div className="p-4 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse grid grid-cols-5 gap-4">
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded" />
            <div className="h-4 bg-gray-100 rounded" />
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

export default function LeadsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [bots, setBots] = useState<BotConfig[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBotId, setSelectedBotId] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    // Guards against setState-after-unmount if the user navigates away
    // before this resolves — same pattern DashboardHome.tsx already uses.
    Promise.all([getAllLeads(), getMyBots()]).then(([leadsRes, botsRes]) => {
      if (cancelled) return
      setLeads(leadsRes.data ?? [])
      setBots(botsRes.data ?? [])
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const botIdParam = searchParams.get('botId')
    if (botIdParam) setSelectedBotId(botIdParam)
  }, [searchParams])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedBotId, searchQuery, dateRange])

  function getBotName(botId: string): string {
    return bots.find((b) => b.botId === botId)?.name ?? 'Unknown Bot'
  }

  const selectedDateRangeOption = DATE_RANGE_OPTIONS.find((option) => option.value === dateRange) ?? DATE_RANGE_OPTIONS[0]

  let filtered = leads
  if (selectedBotId !== 'all') {
    filtered = filtered.filter((l) => l.botId === selectedBotId)
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(
      (l) => (l.name ?? '').toLowerCase().includes(q) || (l.email ?? '').toLowerCase().includes(q)
    )
  }
  if (selectedDateRangeOption.days !== null) {
    const cutoff = Date.now() - selectedDateRangeOption.days * DAY_MS
    filtered = filtered.filter((l) => new Date(l.createdAt).getTime() >= cutoff)
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedLeads = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleExportCsv() {
    exportLeadsCsv('vyostra-leads.csv', filtered, getBotName)
  }

  const chips: FilterChip[] = []
  if (selectedBotId !== 'all') {
    chips.push({
      key: 'bot',
      label: `Chatbot: ${getBotName(selectedBotId)}`,
      onRemove: () => setSelectedBotId('all'),
    })
  }
  if (searchQuery) {
    chips.push({
      key: 'search',
      label: `Search: "${searchQuery}"`,
      onRemove: () => setSearchQuery(''),
    })
  }
  if (dateRange !== 'all') {
    chips.push({
      key: 'dateRange',
      label: selectedDateRangeOption.label,
      onRemove: () => setDateRange('all'),
    })
  }

  function handleClearFilters() {
    setSelectedBotId('all')
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
          <p className="text-sm text-gray-500 mt-1">All captured leads from your bots</p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
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
          searchPlaceholder="Search by name or email..."
          chips={chips}
          onClearAll={handleClearFilters}
        >
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-white cursor-pointer min-w-48 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
          >
            <option value="all">All Chatbots</option>
            {bots.map((bot) => (
              <option key={bot.botId} value={bot.botId}>
                {bot.name}
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
              : 'Leads captured by your chatbots will appear here'}
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
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="text-left px-6 py-3.5 font-semibold">Name</th>
                <th className="text-left px-6 py-3.5 font-semibold">Contact</th>
                <th className="text-left px-6 py-3.5 font-semibold">Bot</th>
                <th className="text-left px-6 py-3.5 font-semibold">Date</th>
                <th className="text-left px-6 py-3.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLeads.map((lead) => (
                <tr
                  key={lead.leadId}
                  onClick={() => navigate(`/dashboard/leads/${lead.leadId}?botId=${lead.botId}`)}
                  className="border-b border-gray-50 hover:bg-violet-50/20 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-xs font-bold text-violet-700 shrink-0">
                        {getInitials(lead.name)}
                      </div>
                      <span className="font-semibold text-gray-900 text-sm">{lead.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <Phone size={12} className="text-gray-400 shrink-0" />
                      {lead.phone}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Mail size={12} className="text-gray-400 shrink-0" />
                      {lead.email}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex bg-violet-50 text-violet-700 border border-violet-200 text-xs font-medium px-2.5 py-1 rounded-full">
                      {getBotName(lead.botId)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-400">{formatRelativeDate(new Date(lead.createdAt))}</td>
                  <td className="px-6 py-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/dashboard/leads/${lead.leadId}?botId=${lead.botId}`)
                      }}
                      className="text-gray-600 font-medium px-3 py-1.5 rounded-xl text-xs hover:bg-gray-100 transition-colors"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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
