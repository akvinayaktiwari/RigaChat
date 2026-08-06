import { useEffect, useState } from 'react'
import { AlertTriangle, Mail } from 'lucide-react'
import { useStaffAuth } from '../../hooks/useStaffAuth'
import { getContactMessages } from '../../services/adminApi'
import type { AdminContactMessage } from '../../services/adminApi'
import { Spinner } from '../../components/Spinner/Spinner'
import { StaffConsoleShell } from '../../components/StaffConsoleShell/StaffConsoleShell'

function NotifiedBadge({ notified }: { notified: boolean }) {
  if (notified) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        Emailed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <AlertTriangle size={11} />
      Not emailed
    </span>
  )
}

export default function AdminContactMessagesPage() {
  const { token } = useStaffAuth()
  const [messages, setMessages] = useState<AdminContactMessage[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Defaults to the un-notified view: a message that was emailed has already
  // reached a human inbox, so the rows worth opening this page for are the
  // ones that did not.
  const [unnotifiedOnly, setUnnotifiedOnly] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await getContactMessages(token as string, unnotifiedOnly)
        if (cancelled) return
        if (!res.success || !res.data) {
          setError(res.error ?? 'Failed to load contact messages')
          return
        }
        setMessages(res.data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load contact messages')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token, unnotifiedOnly])

  return (
    <StaffConsoleShell
      title="Contact messages"
      subtitle="Submissions from the marketing site's Get in touch form"
    >
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setUnnotifiedOnly(true)}
          className={
            unnotifiedOnly
              ? 'px-3 py-1.5 rounded-xl text-sm font-semibold bg-violet-50 text-violet-700 border border-violet-200'
              : 'px-3 py-1.5 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors'
          }
        >
          Needs attention
        </button>
        <button
          type="button"
          onClick={() => setUnnotifiedOnly(false)}
          className={
            !unnotifiedOnly
              ? 'px-3 py-1.5 rounded-xl text-sm font-semibold bg-violet-50 text-violet-700 border border-violet-200'
              : 'px-3 py-1.5 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors'
          }
        >
          All messages
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
      )}

      {!loading && !error && messages && messages.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-7 h-7 text-violet-400" />
          </div>
          <p className="text-sm text-gray-500">
            {unnotifiedOnly
              ? 'Nothing needs attention — every message was emailed out.'
              : 'No contact messages yet.'}
          </p>
        </div>
      )}

      {!loading && !error && messages && messages.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Received</th>
                <th className="px-4 py-3 font-medium">From</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Message</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((message) => (
                <tr key={message.messageId} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(message.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900">{message.name}</div>
                    <a
                      href={`mailto:${message.email}?subject=Re: ${encodeURIComponent(message.subject)}`}
                      className="text-xs text-violet-600 hover:underline"
                    >
                      {message.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{message.subject}</td>
                  {/* Full text, not truncated: these are short by construction
                      (5000 char cap) and the whole point of this page is
                      reading a message nobody got emailed. */}
                  <td className="px-4 py-3 text-gray-600 max-w-md whitespace-pre-wrap">{message.message}</td>
                  <td className="px-4 py-3">
                    <NotifiedBadge notified={message.notified} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StaffConsoleShell>
  )
}
