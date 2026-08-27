import { useState } from 'react'
import { BellRing, Mail, MessageCircle, Smartphone, TriangleAlert } from 'lucide-react'
import { Toggle } from '../Toggle'
import type { NotificationPreferences } from '../../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface PreferencesSectionProps {
  preferences: NotificationPreferences
  onToggle: (key: keyof NotificationPreferences, value: boolean) => Promise<boolean>
}

// Three channels that actually gate a send, replacing four toggles that gated
// nothing. The old set (emailNotifications, desktopAlerts, weeklySummary,
// leadAssignmentAlerts) lived in sessionStorage and had zero references in
// backend/src -- persisting them would have made placebo switches durable.
const CHANNELS: {
  key: keyof NotificationPreferences
  title: string
  description: string
  icon: typeof Mail
}[] = [
  {
    key: 'push',
    title: 'Mobile push',
    description: 'Buzz your phone the moment a lead arrives. Needs the Vyostra app installed.',
    icon: Smartphone,
  },
  {
    key: 'whatsapp',
    title: 'WhatsApp',
    description: 'A message to your notification number for every new lead and handoff.',
    icon: MessageCircle,
  },
  {
    key: 'email',
    title: 'Email fallback',
    description: 'Used only when the WhatsApp alert cannot be delivered.',
    icon: Mail,
  },
]

export default function PreferencesSection({ preferences, onToggle }: PreferencesSectionProps) {
  const [saving, setSaving] = useState<keyof NotificationPreferences | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(key: keyof NotificationPreferences) {
    setSaving(key)
    setError(null)
    const ok = await onToggle(key, !preferences[key])
    if (!ok) setError('Could not save that change. Please try again.')
    setSaving(null)
  }

  // Every channel off means a lead arrives and nobody is told. That is a
  // legitimate choice and a terrible accident, so it is stated plainly rather
  // than being blocked.
  const allOff = !preferences.push && !preferences.whatsapp && !preferences.email
  // Email is the fallback for a failed WhatsApp send. With WhatsApp on and
  // email off, a rejected send reaches nobody unless push is on.
  const noFallback = preferences.whatsapp && !preferences.email && !preferences.push

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm h-full">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-4 mb-6">
        <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 shrink-0">
          <BellRing className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
            Lead alerts
          </h4>
          <p className="text-xs text-gray-500">Which channels tell you a lead arrived.</p>
        </div>
      </div>

      <div className="space-y-5">
        {CHANNELS.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.key} className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 mt-0.5 shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed max-w-sm">{item.description}</p>
                </div>
              </div>

              <Toggle
                checked={preferences[item.key]}
                onChange={() => void handle(item.key)}
                title={item.title}
                disabled={saving !== null}
              />
            </div>
          )
        })}
      </div>

      {error ? <p className="mt-4 text-xs text-red-600">{error}</p> : null}

      {allOff ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 p-3">
          <TriangleAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 leading-relaxed">
            Every channel is off. New leads will still appear in your inbox, but nothing will tell you
            one arrived.
          </p>
        </div>
      ) : noFallback ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 p-3">
          <TriangleAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 leading-relaxed">
            With the email fallback off, a WhatsApp alert that fails to deliver will not reach you
            anywhere else.
          </p>
        </div>
      ) : null}
    </div>
  )
}
