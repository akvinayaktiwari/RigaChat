import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, CheckCircle, Plus, TrendingUp, Users } from 'lucide-react'
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

function isActiveBot(bot: BotConfig): boolean {
  return bot.status !== 'processing' && bot.status !== 'crawl_failed'
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm animate-pulse">
          <div className="h-12 w-12 bg-gray-100 rounded-xl mb-4" />
          <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-24 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-3 px-6 py-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse grid grid-cols-4 gap-4">
          <div className="h-4 bg-gray-100 rounded" />
          <div className="h-4 bg-gray-100 rounded" />
          <div className="h-4 bg-gray-100 rounded" />
          <div className="h-4 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

interface StatCardProps {
  icon: typeof Bot
  iconClasses: string
  iconWrapClasses: string
  value: number
  label: string
}

function StatCard({ icon: Icon, iconClasses, iconWrapClasses, value, label }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${iconWrapClasses}`}>
        <Icon className={`w-6 h-6 ${iconClasses}`} />
      </div>
      <p className="text-3xl font-extrabold text-gray-900 mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {value}
      </p>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
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
  const activeBots = bots.filter(isActiveBot)

  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_LEADS_COUNT)

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold text-gray-900"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {greeting}, {firstName} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1">Here&apos;s what&apos;s happening with your chatbots today</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard/bots/new')}
            className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Create New Bot
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard/leads')}
            className="bg-white text-gray-700 font-medium px-4 py-2.5 rounded-xl text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            View All Leads
          </button>
        </div>
      </div>

      {loading ? (
        <StatsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={Bot}
            iconWrapClasses="bg-linear-to-br from-violet-600 to-purple-500"
            iconClasses="text-white"
            value={bots.length}
            label="Total Bots"
          />
          <StatCard
            icon={CheckCircle}
            iconWrapClasses="bg-emerald-50"
            iconClasses="text-emerald-600"
            value={activeBots.length}
            label="Active Bots"
          />
          <StatCard
            icon={Users}
            iconWrapClasses="bg-blue-50"
            iconClasses="text-blue-600"
            value={leads.length}
            label="Total Leads"
          />
          <StatCard
            icon={TrendingUp}
            iconWrapClasses="bg-amber-50"
            iconClasses="text-amber-600"
            value={thisWeekLeads.length}
            label="Leads This Week"
          />
        </div>
      )}

      {!loading && bots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <Bot className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Welcome to VyostraAI
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs mb-6">
            Set up your first chatbot to start capturing leads from your website
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/bots/new')}
            className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Create Your First Bot
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3.5">
            <h2 className="font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Recent Leads
            </h2>
            <button
              type="button"
              onClick={() => navigate('/dashboard/leads')}
              className="text-violet-600 text-sm font-medium hover:text-violet-700 transition-colors"
            >
              View all &rarr;
            </button>
          </div>

          {loading ? (
            <TableSkeleton />
          ) : recentLeads.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">No leads yet</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="text-left px-6 py-3.5 font-semibold">Name</th>
                  <th className="text-left px-6 py-3.5 font-semibold">Email</th>
                  <th className="text-left px-6 py-3.5 font-semibold">Bot</th>
                  <th className="text-left px-6 py-3.5 font-semibold">Date</th>
                  {/* Real per-lead status tracking (Contacted/Converted) doesn't
                      exist in our data model yet — every captured lead is
                      honestly "New" until that's added as its own feature. */}
                  <th className="text-left px-6 py-3.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr
                    key={lead.leadId}
                    className="border-b border-gray-50 hover:bg-violet-50/20 cursor-pointer transition-colors duration-100"
                    onClick={() => navigate(`/dashboard/leads/${lead.leadId}?botId=${lead.botId}`)}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{lead.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{lead.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{botName(lead.botId)}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{formatRelativeDate(new Date(lead.createdAt))}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold px-2.5 py-1 rounded-full">
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
