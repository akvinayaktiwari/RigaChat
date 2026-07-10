import { AppWindow, BellRing, Calendar, Mail, ShieldAlert } from 'lucide-react'
import { Toggle } from '../Toggle'
import type { Preferences } from '../../types/index'

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
    <div className="bg-white rounded-2xl border border-outline-variant p-6 md:p-8 hover:shadow-md transition-all duration-300 h-full">
      <div className="flex items-center gap-3 border-b border-outline-variant pb-4 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
          <BellRing className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-base font-bold text-on-surface">Preferences</h4>
          <p className="text-[11px] text-on-surface-variant font-medium">
            Configure notifications and tracking behavior.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {SETTINGS_LIST.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.key} className="flex items-start justify-between gap-4 group">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-on-surface-variant group-hover:text-primary transition-colors mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface">{item.title}</p>
                  <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed max-w-sm">
                    {item.description}
                  </p>
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
