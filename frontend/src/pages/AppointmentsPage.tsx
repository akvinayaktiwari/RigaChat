import { useEffect, useState } from 'react'
import { Calendar } from 'lucide-react'
import { getAppointmentRequests, getMyBots } from '../services/api'
import { formatRelativeDate } from '../lib/date'
import type { AppointmentRequest, BotConfig } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const STATUS_LABELS: Record<AppointmentRequest['status'], string> = {
  requested: 'Requested',
  confirmed: 'Confirmed',
  failed: 'Failed',
}

const STATUS_BADGES: Record<AppointmentRequest['status'], string> = {
  requested: 'bg-gray-100 text-gray-600 border-gray-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
}

function TableSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-black/5 mt-6 overflow-hidden">
      <div className="p-4 space-y-4">
        {[0, 1, 2].map((i) => (
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

// One AppointmentRequest with the bot it came from attached, since the
// backend route is per-botId (appointment_requests is keyed by botId, not
// clientId -- no cross-bot GSI exists, unlike leads' getAllLeads()) and this
// page fans out client-side across the caller's bots instead.
interface AppointmentWithBot extends AppointmentRequest {
  botName: string
}

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<AppointmentWithBot[]>([])
  const [bots, setBots] = useState<BotConfig[]>([])
  const [selectedBotId, setSelectedBotId] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    getMyBots().then(async (botsRes) => {
      const myBots = botsRes.data ?? []
      if (cancelled) return
      setBots(myBots)

      const perBot = await Promise.all(
        myBots.map(async (bot) => {
          const res = await getAppointmentRequests(bot.botId)
          return (res.data ?? []).map((req) => ({ ...req, botName: bot.name }))
        })
      )
      if (cancelled) return

      setAppointments(perBot.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const filtered =
    selectedBotId === 'all' ? appointments : appointments.filter((a) => a.botId === selectedBotId)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
            Appointment Requests
          </h1>
          <p className="text-sm text-gray-500 mt-1">Site visits and appointments your agents have booked</p>
        </div>

        {bots.length > 1 && (
          <select
            value={selectedBotId}
            onChange={(e) => setSelectedBotId(e.target.value)}
            className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="all">All agents</option>
            {bots.map((bot) => (
              <option key={bot.botId} value={bot.botId}>
                {bot.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <Calendar className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            No appointment requests yet
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs">
            When a lead books through an agent, their request shows up here
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 mt-6 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Requested for</th>
                <th className="px-5 py-3 font-medium">Agent</th>
                <th className="px-5 py-3 font-medium">Lead</th>
                <th className="px-5 py-3 font-medium">Notes</th>
                <th className="px-5 py-3 font-medium">Requested</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((req) => (
                <tr key={req.requestId} className="border-b border-gray-50 last:border-0">
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex border text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGES[req.status]}`}
                    >
                      {STATUS_LABELS[req.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-900 font-medium">
                    {new Date(req.requestedAt).toLocaleString()}
                  </td>
                  <td className="px-5 py-4 text-gray-600">{req.botName}</td>
                  <td className="px-5 py-4 text-gray-600">{req.leadId}</td>
                  <td className="px-5 py-4 text-gray-500">{req.notes ?? '—'}</td>
                  <td className="px-5 py-4 text-gray-500">{formatRelativeDate(new Date(req.createdAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
