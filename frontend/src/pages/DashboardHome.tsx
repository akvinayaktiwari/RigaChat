import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Bot, CheckCircle, Download, Plus, TrendingUp, Users } from 'lucide-react'
import { getAllLeads, getMyBots } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import Sparkline from '../components/charts/Sparkline'
import TrendChart from '../components/charts/TrendChart'
import { exportLeadsCsv } from '../lib/csv'
import { formatRelativeDate } from '../lib/date'
import type { BotConfig, BotStatus, Lead } from '../types/index'

const RECENT_LEADS_COUNT = 5
const GLANCE_BOTS_COUNT = 5
const WEEK_OVER_WEEK_DAYS = 7
const SPARKLINE_WINDOW_DAYS = 14
const TREND_CHART_WINDOW_DAYS = 30

// Reuses the same honest status -> label/color mapping already established in
// BotsPage.tsx / BotDetailPage.tsx, rather than inventing new label names —
// these are the real BotStatus values, nothing is renamed for this panel.
const STATUS_BADGES: Record<BotStatus, { label: string; classes: string }> = {
  active: { label: 'Active', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  processing: { label: 'Processing', classes: 'bg-violet-50 text-violet-700 border-violet-200' },
  crawl_failed: { label: 'Failed', classes: 'bg-red-50 text-red-700 border-red-200' },
  kb_only: { label: 'KB Only', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
}

function getStatusBadge(status?: BotStatus): { label: string; classes: string } {
  return STATUS_BADGES[status ?? 'active']
}

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  if (hour >= 17 && hour < 22) return 'Good evening'
  return 'Good night'
}

function isActiveBot(bot: BotConfig): boolean {
  return bot.status !== 'processing' && bot.status !== 'crawl_failed'
}

interface DailyBucket {
  date: string
  count: number
}

// toISOString() converts to UTC before formatting, so calling it on a
// local-midnight Date silently rolls the date back a day for anyone in a
// timezone ahead of UTC (IST included — this product's stated target market
// is Indian SMBs, so this isn't a theoretical edge case). Build the key from
// local Y/M/D components directly instead.
function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Real day-by-day lead counts for the last `days` calendar days (today inclusive), oldest first. Days with no leads are honestly 0, never omitted or fabricated. */
function bucketLeadsByDay(leads: Lead[], days: number): DailyBucket[] {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const buckets: DailyBucket[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(startOfToday)
    day.setDate(day.getDate() - i)
    buckets.push({ date: localDateKey(day), count: 0 })
  }

  const indexByDate = new Map(buckets.map((bucket, index) => [bucket.date, index]))
  for (const lead of leads) {
    const leadDate = new Date(lead.createdAt)
    // A single lead with a malformed createdAt would otherwise throw a
    // RangeError out of toISOString() below and crash the whole page —
    // there's no ErrorBoundary in this app to contain that. Skip it instead;
    // it just won't be counted in the trend, same as it wouldn't match any
    // date-based filter elsewhere in the app.
    if (Number.isNaN(leadDate.getTime())) continue
    const key = localDateKey(leadDate)
    const index = indexByDate.get(key)
    if (index !== undefined) {
      buckets[index].count += 1
    } else if (buckets.length > 0 && key > buckets[buckets.length - 1].date) {
      // A createdAt dated after "today" (client/server clock drift, not an
      // attack) would otherwise be dropped here but still counted in
      // leads.length elsewhere — quietly under-counting this window's total
      // relative to the real total. Clamp into today's bucket instead so the
      // cumulative sparkline never drifts from the real leads.length.
      buckets[buckets.length - 1].count += 1
    }
  }

  return buckets
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

function SidePanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
      <div className="h-5 w-32 bg-gray-100 rounded mb-4 animate-pulse" />
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-9 bg-gray-50 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// Mirrors the real loaded-state 8/4 grid shape (chart + table left, bots +
// quick actions right) so the layout doesn't jump once data arrives.
function DashboardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-6">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 w-28 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-16 bg-gray-50 rounded animate-pulse" />
          </div>
          <div className="h-40 bg-gray-50 rounded-xl animate-pulse" />
        </div>

        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3.5">
            <h2 className="font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Recent Leads
            </h2>
          </div>
          <TableSkeleton />
        </div>
      </div>

      <div className="lg:col-span-4 space-y-6">
        <SidePanelSkeleton rows={4} />
        <SidePanelSkeleton rows={3} />
      </div>
    </div>
  )
}

