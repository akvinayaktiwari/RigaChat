import { useEffect, useState } from 'react'
import { LogOut, ShieldCheck } from 'lucide-react'
import { useStaffAuth } from '../../hooks/useStaffAuth'
import { getAdminAccounts } from '../../services/adminApi'
import type { AdminAccountSummary, AdminFeatureState } from '../../services/adminApi'
import { Spinner } from '../../components/Spinner/Spinner'

function formatFeature(key: string, feature: AdminFeatureState): string {
  if (!feature.enabled) return `${key}: off`

  const limitEntries = Object.entries(feature.limits)
  const limitText = limitEntries.length
    ? limitEntries
        .map(([limitKey, value]) => `${value === null ? 'unlimited' : value}${limitKey ? ` ${limitKey}` : ''}`)
        .join(', ')
    : 'on'

  return `${key}: ${limitText}`
}

function EntitlementsSummary({ entitlements }: { entitlements: AdminAccountSummary['entitlements'] }) {
  const parts = [
    formatFeature('Chat', entitlements.chat),
    formatFeature('CRM', entitlements.crm),
    formatFeature('Agents', entitlements.agents),
    formatFeature('Voice', entitlements.voice),
  ]
  return <span className="text-xs text-gray-500">{parts.join(' · ')}</span>
}

function InternalBadge({ isInternal }: { isInternal: boolean }) {
  if (!isInternal) return <span className="text-xs text-gray-400">—</span>
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
      Internal
    </span>
  )
}

export default function AdminAccountsPage() {
  const { staffUser, token, signOut } = useStaffAuth()
  const [accounts, setAccounts] = useState<AdminAccountSummary[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await getAdminAccounts(token as string)
        if (cancelled) return
        if (!res.success || !res.data) {
          setError(res.error ?? 'Failed to load accounts')
          return
        }
        setAccounts(res.data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load accounts')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-violet-600" size={20} />
          <span className="font-semibold text-gray-900">VyostraAI Staff Console</span>
        </div>
        <div className="flex items-center gap-4">
          {staffUser && <span className="text-sm text-gray-500">{staffUser.email}</span>}
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Accounts</h1>
        <p className="text-sm text-gray-500 mb-6">All subscriptions with resolved entitlements</p>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
        )}

        {!loading && !error && accounts && accounts.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-16 text-center text-sm text-gray-500">
            No accounts yet.
          </div>
        )}

        {!loading && !error && accounts && accounts.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Internal</th>
                  <th className="px-4 py-3 font-medium">Trial ends</th>
                  <th className="px-4 py-3 font-medium">Entitlements</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.accountId} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 text-gray-900">{account.email ?? <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-700">{account.name ?? <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{account.plan}</td>
                    <td className="px-4 py-3 text-gray-700 capitalize">{account.status}</td>
                    <td className="px-4 py-3">
                      <InternalBadge isInternal={account.isInternal} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {account.trialEndsAt ? new Date(account.trialEndsAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <EntitlementsSummary entitlements={account.entitlements} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
