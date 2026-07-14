import { LogOut, Trash2 } from 'lucide-react'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface DangerZoneSectionProps {
  onSignOut: () => void
  onDeleteAccount: () => void
}

export default function DangerZoneSection({ onSignOut, onDeleteAccount }: DangerZoneSectionProps) {
  return (
    <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
      <h4 className="font-bold text-red-800" style={JAKARTA_FONT}>
        Danger Zone
      </h4>

      <div className="flex items-center justify-between pb-4 mb-4 mt-4 border-b border-red-100">
        <p className="text-sm text-red-600 max-w-md">Sign out of your VyostraAI account on this device.</p>
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 bg-white text-gray-700 font-medium px-4 py-2.5 rounded-xl text-sm border border-gray-200 hover:bg-gray-50 transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-red-600 max-w-md">
          Deleting your account will permanently erase all active chatbots, leads, conversations, and knowledge base
          entries. This action cannot be undone.
        </p>
        <button
          type="button"
          onClick={onDeleteAccount}
          className="inline-flex items-center gap-2 bg-red-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-red-600 transition-colors shrink-0"
        >
          <Trash2 className="w-4 h-4" />
          Delete Account
        </button>
      </div>
    </div>
  )
}
