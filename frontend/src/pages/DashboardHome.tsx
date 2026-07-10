import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, TrendingUp, Users } from 'lucide-react'
import { getAllLeads, getMyBots } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import type { BotConfig, Lead } from '../types/index'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const RECENT_LEADS_COUNT = 5

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 22) return 'Good evening'
  return 'Good night'
}

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

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 animate-pulse">
          <div className="h-8 w-16 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-24 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse grid grid-cols-4 gap-4">
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
          <div className="h-4 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

export default function DashboardHome() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [bots, setBots] = useState<BotConfig[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [botsRes, leadsRes] = await Promise.all([getMyBots(), getAllLeads()])
      if (cancelled) return
      setBots(botsRes.data ?? [])
      setLeads(leadsRes.data ?? [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const rawName = user?.name ?? user?.email ?? 'there'
  // user.name can fall back to the email local-part (no spaces) when Cognito's
  // name claim is unset, so split(' ')[0] alone returned the whole string.
  const firstNamePart = rawName.split(' ')[0].split('@')[0]
  const firstName = firstNamePart.charAt(0).toUpperCase() + firstNamePart.slice(1)
  const greeting = getGreeting(new Date().getHours())

  function botName(botId: string): string {
    return bots.find((bot) => bot.botId === botId)?.name ?? 'Unknown'
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeekLeads = leads.filter((lead) => new Date(lead.createdAt) >= weekAgo)

  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_LEADS_COUNT)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {greeting}, {firstName}
        </h1>
        <p className="text-slate-500 mt-1">Here&apos;s what&apos;s happening with your chatbots today</p>
      </div>

      {loading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-indigo-100 rounded-2xl p-3">
              <Bot className="text-indigo-600" size={24} />
            </div>
            <div>
              <p className="text-3xl font-bold text-indigo-600">{bots.length}</p>
              <p className="text-sm text-slate-500">Active Chatbots</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-emerald-100 rounded-2xl p-3">
              <Users className="text-emerald-600" size={24} />
            </div>
            <div>
              <p className="text-3xl font-bold text-emerald-600">{leads.length}</p>
              <p className="text-sm text-slate-500">Total Leads</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="bg-purple-100 rounded-2xl p-3">
              <TrendingUp className="text-purple-600" size={24} />
            </div>
            <div>
              <p className="text-3xl font-bold text-purple-600">{thisWeekLeads.length}</p>
              <p className="text-sm text-slate-500">Leads This Week</p>
            </div>
          </div>
        </div>
      )}

      {!loading && bots.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <Bot className="text-indigo-300 mx-auto mb-4" size={64} />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Welcome to BeepBoop</h2>
          <p className="text-slate-500 mb-6 text-center max-w-md">
            Set up your first chatbot to start capturing leads from your website
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/bots/new')}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
          >
            Create Your First Bot
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg text-slate-800">Recent Leads</h2>
            <button
              type="button"
              onClick={() => navigate('/dashboard/leads')}
              className="text-indigo-600 text-sm hover:text-indigo-700 transition-colors"
            >
              View all &rarr;
            </button>
          </div>

          {loading ? (
            <TableSkeleton />
          ) : recentLeads.length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">No leads yet</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Email</th>
                  <th className="text-left px-3 py-2 font-medium">Bot</th>
                  <th className="text-left px-3 py-2 font-medium">Date</th>
                  {/* Real per-lead status tracking (Contacted/Converted) doesn't
                      exist in our data model yet — every captured lead is
                      honestly "New" until that's added as its own feature. */}
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr
                    key={lead.leadId}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/dashboard/leads/${lead.leadId}?botId=${lead.botId}`)}
                  >
                    <td className="px-3 py-3 font-medium text-slate-900">{lead.name}</td>
                    <td className="px-3 py-3 text-slate-500 text-sm">{lead.email}</td>
                    <td className="px-3 py-3 text-slate-600 text-sm">{botName(lead.botId)}</td>
                    <td className="px-3 py-3 text-slate-400 text-sm">
                      {formatRelativeDate(new Date(lead.createdAt))}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                        New
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
