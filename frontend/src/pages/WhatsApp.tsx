import { useEffect, useRef, useState } from 'react'
import { Bell, Calendar, Check, Lock, MessageCircle } from 'lucide-react'
import { useToast } from '../components/Toast/Toast'
import {
  connectMetaWhatsApp,
  connectWhatsApp,
  disconnectMetaWhatsApp,
  disconnectWhatsApp,
  getMetaWhatsAppStatus,
  getWhatsAppStatus,
} from '../services/api'
import { MetaIcon, WhatsAppIcon } from '../components/landing/BrandIcons'
import type { ConnectWhatsAppInput, MetaDirectWhatsAppConnection, WhatsAppConnection } from '../types/index'

type TabId = 'lead-notifications' | 'weekly-reports' | 'agent'

const TABS: { id: TabId; label: string; icon: typeof Bell }[] = [
  { id: 'lead-notifications', label: 'Lead Notifications', icon: Bell },
  { id: 'weekly-reports', label: 'Weekly Reports', icon: Calendar },
  { id: 'agent', label: 'WhatsApp Agent', icon: MessageCircle },
]

const EMPTY_FORM: ConnectWhatsAppInput = {
  apiKey: '',
  appName: '',
  sourceNumber: '',
  notificationNumber: '',
}

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const INPUT_CLASSES =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const LABEL_CLASSES = 'block text-sm font-medium text-gray-700 mb-1.5'

const META_APP_ID = import.meta.env.VITE_META_APP_ID as string | undefined
const META_WHATSAPP_CONFIG_ID = import.meta.env.VITE_META_WHATSAPP_CONFIG_ID as string | undefined
// Meta's Embedded Signup posts a message from this origin with session info
// (waba_id, phone_number_id) - validated before trusting the payload, since
// this is a different trust model than the cookie-based OAuth state check
// used for the redirect-based Meta Lead Ads / Zoho connect flows.
const META_EMBEDDED_SIGNUP_ORIGIN = 'https://www.facebook.com'

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; xfbml: boolean; version: string }) => void
      login: (
        callback: (response: { authResponse?: { code?: string } }) => void,
        options: Record<string, unknown>
      ) => void
    }
  }
}

let fbSdkPromise: Promise<void> | null = null

function loadFacebookSdk(): Promise<void> {
  if (window.FB) return Promise.resolve()
  if (fbSdkPromise) return fbSdkPromise

  fbSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://connect.facebook.net/en_US/sdk.js'
    script.async = true
    script.onload = () => {
      if (!META_APP_ID) {
        reject(new Error('Meta App ID not configured'))
        return
      }
      window.FB?.init({ appId: META_APP_ID, xfbml: true, version: 'v21.0' })
      resolve()
    }
    script.onerror = () => reject(new Error('Failed to load Meta SDK'))
    document.body.appendChild(script)
  })

  return fbSdkPromise
}

interface EmbeddedSignupSessionData {
  phone_number_id?: string
  waba_id?: string
  // Present on CANCEL: the step the user bailed out on. The single most
  // useful field for diagnosing a failed signup, and it used to be dropped.
  current_step?: string
  error_message?: string
}

// The last WA_EMBEDDED_SIGNUP message received, whatever its event type.
// Kept separately from the FINISH payload so a CANCEL or an error can be
// turned into a specific message instead of a generic one.
interface EmbeddedSignupEvent {
  event?: string
  data?: EmbeddedSignupSessionData
}

