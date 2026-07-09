import { useEffect, useState } from 'react'
import { LogOut, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { connectZoho, disconnectCRM, getIntegrationStatus } from '../services/api'
import type { CRMConnection } from '../types/index'

interface PlanInfo {
  id: 'starter' | 'growth' | 'agency'
  name: string
  price: string
  badge?: string
  features: string[]
}

const PLANS: PlanInfo[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '₹1,999/mo',
    features: ['1 chatbot', '500 conversations/mo', 'Basic CRM (50 leads)', 'Knowledge base (10 docs)', 'Email notifications'],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹5,499/mo',
    badge: 'Most Popular',
    features: [
      '3 chatbots',
      '2,000 conversations/mo',
      'Full CRM pipeline',
      'Lead qualification',
      'WhatsApp handoff',
      'Analytics dashboard',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '₹14,999/mo',
    features: ['Unlimited chatbots', 'White label branding', 'Client sub-accounts', 'Priority support', 'Webhook integrations'],
  },
]

const PLAN_BADGE_CLASSES: Record<PlanInfo['id'], string> = {
  starter: 'bg-slate-100 text-slate-600',
  growth: 'bg-indigo-100 text-indigo-600',
  agency: 'bg-purple-100 text-purple-600',
}

const inputClasses =
  'w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all'
const labelClasses = 'block text-sm font-medium text-slate-700 mb-2'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ClientRecord.createdAt isn't exposed on the useAuth user object yet, so
// "Member Since" falls back to today's date until that's threaded through.
function getMemberSinceDate(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function SettingsPage() {
  const { user, logout } = useAuth()
  const [showUpgradeToast, setShowUpgradeToast] = useState(false)

  const [crmConnection, setCrmConnection] = useState<CRMConnection | null>(null)
  const [crmLoading, setCrmLoading] = useState(true)
  const [showDisconnectModal, setShowDisconnectModal] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [zohoToast, setZohoToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  function handleUpgrade() {
    setShowUpgradeToast(true)
    setTimeout(() => setShowUpgradeToast(false), 3000)
  }

  useEffect(() => {
    getIntegrationStatus()
      .then((res) => setCrmConnection(res.success ? (res.data ?? null) : null))
      .finally(() => setCrmLoading(false))

    const params = new URLSearchParams(window.location.search)
    const zohoParam = params.get('zoho')
    if (zohoParam === 'connected') {
      setZohoToast({ type: 'success', message: 'Zoho CRM connected successfully' })
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (zohoParam === 'error') {
      setZohoToast({ type: 'error', message: 'Failed to connect Zoho CRM. Please try again.' })
      window.history.replaceState({}, '', '/dashboard/settings')
    }
  }, [])

  useEffect(() => {
    if (!zohoToast) return
    const timer = setTimeout(() => setZohoToast(null), 4000)
    return () => clearTimeout(timer)
  }, [zohoToast])

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      const res = await disconnectCRM()
      if (res.success) {
        setCrmConnection(null)
      }
    } finally {
      setDisconnecting(false)
      setShowDisconnectModal(false)
    }
  }

  const currentPlan = user?.plan as PlanInfo['id'] | undefined

  return (
    <div>
      <h1 className="font-bold text-2xl text-slate-800">Settings</h1>
      <p className="text-slate-500 text-sm">Manage your account and preferences</p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm h-fit">
          <h2 className="font-semibold text-lg text-slate-800 mb-4">Profile</h2>

          <div className="w-20 h-20 rounded-full bg-indigo-600 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
            {user ? getInitials(user.name) : ''}
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClasses}>Display Name</label>
              <input type="text" value={user?.name ?? ''} readOnly className={`${inputClasses} bg-slate-50 cursor-not-allowed`} />
            </div>

            <div>
              <label className={labelClasses}>Email Address</label>
              <input
                type="email"
                value={user?.email ?? ''}
                readOnly
                className={`${inputClasses} bg-slate-50 cursor-not-allowed`}
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Current Plan</span>
              {currentPlan && (
                <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${PLAN_BADGE_CLASSES[currentPlan]}`}>
                  {currentPlan}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Member Since</span>
              <span className="text-sm text-slate-500">{getMemberSinceDate()}</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
            <h2 className="font-semibold text-lg text-slate-800 mb-1">Subscription Plan</h2>
            <p className="text-slate-500 text-sm mb-6">Choose the plan that works for your business</p>

            {PLANS.map((plan) => {
              const isCurrent = plan.id === currentPlan
              return (
                <div
                  key={plan.id}
                  className={`border rounded-2xl p-5 mb-3 transition-all ${
                    isCurrent ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-800">{plan.name}</h3>
                        {plan.badge && (
                          <span className="bg-indigo-600 text-white text-xs px-2 py-1 rounded-full">{plan.badge}</span>
                        )}
                      </div>
                      <ul className="mt-2 space-y-1">
                        {plan.features.map((feature) => (
                          <li key={feature} className="text-sm text-slate-600">
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-800 mb-2">{plan.price}</p>
                      {isCurrent ? (
                        <span className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm cursor-default inline-block">
                          Current Plan
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleUpgrade}
                          className="border border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl text-sm transition-colors"
                        >
                          Upgrade
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm mt-6">
            <h2 className="font-semibold text-lg text-slate-800 mb-1">Integrations</h2>
            <p className="text-slate-500 text-sm mb-6">Connect your CRM to sync leads automatically</p>

            <div className="space-y-3">
              <div className="flex items-center justify-between border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500 text-white font-bold flex items-center justify-center shrink-0">
                    Z
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">Zoho CRM</p>
                    <p className="text-slate-500 text-sm">Sync form leads to Zoho automatically</p>
                  </div>
                </div>

                {crmLoading ? (
                  <Loader2 size={18} className="animate-spin text-slate-400" />
                ) : crmConnection?.connected ? (
                  <div className="flex items-center gap-3">
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-3 py-1 rounded-full font-medium">
                      Connected
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDisconnectModal(true)}
                      className="text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={connectZoho}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  >
                    Connect Zoho
                  </button>
                )}
              </div>

              {[
                { label: 'H', name: 'HubSpot' },
                { label: 'S', name: 'Salesforce' },
              ].map((crm) => (
                <div
                  key={crm.name}
                  className="flex items-center justify-between border border-slate-100 rounded-xl p-4 opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-300 text-white font-bold flex items-center justify-center shrink-0">
                      {crm.label}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{crm.name}</p>
                      <p className="text-slate-500 text-sm">Sync form leads to {crm.name} automatically</p>
                    </div>
                  </div>
                  <span className="bg-slate-100 text-slate-500 text-xs px-3 py-1 rounded-full font-medium">
                    Coming Soon
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-red-100 shadow-sm mt-6">
            <h2 className="font-semibold text-lg text-red-600 mb-4">Danger Zone</h2>
            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 border border-red-200 text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {showUpgradeToast && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          Coming soon! We&apos;ll notify you when upgrades are available.
        </div>
      )}

      {zohoToast && (
        <div
          className={`fixed bottom-4 right-4 text-white text-sm px-4 py-2 rounded-xl shadow-lg ${
            zohoToast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {zohoToast.message}
        </div>
      )}

      {showDisconnectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h2 className="text-lg font-bold text-slate-800">Disconnect Zoho CRM?</h2>
            <p className="text-sm text-slate-500 mt-2">
              New form leads will stop syncing to Zoho until you reconnect.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={disconnecting}
                className="text-slate-600 hover:text-slate-800 transition-colors px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
