import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Mail, Phone, Search, Users } from 'lucide-react'
import { getAllLeads, getMyBots } from '../services/api'
import type { BotConfig, Lead } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const PAGE_SIZE = 10

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
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
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    Promise.all([getAllLeads(), getMyBots()]).then(([leadsRes, botsRes]) => {
      setLeads(leadsRes.data ?? [])
      setBots(botsRes.data ?? [])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const botIdParam = searchParams.get('botId')
    if (botIdParam) setSelectedBotId(botIdParam)
  }, [searchParams])

  useEffect(() => {
    setCurrentPage(1)
  }, [selectedBotId, searchQuery])

  function getBotName(botId: string): string {
    return bots.find((b) => b.botId === botId)?.name ?? 'Unknown Bot'
  }

  let filtered = leads
  if (selectedBotId !== 'all') {
    filtered = filtered.filter((l) => l.botId === selectedBotId)
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    filtered = filtered.filter(
      (l) => l.name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
    )
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginatedLeads = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleExportCsv() {
    const headers = ['Name', 'Email', 'Phone', 'Bot', 'Date', 'Status']
    const rows = filtered.map((lead) =>
      [
        lead.name,
        lead.email,
        lead.phone,
        getBotName(lead.botId),
        new Date(lead.createdAt).toLocaleDateString(),
        'New',
      ]
        .map(csvEscape)
        .join(',')
    )
    const csv = [headers.join(','), ...rows].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vyostra-leads.csv'
    a.click()
    URL.revokeObjectURL(url)
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

      <div className="bg-white rounded-2xl border border-black/5 p-4 mt-6 shadow-sm flex gap-3 items-center flex-wrap">
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

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm w-64 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
          />
        </div>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <Users size={48} className="text-violet-300 mb-4" />
          <p className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
            No leads yet
          </p>
          <p className="text-sm text-gray-500 mt-2">Leads captured by your chatbots will appear here</p>
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