interface TrendChipProps {
  /** Percentage change, or null when there's no honest baseline to compare against (never a fabricated placeholder). */
  changePct: number | null
}

function TrendChip({ changePct }: TrendChipProps) {
  if (changePct === null) return null
  const rounded = Math.round(changePct)
  // Check the sign on the un-rounded value, not `rounded >= 0` — a small
  // real decline like -0.3% rounds to -0, and `-0 >= 0` is true in JS, so
  // that check alone would render a decline as a green "up" chip.
  const positive = changePct >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
        positive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
      }`}
    >
      {positive ? '↑' : '↓'}
      {Math.abs(rounded)}%
    </span>
  )
}

interface StatCardProps {
  icon: typeof Bot
  iconClasses: string
  iconWrapClasses: string
  value: number
  label: string
  sparklineData?: number[]
  sparklineColor?: string
  trendChangePct?: number | null
}

function StatCard({
  icon: Icon,
  iconClasses,
  iconWrapClasses,
  value,
  label,
  sparklineData,
  sparklineColor,
  trendChangePct,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-black/5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconWrapClasses}`}>
          <Icon className={`w-6 h-6 ${iconClasses}`} />
        </div>
        {trendChangePct !== undefined && <TrendChip changePct={trendChangePct} />}
      </div>
      <p className="text-3xl font-extrabold text-gray-900 mb-1" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {value}
      </p>
      <p className="text-sm text-gray-500 font-medium">{label}</p>
      {sparklineData && sparklineColor && (
        <div className="mt-3">
          <Sparkline data={sparklineData} color={sparklineColor} />
        </div>
      )}
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

  // `||` not `??`: an empty-string user.name (not just a missing one) must
  // also fall through to email, or firstName below resolves to '' and the
  // greeting reads "Good morning, 👋" with no name.
  const rawName = user?.name || user?.email || 'there'
  // user.name can fall back to the email local-part (no spaces) when Cognito's
  // name claim is unset, so split(' ')[0] alone returned the whole string.
  const firstNamePart = rawName.split(' ')[0].split('@')[0]
  const firstName = firstNamePart.charAt(0).toUpperCase() + firstNamePart.slice(1)
  const greeting = getGreeting(new Date().getHours())

  function botName(botId: string): string {
    return bots.find((bot) => bot.botId === botId)?.name ?? 'Unknown'
  }

  const activeBots = bots.filter(isActiveBot)

  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_LEADS_COUNT)

  const glanceBots = bots.slice(0, GLANCE_BOTS_COUNT)

  // Real daily buckets — no fabricated data. Used to draw the sparklines and
  // the "leads over time" chart, and to derive the two trend chips below.
  const dailyBuckets14 = bucketLeadsByDay(leads, SPARKLINE_WINDOW_DAYS)
  const dailyBuckets30 = bucketLeadsByDay(leads, TREND_CHART_WINDOW_DAYS)

  // "This week" is defined ONCE, from the same calendar-day buckets that
  // draw the sparkline below — not from a separate `now - 7*24h` rolling
  // window. Two different definitions of "this week" (rolling vs.
  // calendar-day) would only agree when `now` is exactly local midnight;
  // any other time of day, the stat card's number and its own sparkline
  // could silently disagree on whether a lead near the boundary counts.
  const thisWeekBuckets = dailyBuckets14.slice(SPARKLINE_WINDOW_DAYS - WEEK_OVER_WEEK_DAYS)
  const previousWeekBuckets = dailyBuckets14.slice(0, SPARKLINE_WINDOW_DAYS - WEEK_OVER_WEEK_DAYS)
  const thisWeekCount = thisWeekBuckets.reduce((sum, bucket) => sum + bucket.count, 0)
  const previousWeekCount = previousWeekBuckets.reduce((sum, bucket) => sum + bucket.count, 0)

  // "Leads This Week" trend: this week's count vs. the previous 7-day window.
  // Left null (no chip rendered) when there's no prior week to compare
  // against — a % change against zero would be meaningless, not honest.
  const weekOverWeekChangePct = previousWeekCount > 0 ? ((thisWeekCount - previousWeekCount) / previousWeekCount) * 100 : null

  // "Total Leads" trend: how much this week's new leads grew the existing
  // total. Also left null when there's no pre-existing base to grow from.
  const leadsBeforeThisWeek = leads.length - thisWeekCount
  const totalGrowthPct = leadsBeforeThisWeek > 0 ? (thisWeekCount / leadsBeforeThisWeek) * 100 : null

  // Cumulative running total across the 14-day sparkline window, seeded from
  // the real count of leads that already existed before the window started.
  const cumulativeBaseline = leads.length - dailyBuckets14.reduce((sum, bucket) => sum + bucket.count, 0)
  const totalLeadsSparkline = (() => {
    let running = cumulativeBaseline
    return dailyBuckets14.map((bucket) => {
      running += bucket.count
      return running
    })
  })()
  const thisWeekSparkline = thisWeekBuckets.map((bucket) => bucket.count)

  function handleExportLeadsCsv() {
    exportLeadsCsv('vyostra-leads.csv', leads, botName)
  }

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
            // No historical/time-series data exists for bot counts (unlike
            // leads, which carry real createdAt timestamps) — omitted rather
            // than faked, same ethos as the lead-status comment below.
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
            sparklineData={totalLeadsSparkline}
            sparklineColor="#2563eb"
            trendChangePct={totalGrowthPct}
          />
          <StatCard
            icon={TrendingUp}
            iconWrapClasses="bg-amber-50"
            iconClasses="text-amber-600"
            value={thisWeekCount}
            label="Leads This Week"
            sparklineData={thisWeekSparkline}
            sparklineColor="#d97706"
            trendChangePct={weekOverWeekChangePct}
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
      ) : loading ? (
        <DashboardGridSkeleton />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  Leads over time
                </h2>
                <span className="text-xs text-gray-400">Last {TREND_CHART_WINDOW_DAYS} days</span>
              </div>
              <TrendChart data={dailyBuckets30.map((bucket) => ({ date: bucket.date, value: bucket.count }))} />
            </div>

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

              {recentLeads.length === 0 ? (
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
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Bots at a glance
              </h2>
              {glanceBots.length === 0 ? (
                <p className="text-sm text-gray-500">No bots yet</p>
              ) : (
                <ul className="space-y-1">
                  {glanceBots.map((bot) => {
                    const badge = getStatusBadge(bot.status)
                    return (
                      <li key={bot.botId}>
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/bots/${bot.botId}`)}
                          className="w-full flex items-center justify-between gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className="text-sm font-medium text-gray-900 truncate">{bot.name}</span>
                          <span className={`shrink-0 inline-flex text-xs font-semibold px-2.5 py-1 rounded-full border ${badge.classes}`}>
                            {badge.label}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Quick actions
              </h2>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/bots/new')}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-violet-600" />
                    Create new bot
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/bots')}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-violet-600" />
                    View all bots
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </button>
                <button
                  type="button"
                  onClick={handleExportLeadsCsv}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Download className="w-4 h-4 text-violet-600" />
                    Export leads (CSV)
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
