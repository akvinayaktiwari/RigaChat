import { useEffect, useState } from 'react'
import { Check, Megaphone } from 'lucide-react'
import { useToast } from '../components/Toast/Toast'
import { connectMeta, disconnectMeta, getMetaLeads, getMetaStatus } from '../services/api'
import type { MetaConnection, MetaLead } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

function parseCustomFields(raw: MetaLead['customFields']): Record<string, string> {
  if (typeof raw === 'object' && raw !== null) return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export default function MetaAds() {
  const toast = useToast()

  const [status, setStatus] = useState<MetaConnection | null | 'loading'>('loading')
  const [leads, setLeads] = useState<MetaLead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    async function load() {
      const [statusResult, leadsResult] = await Promise.allSettled([getMetaStatus(), getMetaLeads()])

      if (statusResult.status === 'fulfilled') {
        setStatus(statusResult.value.success ? (statusResult.value.data ?? null) : null)
      } else {
        setStatus(null)
        toast.show('Failed to load Meta Ads status', 'error')
      }

      if (leadsResult.status === 'fulfilled') {
        setLeads(leadsResult.value.success ? (leadsResult.value.data ?? []) : [])
      } else {
        toast.show('Failed to load Meta leads', 'error')
      }
      setLeadsLoading(false)
    }
    load()

    const params = new URLSearchParams(window.location.search)
    const metaParam = params.get('meta')
    if (metaParam === 'connected') {
      toast.show('Meta Ads connected successfully', 'success')
      window.history.replaceState({}, '', '/dashboard/meta-ads')
    } else if (metaParam === 'error') {
      const reason = params.get('reason')
      const message =
        reason === 'page_already_connected'
          ? 'That Facebook Page is already connected to another account. Disconnect it there first.'
          : 'Failed to connect Meta Ads. Please try again.'
      toast.show(message, 'error')
      window.history.replaceState({}, '', '/dashboard/meta-ads')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleConnect() {
    connectMeta()
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      const res = await disconnectMeta()
      if (res.success) {
        setStatus(null)
        toast.show('Meta Ads disconnected', 'success')
      } else {
        toast.show(res.error ?? 'Failed to disconnect Meta Ads', 'error')
      }
    } catch {
      toast.show('Failed to disconnect Meta Ads', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  const isConnected = status !== 'loading' && status !== null && status.connected

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900" style={JAKARTA_FONT}>
          Meta Lead Ads
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect a Facebook Page running Lead Ads — new form submissions land here automatically, sync to your CRM,
          and trigger the same WhatsApp alert your other lead sources do.
        </p>
      </div>

      <section className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
        <div className="flex items-center justify-between gap-3 border-b border-gray-50 pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
                Facebook Page Connection
              </h4>
              <p className="text-xs text-gray-500">One Page connected at a time — disconnect to switch Pages.</p>
            </div>
          </div>
          {status !== 'loading' && (
            <span
              className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200'
              }`}
            >
              {isConnected && <Check className="w-3 h-3" />}
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          )}
        </div>

        {status === 'loading' ? (
          <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ) : isConnected && status ? (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Connected Page</p>
              <p className="text-gray-900 font-medium mt-1">{status.pageName}</p>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-red-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            className="inline-flex items-center justify-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
          >
            Connect with Facebook
          </button>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="border-b border-gray-50 px-6 py-4">
          <h4 className="font-bold text-gray-900 text-sm">Recent Meta Leads</h4>
        </div>

        {leadsLoading ? (
          <div className="p-6">
            <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
            <p className="text-sm font-semibold text-gray-900">No Meta leads yet</p>
            <p className="text-sm text-gray-500 max-w-md">
              {isConnected
                ? 'Once someone submits your connected Page\'s Lead Ads form, it shows up here.'
                : 'Connect a Facebook Page above to start capturing Lead Ads submissions.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {leads.map((lead) => {
              const fields = parseCustomFields(lead.customFields)
              const extraFields = Object.entries(fields)

              return (
                <div key={lead.leadId} className="px-6 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{lead.name || 'Unknown name'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[lead.phone, lead.email].filter(Boolean).join(' · ') || 'No contact info'}
                    </p>
                    {(lead.propertyInterest || lead.budgetRange) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[lead.propertyInterest, lead.budgetRange].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {extraFields.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {extraFields.map(([key, value]) => `${key}: ${value}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">{new Date(lead.createdAt).toLocaleDateString()}</p>
                    {lead.crmSynced ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full mt-1">
                        <Check className="w-2.5 h-2.5" /> Synced
                      </span>
                    ) : lead.crmSyncError ? (
                      <span className="inline-flex items-center text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full mt-1">
                        Sync failed
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
