import { AppWindow, BellRing, Calendar, Mail, ShieldAlert } from 'lucide-react'
import { Toggle } from '../Toggle'
import type { Preferences } from '../../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface PreferencesSectionProps {
  preferences: Preferences
  onToggle: (key: keyof Preferences) => void
}

const SETTINGS_LIST: { key: keyof Preferences; title: string; description: string; icon: typeof Mail }[] = [
  {
    key: 'emailNotifications',
    title: 'Email Notifications',
    description: 'Daily lead summaries, system updates, and urgent alerts.',
    icon: Mail,
  },
  {
    key: 'desktopAlerts',
    title: 'Desktop Alerts',
    description: 'Push notifications inside browser for live incoming leads.',
    icon: AppWindow,
  },
  {
    key: 'weeklySummary',
    title: 'Weekly Progress Reports',
    description: 'Receive a consolidated pipeline audit in your inbox every Monday.',
    icon: Calendar,
  },
  {
    key: 'leadAssignmentAlerts',
    title: 'Lead Auto-Assignment Alerts',
    description: 'Get notified instantly if a high-value lead requires custom bot override.',
    icon: ShieldAlert,
  },
]

export default function PreferencesSection({ preferences, onToggle }: PreferencesSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm h-full">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-4 mb-6">
        <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 shrink-0">
          <BellRing className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
            Preferences
          </h4>
          <p className="text-xs text-gray-500">Configure notifications and tracking behavior.</p>
        </div>
      </div>

      <div className="space-y-5">
        {SETTINGS_LIST.map((item) => {
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

              <Toggle checked={preferences[item.key]} onChange={() => onToggle(item.key)} title={item.title} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
