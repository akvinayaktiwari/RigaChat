import { useEffect, useState } from 'react'
import { Bell, Calendar, Check, Lock, MessageCircle } from 'lucide-react'
import { useToast } from '../components/Toast/Toast'
import { connectWhatsApp, disconnectWhatsApp, getWhatsAppStatus } from '../services/api'
import type { ConnectWhatsAppInput, WhatsAppConnection } from '../types/index'

type TabId = 'lead-notifications' | 'weekly-reports' | 'chatbot'

const TABS: { id: TabId; label: string; icon: typeof Bell }[] = [
  { id: 'lead-notifications', label: 'Lead Notifications', icon: Bell },
  { id: 'weekly-reports', label: 'Weekly Reports', icon: Calendar },
  { id: 'chatbot', label: 'WhatsApp Chatbot', icon: MessageCircle },
]

const EMPTY_FORM: ConnectWhatsAppInput = {
  apiKey: '',
  appName: '',
  sourceNumber: '',
  notificationNumber: '',
}

export default function WhatsApp() {
  const toast = useToast()

  const [status, setStatus] = useState<WhatsAppConnection | null | 'loading'>('loading')
  const [activeTab, setActiveTab] = useState<TabId>('lead-notifications')
  const [form, setForm] = useState<ConnectWhatsAppInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await getWhatsAppStatus()
        setStatus(res.success ? (res.data ?? null) : null)
      } catch {
        setStatus(null)
        toast.show('Failed to load WhatsApp status', 'error')
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!form.apiKey.trim() || !form.appName.trim() || !form.sourceNumber.trim() || !form.notificationNumber.trim()) {
      toast.show('All fields are required', 'error')
      return
    }

    setSaving(true)
    try {
      const res = await connectWhatsApp(form)
      if (res.success) {
        toast.show('WhatsApp connected successfully', 'success')
        setForm(EMPTY_FORM)
        const statusRes = await getWhatsAppStatus()
        setStatus(statusRes.success ? (statusRes.data ?? null) : null)
      } else {
        toast.show(res.error ?? 'Failed to connect WhatsApp', 'error')
      }
    } catch {
      toast.show('Failed to connect WhatsApp', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      const res = await disconnectWhatsApp()
      if (res.success) {
        setStatus(null)
        toast.show('WhatsApp disconnected', 'success')
      } else {
        toast.show(res.error ?? 'Failed to disconnect WhatsApp', 'error')
      }
    } catch {
      toast.show('Failed to disconnect WhatsApp', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  const isConnected = status !== 'loading' && status !== null && status.connected

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-on-surface tracking-tight">WhatsApp Automation</h1>
        <p className="text-xs md:text-sm text-on-surface-variant mt-1">
          Get notified on WhatsApp the moment a lead comes in, and receive a weekly summary every Monday.
        </p>
      </div>

      {/* Connection card */}
      <section className="bg-white rounded-2xl border border-outline-variant p-6 md:p-8">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-bold text-on-surface">Gupshup Connection</h4>
              <p className="text-[11px] text-on-surface-variant font-medium">
                Your own Gupshup credentials — BeepBoop never sees or exposes your API key.
              </p>
            </div>
          </div>
          {status !== 'loading' && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                isConnected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : 'bg-surface-container-low text-on-surface-variant border-outline-variant'
              }`}
            >
              {isConnected && <Check className="w-3 h-3" />}
              {isConnected ? 'Connected' : 'Not Connected'}
            </span>
          )}
        </div>

        {status === 'loading' ? (
          <div className="h-32 bg-surface-container-low rounded-xl animate-pulse" />
        ) : isConnected && status ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">App Name</p>
                <p className="text-on-surface font-medium mt-1">{status.appName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">Sender Number</p>
                <p className="text-on-surface font-medium mt-1">{status.sourceNumber}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">
                  Notification Number
                </p>
                <p className="text-on-surface font-medium mt-1">{status.notificationNumber}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-5 py-2 bg-surface-container-low hover:bg-rose-50 hover:text-rose-600 border border-outline-variant text-on-surface-variant font-bold text-xs rounded-xl transition-all duration-150 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleConnect} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="wa-api-key" className="block text-xs font-bold text-on-surface-variant mb-2">
                Gupshup API Key
              </label>
              <input
                id="wa-api-key"
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                className="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="sk_live_..."
              />
            </div>
            <div>
              <label htmlFor="wa-app-name" className="block text-xs font-bold text-on-surface-variant mb-2">
                Gupshup App Name
              </label>
              <input
                id="wa-app-name"
                type="text"
                value={form.appName}
                onChange={(e) => setForm((prev) => ({ ...prev, appName: e.target.value }))}
                className="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="BeepBoopBot"
              />
            </div>
            <div>
              <label htmlFor="wa-source-number" className="block text-xs font-bold text-on-surface-variant mb-2">
                WhatsApp Business Number
              </label>
              <input
                id="wa-source-number"
                type="text"
                value={form.sourceNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, sourceNumber: e.target.value }))}
                className="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="917000000000"
              />
            </div>
            <div>
              <label htmlFor="wa-notification-number" className="block text-xs font-bold text-on-surface-variant mb-2">
                Notification Number (receives alerts)
              </label>
              <input
                id="wa-notification-number"
                type="text"
                value={form.notificationNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, notificationNumber: e.target.value }))}
                className="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                placeholder="919999999999"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary hover:bg-primary-container text-on-primary px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {saving ? 'Connecting...' : 'Connect WhatsApp'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Tabs */}
      <section className="bg-white rounded-2xl border border-outline-variant overflow-hidden">
        <div className="flex border-b border-outline-variant">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-4 text-xs font-bold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="p-6 md:p-8">
          {activeTab === 'lead-notifications' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-on-surface">Instant Lead Alerts</h4>
                {isConnected && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 uppercase tracking-wider">
                    <Check className="w-2.5 h-2.5" /> Active
                  </span>
                )}
              </div>
              <p className="text-sm text-on-surface-variant">
                Every time a new lead is captured — from your chat widget or a form — we send a WhatsApp message to
                your notification number right away, so you never miss a lead.
              </p>
              <div className="bg-surface-container-low rounded-xl p-4 text-sm text-on-surface border border-outline-variant">
                <p className="font-mono text-xs text-on-surface-variant mb-1">Example message</p>
                New lead captured!
                <br />
                Name: Adarsh
                <br />
                Phone: 917000000000
                <br />
                Source: https://yoursite.com
              </div>
            </div>
          )}

          {activeTab === 'weekly-reports' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-on-surface">Weekly Summary</h4>
                {isConnected && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 uppercase tracking-wider">
                    <Check className="w-2.5 h-2.5" /> Active
                  </span>
                )}
              </div>
              <p className="text-sm text-on-surface-variant">
                Every Monday at 9:00 AM IST, we send a summary of the past week's leads — broken down by chat widget
                and forms — to your notification number.
              </p>
              <div className="bg-surface-container-low rounded-xl p-4 text-sm text-on-surface border border-outline-variant">
                <p className="font-mono text-xs text-on-surface-variant mb-1">Example message</p>
                Your weekly BeepBoop report
                <br />
                New leads this week: 12
                <br />
                - Chat widget: 8<br />
                - Forms: 4
              </div>
            </div>
          )}

          {activeTab === 'chatbot' && (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
              <div className="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant">
                <Lock className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-on-surface">WhatsApp Chatbot</h4>
              <p className="text-sm text-on-surface-variant max-w-md">
                Let your AI chatbot talk to leads directly on WhatsApp, not just your website widget. This is coming
                in a future release.
              </p>
              <span className="inline-flex items-center text-[9px] font-bold text-on-surface-variant bg-surface-container-low border border-outline-variant px-2.5 py-1 rounded-md uppercase tracking-wide">
                Coming Soon
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