// Meta emits more than one terminal event. FINISH is the full onboarding;
// FINISH_ONLY_WABA fires when a WABA exists but no phone number was added,
// which yields no phone_number_id and so cannot complete a connection here.
const EMBEDDED_SIGNUP_SUCCESS_EVENTS = ['FINISH', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING']

// Turns whatever Embedded Signup last told us into something a human can act
// on. Without this every failure -- popup blocked, user cancelled halfway, no
// phone number on the WABA, config not owned by this app -- surfaced as the
// same "was not completed" string.
function describeSignupFailure(code: string | null, signupEvent: EmbeddedSignupEvent | null): string {
  if (signupEvent?.event === 'CANCEL') {
    const step = signupEvent.data?.current_step
    return step
      ? `Signup was cancelled at the "${step}" step. Complete every step to finish connecting.`
      : 'Signup was cancelled before it finished.'
  }
  if (signupEvent?.data?.error_message) {
    return `Meta reported: ${signupEvent.data.error_message}`
  }
  if (signupEvent?.event === 'FINISH_ONLY_WABA') {
    return 'Your WhatsApp Business Account was created but has no phone number yet. Add and verify a number, then connect again.'
  }
  if (!code) {
    return 'Meta did not return an authorization code. If no popup appeared, allow popups for this site and try again.'
  }
  return 'Meta did not return the WhatsApp account details needed to finish connecting.'
}

export default function WhatsApp() {
  const toast = useToast()

  const [status, setStatus] = useState<WhatsAppConnection | null | 'loading'>('loading')
  const [metaStatus, setMetaStatus] = useState<MetaDirectWhatsAppConnection | null | 'loading'>('loading')
  const [activeTab, setActiveTab] = useState<TabId>('lead-notifications')
  const [form, setForm] = useState<ConnectWhatsAppInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [metaDisconnecting, setMetaDisconnecting] = useState(false)
  const [metaConnecting, setMetaConnecting] = useState(false)
  const [metaNotificationNumber, setMetaNotificationNumber] = useState('')

  const metaConnectButtonRef = useRef<HTMLButtonElement>(null)
  const metaSessionDataRef = useRef<EmbeddedSignupSessionData | null>(null)
  const metaSignupEventRef = useRef<EmbeddedSignupEvent | null>(null)

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
    async function loadMeta() {
      try {
        const res = await getMetaWhatsAppStatus()
        setMetaStatus(res.success ? (res.data ?? null) : null)
      } catch {
        setMetaStatus(null)
        toast.show('Failed to load Meta WhatsApp status', 'error')
      }
    }
    load()
    loadMeta()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Preloaded on mount, not on click. FB.login() opens a popup, and browsers
  // only allow that inside the user gesture that triggered it -- awaiting the
  // SDK's <script> download inside the click handler spends the gesture on a
  // network round trip, after which window.open is blocked. That is what the
  // SDK reports as POPUP_MAYBE_BLOCKED_OAUTH.
  useEffect(() => {
    void loadFacebookSdk().catch(() => {
      // Deliberately silent: a failed preload is surfaced by the window.FB
      // check in handleMetaConnect, where the user is actually asking for it.
      // Toasting on page load would blame the user for merely visiting.
    })
  }, [])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== META_EMBEDDED_SIGNUP_ORIGIN) return

      let data: { type?: string; event?: string; data?: EmbeddedSignupSessionData }

      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }

      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return

      // Logged unconditionally: this popup is the only place that knows why a
      // signup failed, and the message is gone the moment it closes.
      console.log('[WA_EMBEDDED_SIGNUP]', data.event, data.data)
      metaSignupEventRef.current = { event: data.event, data: data.data }

      if (data.event && EMBEDDED_SIGNUP_SUCCESS_EVENTS.includes(data.event) && data.data) {
        metaSessionDataRef.current = data.data
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
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

  async function handleMetaConnect() {
    if (!metaNotificationNumber.trim()) {
      toast.show('Notification number is required', 'error')
      return
    }
    if (!META_APP_ID || !META_WHATSAPP_CONFIG_ID) {
      toast.show('Meta WhatsApp is not configured yet', 'error')
      return
    }
    // Must stay synchronous from here to FB.login() -- see the preload comment
    // on the mount effect above.
    if (!window.FB) {
      toast.show('Meta SDK is still loading, try again in a moment', 'error')
      return
    }

    setMetaConnecting(true)
    metaSessionDataRef.current = null
    metaSignupEventRef.current = null

    try {
      const code = await new Promise<string | null>((resolve) => {
        window.FB?.login(
          (response) => {
            // Logged in full: response.status carries Meta's own reason for a
            // refusal (unknown config_id, app not permitted, popup blocked),
            // and it was previously discarded along with everything except
            // the code.
            console.log('[FB.login] response', response)
            resolve(response.authResponse?.code ?? null)
          },
          {
            config_id: META_WHATSAPP_CONFIG_ID,
            response_type: 'code',
            override_default_response_type: true,
            // setup and featureType are part of Meta's documented Embedded
            // Signup call; only sessionInfoVersion was being sent.
            extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
          }
        )
      })

      // Cast is load-bearing, not laziness: the ref is reset to null just
      // above and is only ever repopulated by the window message listener,
      // which TypeScript's control-flow analysis cannot see. Without it the
      // ref narrows to `never` here and every field read fails to compile.
      const sessionData = metaSessionDataRef.current as EmbeddedSignupSessionData | null

      if (!code || !sessionData?.waba_id || !sessionData?.phone_number_id) {
        toast.show(describeSignupFailure(code, metaSignupEventRef.current as EmbeddedSignupEvent | null), 'error')
        return
      }

      const res = await connectMetaWhatsApp({
        code,
        wabaId: sessionData.waba_id,
        phoneNumberId: sessionData.phone_number_id,
        notificationNumber: metaNotificationNumber.trim(),
      })

      if (res.success) {
        toast.show('Meta WhatsApp connected successfully', 'success')
        setMetaNotificationNumber('')
        const statusRes = await getMetaWhatsAppStatus()
        setMetaStatus(statusRes.success ? (statusRes.data ?? null) : null)
      } else {
        toast.show(res.error ?? 'Failed to connect Meta WhatsApp', 'error')
      }
    } catch (error) {
      // Was a bare `catch {}`, so the actual failure never reached anyone.
      console.error('[MetaWhatsApp] connect failed', error)
      toast.show(error instanceof Error ? error.message : 'Failed to connect Meta WhatsApp', 'error')
    } finally {
      // Return focus to the trigger button before the toast fires, so
      // keyboard/screen-reader users aren't left stranded on a closed popup
      // reference (Meta's popup is outside our control - this is the part
      // of the flow we can manage).
      metaConnectButtonRef.current?.focus()
      setMetaConnecting(false)
    }
  }

  async function handleMetaDisconnect() {
    setMetaDisconnecting(true)
    try {
      const res = await disconnectMetaWhatsApp()
      if (res.success) {
        setMetaStatus(null)
        toast.show('Meta WhatsApp disconnected', 'success')
      } else {
        toast.show(res.error ?? 'Failed to disconnect Meta WhatsApp', 'error')
      }
    } catch {
      toast.show('Failed to disconnect Meta WhatsApp', 'error')
    } finally {
      setMetaDisconnecting(false)
    }
  }

  const statusObj = status !== 'loading' && status !== null ? status : null
  const isConnected = statusObj?.connected ?? false
  const isActive = statusObj?.active ?? false

  const metaStatusObj = metaStatus !== 'loading' && metaStatus !== null ? metaStatus : null
  const isMetaConnected = metaStatusObj?.connected ?? false
  const isMetaActive = metaStatusObj?.active ?? false

  const anyActive = isActive || isMetaActive

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900" style={JAKARTA_FONT}>
          WhatsApp Automation
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Get notified on WhatsApp the moment a lead comes in, and receive a weekly summary every Monday.
        </p>
      </div>

      {/* Connection cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* WhatsApp (Gupshup) card */}
        <section className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 border-b border-gray-50 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                <WhatsAppIcon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
                  WhatsApp
                </h4>
                <p className="text-xs text-gray-500">Send notifications via your own Gupshup account</p>
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
                {isConnected ? (isActive ? 'Connected · Active' : 'Connected') : 'Not Connected'}
              </span>
            )}
          </div>

          {status === 'loading' ? (
            <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ) : isConnected && status ? (
            <div className="space-y-4">
              {isConnected && !isActive && (
                <p className="text-xs text-gray-400">Switching your active provider is coming soon</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">App Name</p>
                  <p className="text-gray-900 font-medium mt-1">{status.appName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Sender Number</p>
                  <p className="text-gray-900 font-medium mt-1">{status.sourceNumber}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Notification Number</p>
                  <p className="text-gray-900 font-medium mt-1">{status.notificationNumber}</p>
                </div>
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
            <form onSubmit={handleConnect} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="wa-api-key" className={LABEL_CLASSES}>
                  Gupshup API Key
                </label>
                <input
                  id="wa-api-key"
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  className={INPUT_CLASSES}
                  placeholder="sk_live_..."
                />
              </div>
              <div>
                <label htmlFor="wa-app-name" className={LABEL_CLASSES}>
                  Gupshup App Name
                </label>
                <input
                  id="wa-app-name"
                  type="text"
                  value={form.appName}
                  onChange={(e) => setForm((prev) => ({ ...prev, appName: e.target.value }))}
                  className={INPUT_CLASSES}
                  placeholder="VyostraAIBot"
                />
              </div>
              <div>
                <label htmlFor="wa-source-number" className={LABEL_CLASSES}>
                  WhatsApp Business Number
                </label>
                <input
                  id="wa-source-number"
                  type="text"
                  value={form.sourceNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, sourceNumber: e.target.value }))}
                  className={INPUT_CLASSES}
                  placeholder="917000000000"
                />
              </div>
              <div>
                <label htmlFor="wa-notification-number" className={LABEL_CLASSES}>
                  Notification Number (receives alerts)
                </label>
                <input
                  id="wa-notification-number"
                  type="text"
                  value={form.notificationNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, notificationNumber: e.target.value }))}
                  className={INPUT_CLASSES}
                  placeholder="919999999999"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? 'Connecting...' : 'Connect WhatsApp'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Meta Direct card */}
        <section className="bg-white rounded-2xl border border-black/5 shadow-sm p-6">
          <div className="flex items-start justify-between gap-3 border-b border-gray-50 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
                <MetaIcon className="w-5 h-5" />
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
                      Meta
                    </h4>
                    {metaStatus !== 'loading' && !isMetaConnected && (
                      <span className="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">Connect directly via Meta, no third-party required</p>
                </div>
              </div>
            </div>
            {metaStatus !== 'loading' && (
              <div className="text-right shrink-0">
                <span
                  className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-2.5 py-1 rounded-full ${
                    isMetaConnected
                      ? isMetaActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-gray-100 text-gray-500 border-gray-200'
                  }`}
                >
                  {isMetaConnected && isMetaActive && <Check className="w-3 h-3" />}
                  {isMetaConnected ? (isMetaActive ? 'Connected · Active' : 'Connected') : 'Not Connected'}
                </span>
                {isMetaConnected && !isMetaActive && (
                  <p className="text-[11px] text-gray-400 mt-1 max-w-40">
                    Switching your active provider is coming soon
                  </p>
                )}
              </div>
            )}
          </div>

          {metaStatus === 'loading' ? (
            <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          ) : isMetaConnected && metaStatus ? (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Phone Number</p>
                <p className="text-gray-900 font-medium mt-1">{metaStatus.displayPhoneNumber}</p>
              </div>
              <button
                type="button"
                onClick={handleMetaDisconnect}
                disabled={metaDisconnecting}
                className="text-red-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {metaDisconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Skip the middleman — connect your WhatsApp Business Account directly through Meta. No BSP fees, no
                separate API key to manage.
              </p>
              <div>
                <label htmlFor="meta-wa-notification-number" className={LABEL_CLASSES}>
                  Notification Number (receives alerts)
                </label>
                <input
                  id="meta-wa-notification-number"
                  type="text"
                  value={metaNotificationNumber}
                  onChange={(e) => setMetaNotificationNumber(e.target.value)}
                  className={INPUT_CLASSES}
                  placeholder="919999999999"
                />
              </div>
              <button
                ref={metaConnectButtonRef}
                type="button"
                onClick={handleMetaConnect}
                disabled={metaConnecting}
                className="inline-flex items-center justify-center bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {metaConnecting ? 'Connecting...' : 'Connect with Meta'}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Tabs */}
      <section className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-50">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const tabIsActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-semibold border-b-2 transition-colors ${
                  tabIsActive
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="p-6">
          {activeTab === 'lead-notifications' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-gray-900">Instant Lead Alerts</h4>
                {anyActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    <Check className="w-2.5 h-2.5" /> Active
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Every time a new lead is captured — from your chat widget or a form — we send a WhatsApp message to
                your notification number right away, so you never miss a lead.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 border border-gray-100">
                <p className="font-mono text-xs text-gray-400 mb-1">Example message</p>
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
                <h4 className="text-sm font-bold text-gray-900">Weekly Summary</h4>
                {anyActive && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    <Check className="w-2.5 h-2.5" /> Active
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">
                Every Monday at 9:00 AM IST, we send a summary of the past week's leads — broken down by chat widget
                and forms — to your notification number.
              </p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 border border-gray-100">
                <p className="font-mono text-xs text-gray-400 mb-1">Example message</p>
                Your weekly VyostraAI report
                <br />
                New leads this week: 12
                <br />
                - Chat widget: 8<br />
                - Forms: 4
              </div>
            </div>
          )}

          {activeTab === 'agent' && (
            <div className="flex flex-col items-center justify-center text-center py-10 gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                <Lock className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-gray-900">WhatsApp Agent</h4>
              <p className="text-sm text-gray-500 max-w-md">
                Let your AI agent talk to leads directly on WhatsApp, not just your website widget. This is coming
                in a future release.
              </p>
              <span className="inline-flex items-center text-[10px] font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full uppercase tracking-wide">
                Coming Soon
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
