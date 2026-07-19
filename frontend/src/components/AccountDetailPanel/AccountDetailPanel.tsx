import { useEffect, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { AdminActionModal } from '../AdminActionModal/AdminActionModal'
import { getAuditHistory } from '../../services/adminApi'
import type { AdminAccountSummary, AdminFeatureState, AdminSubscription, AuditAction, AuditEntry } from '../../services/adminApi'
import { Spinner } from '../Spinner/Spinner'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const secondaryButtonClasses =
  'bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50'

const ACTION_LABELS: Record<AuditAction, string> = {
  toggle_internal: 'Toggled internal',
  extend_trial: 'Extended trial',
  change_plan: 'Changed plan',
  set_overrides: 'Set overrides',
}

function formatFeatureDetail(feature: AdminFeatureState): string {
  if (!feature.enabled) return 'off'
  const entries = Object.entries(feature.limits)
  if (!entries.length) return 'on'
  return entries.map(([key, value]) => `${value === null ? 'unlimited' : value} ${key}`).join(', ')
}

function FeatureCard({ label, feature }: { label: string; feature: AdminFeatureState }) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-sm mt-1 ${feature.enabled ? 'text-gray-900' : 'text-gray-400'}`}>{formatFeatureDetail(feature)}</p>
    </div>
  )
}

function formatDiffValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const keys = Array.from(new Set([...Object.keys(entry.before), ...Object.keys(entry.after)]))

  return (
    <div className="border border-gray-100 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-900">{ACTION_LABELS[entry.action]}</span>
        <span className="text-xs text-gray-400">{new Date(entry.timestamp).toLocaleString()}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        by {entry.actorEmail} — {entry.reason}
      </p>
      <div className="mt-2 text-xs font-mono text-gray-600 space-y-0.5">
        {keys.map((key) => (
          <div key={key}>
            {key}: {formatDiffValue(entry.before[key])} → {formatDiffValue(entry.after[key])}
          </div>
        ))}
      </div>
    </div>
  )
}

interface AccountDetailPanelProps {
  account: AdminAccountSummary
  token: string
  onClose: () => void
  onRefresh: () => Promise<void>
}

export function AccountDetailPanel({ account, token, onClose, onRefresh }: AccountDetailPanelProps) {
  const [tab, setTab] = useState<'overview' | 'history'>('overview')
  const [activeAction, setActiveAction] = useState<AuditAction | null>(null)
  const [subscription, setSubscription] = useState<AdminSubscription | null>(null)
  const [history, setHistory] = useState<AuditEntry[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)

  async function loadHistory() {
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await getAuditHistory(token, account.accountId)
      if (!res.success || !res.data) {
        setHistoryError(res.error ?? 'Failed to load history')
        return
      }
      setHistory(res.data)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'history' && history === null) {
      loadHistory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleActionSuccess(updated: AdminSubscription) {
    setSubscription(updated)
    setActiveAction(null)
    await onRefresh()
    if (tab === 'history') {
      await loadHistory()
    } else {
      setHistory(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 w-full max-w-2xl max-h-[85vh] flex flex-col relative">
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <h2 className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
              {account.email ?? account.accountId}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {account.name ?? '—'} · {account.plan} · {account.status}
            </p>
          </div>
          <button type="button" onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex gap-1 px-6 mt-4 border-b border-gray-100">
          {(['overview', 'history'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                tab === t ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <FeatureCard label="Chat" feature={account.entitlements.chat} />
                <FeatureCard label="CRM" feature={account.entitlements.crm} />
                <FeatureCard label="Agents" feature={account.entitlements.agents} />
                <FeatureCard label="Voice" feature={account.entitlements.voice} />
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setActiveAction('toggle_internal')} className={`px-3 py-2.5 text-sm ${secondaryButtonClasses}`}>
                  Toggle Internal
                </button>
                <button type="button" onClick={() => setActiveAction('extend_trial')} className={`px-3 py-2.5 text-sm ${secondaryButtonClasses}`}>
                  Extend Trial
                </button>
                <button type="button" onClick={() => setActiveAction('change_plan')} className={`px-3 py-2.5 text-sm ${secondaryButtonClasses}`}>
                  Change Plan
                </button>
                <button type="button" onClick={() => setActiveAction('set_overrides')} className={`px-3 py-2.5 text-sm ${secondaryButtonClasses}`}>
                  Set Overrides
                </button>
              </div>
            </>
          )}

          {tab === 'history' && (
            <>
              {historyLoading && (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" />
                </div>
              )}
              {!historyLoading && historyError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  {historyError}
                </div>
              )}
              {!historyLoading && !historyError && history && history.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-12">No changes recorded for this account yet.</p>
              )}
              {!historyLoading && !historyError && history && history.length > 0 && (
                <div className="space-y-2">
                  {history.map((entry) => (
                    <AuditEntryRow key={entry.auditId} entry={entry} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {activeAction && (
        <AdminActionModal
          account={account}
          action={activeAction}
          token={token}
          currentOverrides={subscription?.overrides ?? null}
          onClose={() => setActiveAction(null)}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  )
}
