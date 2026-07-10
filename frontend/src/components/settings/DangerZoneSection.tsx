import { ShieldAlert } from 'lucide-react'

interface DangerZoneSectionProps {
  onDeleteAccount: () => void
}

export default function DangerZoneSection({ onDeleteAccount }: DangerZoneSectionProps) {
  return (
    <section className="pb-12">
      <div className="bg-rose-50/40 border border-rose-200/60 rounded-2xl p-6 md:p-8 hover:bg-rose-50/60 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <h4 className="text-sm font-extrabold text-rose-600 uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 animate-bounce text-rose-600 shrink-0" />
              Danger Zone
            </h4>
            <p className="text-xs md:text-sm text-on-surface-variant max-w-2xl leading-relaxed">
              Deleting your account will permanently erase all active chatbots, leads, conversations, and knowledge
              base entries. This action cannot be undone.
            </p>
          </div>

          <button
            type="button"
            onClick={onDeleteAccount}
            className="w-full sm:w-auto px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
          >
            Delete Account
          </button>
        </div>
      </div>
    </section>
  )
}
