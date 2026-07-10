import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Search, Users } from 'lucide-react'
import { getAllLeads, getMyBots } from '../services/api'
import type { BotConfig, Lead } from '../types/index'

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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mt-4 overflow-hidden">
      <div className="p-4 space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse grid grid-cols-5 gap-4">
            <div className="h-4 bg-slate-100 rounded" />
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

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeekCount = leads.filter((l) => new Date(l.createdAt) >= weekAgo).length

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayCount = leads.filter((l) => new Date(l.createdAt) >= today).length

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
    a.download = 'beepboop-leads.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-slate-800">Leads</h1>
        <button
          type="button"
          onClick={handleExportCsv}
          className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-slate-50 transition-colors"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <select
          value={selectedBotId}
          onChange={(e) => setSelectedBotId(e.target.value)}
          className="border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-600 bg-white cursor-pointer"
        >
          <option value="all">All Chatbots</option>
          {bots.map((bot) => (
            <option key={bot.botId} value={bot.botId}>
              {bot.name}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="border border-slate-200 rounded-xl px-4 py-2 pl-9 text-sm w-64 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
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
      ) : filtered.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <Users size={48} className="text-slate-300 mb-4" />
          <p className="text-slate-800 font-medium">No leads yet</p>
          <p className="text-slate-500 text-sm mt-1">Leads captured by your chatbots will appear here</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mt-4 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-4 py-3 font-medium">Contact</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Bot</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLeads.map((lead) => (
                <tr
                  key={lead.leadId}
                  onClick={() => navigate(`/dashboard/leads/${lead.leadId}?botId=${lead.botId}`)}
                  className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                        {getInitials(lead.name)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{lead.name}</p>
                        <p className="text-xs text-slate-500">{lead.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 text-sm">{lead.phone}</td>
                  <td className="px-4 py-3">
                    <span className="bg-indigo-50 text-indigo-600 text-xs px-2 py-1 rounded-full">
                      {getBotName(lead.botId)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">
                    {formatRelativeDate(new Date(lead.createdAt))}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      New
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/dashboard/leads/${lead.leadId}?botId=${lead.botId}`)
                      }}
                      className="text-indigo-600 text-sm hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-500">
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} leads
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
