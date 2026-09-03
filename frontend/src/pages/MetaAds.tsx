import { useEffect, useState } from 'react'
import { Check, Megaphone, TriangleAlert, X } from 'lucide-react'
import { useToast } from '../components/Toast/Toast'
import {
  connectMeta,
  disconnectMeta,
  disconnectMetaPage,
  getConnectedMetaPages,
  verifyMetaPageSubscriptions,
  getMetaLeads,
  getMetaStatus,
} from '../services/api'
import MetaPagePicker from '../components/MetaPagePicker'
import type {
  MetaConnectPagesResult,
  MetaConnection,
  MetaLead,
  MetaPageRepaired,
  MetaPageSkipped,
  MetaPageSummary,
} from '../types/index'

// Exhaustive by construction: adding a reason to the union without adding it
// here fails the build. The old nested ternary fell through to "Meta refused
// the webhook subscription", so an unrecognised reason asserted a specific and
// probably wrong cause, sending the client to look for a problem on Facebook's
// side that may not exist.
function skipReasonText(reason: MetaPageSkipped['reason']): string {
  switch (reason) {
    case 'already_connected_to_another_account':
      return 'already connected to another account'
    case 'batch_budget_exceeded':
      return 'not attempted — press Add Pages again to finish these'
    case 'subscribe_failed':
      return 'Meta refused the webhook subscription; try again'
    default: {
      const unreachable: never = reason
      return `could not be connected (${String(unreachable)}); try again`
    }
  }
}

const VERIFY_ONCE_KEY = 'meta-pages-verified-this-session'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

function parseCustomFields(raw: MetaLead['customFields']): Record<string, string> {
  if (typeof raw === 'object' && raw !== null) return raw
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// Mirrors backend/src/lib/meta-connect-errors.ts's MetaConnectFailureReason.
//
// Every one of these used to render as "Failed to connect Meta Ads. Please try
// again." The worst case was a client with no Facebook Page: the backend
// produced the exactly right sentence and it was discarded, so the client
// retried an action that could never succeed. "Try again" is only honest for
// the genuinely transient cases.
const META_ERROR_MESSAGES: Record<string, string> = {
  no_pages:
    'No Facebook Page found on that account. Meta Lead Ads needs a Page you manage — create or get access to one, then connect again.',
  page_already_connected:
    'That Facebook Page is already connected to another account. Disconnect it there first.',
  permission_declined:
    'Connection cancelled. Meta needs permission to read your Page and its Lead Ads forms — approve the prompts to continue.',
  token_exchange_failed:
    'Meta rejected the connection. This is usually a temporary issue on their side — try again in a few minutes.',
  pages_lookup_failed:
    'We connected to Meta but couldn’t read your Pages. Try again shortly.',
  misconfigured:
    'Meta Ads isn’t configured correctly on our side. This one is on us — contact support and we’ll fix it.',
  invalid_state:
    'That connection link expired. Start the connection again from this page.',
}

function metaConnectMessage(reason: string | null): string {
  if (reason && META_ERROR_MESSAGES[reason]) return META_ERROR_MESSAGES[reason]
  return 'Couldn’t connect Meta Ads. Please try again, or contact support if it keeps happening.'
}

export default function MetaAds() {
  const toast = useToast()

  const [status, setStatus] = useState<MetaConnection | null | 'loading'>('loading')
  const [leads, setLeads] = useState<MetaLead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  // A connect failure is a persistent panel, not a toast. Every message here
  // takes 3.3-6.3s to read (measured) and the toast dismisses at 3s, so the
  // instructions were vanishing before a client could finish them. The panel
  // also sits next to the button they need to press again.
  const [connectError, setConnectError] = useState<string | null>(null)
  // #28: a client can connect many Pages. `pages` is the source of truth for
  // what is connected; `status` stays only for the legacy single-Page record
  // during M3's soak week.
  const [pages, setPages] = useState<MetaPageSummary[]>([])
  const [pagesLoading, setPagesLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [partial, setPartial] = useState<MetaConnectPagesResult | null>(null)
  const [removingPageId, setRemovingPageId] = useState<string | null>(null)
  // Same reasoning as connectError above: a client learning that Pages were
  // silently dropping leads needs to read WHICH Pages and decide what to do
  // about the gap. A 3s toast is the wrong surface for that, and this file
  // already made that call once.
  const [repaired, setRepaired] = useState<MetaPageRepaired[] | null>(null)

  function loadPages(): void {
    setPagesLoading(true)
    getConnectedMetaPages()
      .then((res) => setPages(res.success && res.data ? res.data : []))
      .finally(() => setPagesLoading(false))
  }

  useEffect(loadPages, [])

  // Repairs Pages that are claimed but not actually subscribed at Meta -- the
  // state a timed-out connect leaves behind, where this page says "Connected"
  // and not one lead ever arrives. The client cannot see it and retrying makes
  // it worse, because the picker shows the Page already ticked.
  //
  // Runs once on load and stays silent unless it actually fixed something:
  // server-side staleness gating means the usual answer costs no Graph calls.
  useEffect(() => {
    let cancelled = false

    // Once per browser session, not once per mount. The server gates on a 12h
    // staleness window, so a second mount inside that window re-does the whole
    // due-set computation to answer "nothing to do" -- and route re-entry or a
    // second tab makes that common.
    if (sessionStorage.getItem(VERIFY_ONCE_KEY)) return
    sessionStorage.setItem(VERIFY_ONCE_KEY, '1')

    verifyMetaPageSubscriptions()
      .then((res) => {
        if (cancelled || !res.success || !res.data) return
        if (res.data.repaired.length === 0) return

        setRepaired(res.data.repaired)
        loadPages()
      })
      // Silent on failure by design: this is a background repair, and a client
      // who came to read their leads should not be handed an error about a
      // maintenance pass they never asked for.
      .catch(() => {})

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRemovePage(page: MetaPageSummary): Promise<void> {
    // Confirm states the consequence in lead terms, not API terms.
    const ok = window.confirm(
      `Disconnect ${page.pageName}? Leads from this Page will stop arriving. Existing leads are kept.`
    )
    if (!ok) return

    setRemovingPageId(page.pageId)
    try {
      const res = await disconnectMetaPage(page.pageId)
      if (res.success) {
        toast.show(`${page.pageName} disconnected`, 'success')
        loadPages()
      } else {
        toast.show(res.error ?? 'Could not disconnect that Page.', 'error')
      }
    } catch {
      // Without this a network failure was an unhandled rejection and the row
      // just stopped spinning, leaving the Page looking connected with no word
      // either way. handleDisconnect already catches; this now matches.
      toast.show('Could not reach the server. That Page is still connected.', 'error')
    } finally {
      setRemovingPageId(null)
    }
  }

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
    if (metaParam === 'select_pages') {
      // OAuth is done and the user token is stored; the Pages themselves are
      // chosen here rather than picked for them by array order.
      setTokenExpired(false)
      setPickerOpen(true)
      window.history.replaceState({}, '', '/dashboard/meta-ads')
    } else if (metaParam === 'connected') {
      toast.show('Meta Ads connected successfully', 'success')
      window.history.replaceState({}, '', '/dashboard/meta-ads')
    } else if (metaParam === 'error') {
      setConnectError(metaConnectMessage(params.get('reason')))
      window.history.replaceState({}, '', '/dashboard/meta-ads')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleConnect() {
    // Clear a previous failure before leaving for Meta, so a stale message is
    // never sitting next to a fresh attempt when they come back.
    setConnectError(null)
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

  // Connected means "has at least one Page", not "has the legacy single-Page
  // record". The multi-Page flow never writes metaConnection, so reading that
  // here would show "Not Connected" beside a list of connected Pages.
  const isConnected = pages.length > 0 || (status !== 'loading' && status !== null && status.connected)

  // A client connected before the Page registry existed has a live
  // metaConnection and zero registry rows until the backfill reaches them.
  // Without this the header badge said "Connected" while the panel directly
  // below said "No Pages connected yet" and offered to connect -- for an
  // account whose leads were arriving normally the whole time.
  const legacyOnlyConnection =
    pages.length === 0 && status !== 'loading' && status !== null && status.connected

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
              <p className="text-xs text-gray-500">Connect the Facebook Pages your ads run from.</p>
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

        {/* Stays until dismissed or until they retry. Placed inside the
            connection card so the explanation and the button it refers to are
            the same object on screen. */}
        {connectError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
          >
            <TriangleAlert size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-red-800">Couldn&apos;t connect Meta Ads</p>
              <p className="text-sm text-red-700 mt-0.5">{connectError}</p>
            </div>
            <button
              type="button"
              onClick={() => setConnectError(null)}
              aria-label="Dismiss"
              className="text-red-400 hover:text-red-700 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Partial success uses a focusable summary, not a toast: a toast with no
            focus target and no per-Page detail is the documented anti-pattern,
            and this message names something the client may need to act on. */}
        {/* Persistent, not a toast: the client is learning that Pages were
            dropping leads for an unknown stretch, and needs to read which ones. */}
        {repaired && repaired.length > 0 && (
          <div
            role="alert"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            aria-labelledby="meta-repaired-title"
            className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4"
          >
            <h3 id="meta-repaired-title" className="font-semibold text-amber-900 text-sm" style={JAKARTA_FONT}>
              Reconnected {repaired.length} Page{repaired.length === 1 ? '' : 's'} that had stopped
              receiving leads
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              {repaired.map((r) => (
                <li key={r.pageId}>{r.pageName}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-amber-800">
              New leads from {repaired.length === 1 ? 'this Page' : 'these Pages'} will arrive
              normally. Leads submitted while the connection was broken did not reach us and cannot
              be recovered.
            </p>
            <button
              type="button"
              onClick={() => setRepaired(null)}
              className="mt-3 text-amber-900 font-medium text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {partial && partial.skipped.length > 0 && (
          <div
            role="alert"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            aria-labelledby="meta-partial-title"
            className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4"
          >
            <h3 id="meta-partial-title" className="font-semibold text-amber-900 text-sm" style={JAKARTA_FONT}>
              Connected {partial.connected.length} Page
              {partial.connected.length === 1 ? '' : 's'} · {partial.skipped.length} need
              {partial.skipped.length === 1 ? 's' : ''} attention
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-amber-800">
              {partial.skipped.map((s) => (
                <li key={s.pageId}>
                  {s.pageName} —{' '}
                  {skipReasonText(s.reason)}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setPartial(null)}
              className="mt-3 text-amber-900 font-medium text-sm underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Expiry is NOT the empty state. Rendering it as "no Pages" would tell
            the client their Pages are gone, when every connected Page is still
            receiving leads -- only Page management needs the user token. */}
        {tokenExpired && (
          <div role="alert" className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm text-amber-900">
              Your Facebook connection expired. Reconnect to manage Pages. Leads from
              already-connected Pages are unaffected.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              className="mt-3 inline-flex items-center gap-2 bg-white border border-amber-300 text-amber-900 font-medium px-3 py-2 rounded-xl text-sm hover:bg-amber-100 transition-colors"
            >
              Reconnect
            </button>
          </div>
        )}

        {pagesLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-[52px] bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : pages.length > 0 || legacyOnlyConnection ? (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                Connected Pages ({pages.length})
              </p>
              {pages.length === 0 && (
                // The legacy-connection case: leads are arriving, but this
                // account predates the per-Page registry so there is no row to
                // list yet. Saying so beats an empty list under a "Connected"
                // badge.
                <p className="mt-2 text-sm text-gray-500">
                  Your Facebook connection is active and leads are arriving. Choose Add Pages to see
                  every Page on this account and manage them individually.
                </p>
              )}
              <ul className="mt-2 divide-y divide-gray-50">
                {pages.map((page) => (
                  <li key={page.pageId} className="flex items-center justify-between gap-4 py-3 min-h-[52px]">
                    <div className="min-w-0">
                      <p className="text-base text-gray-900 truncate">{page.pageName}</p>
                      <p className="text-xs text-gray-400">{page.pageId}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePage(page)}
                      disabled={removingPageId === page.pageId}
                      className="text-red-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-red-50 transition-colors disabled:opacity-50 shrink-0"
                    >
                      {removingPageId === page.pageId ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center justify-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
              >
                Add Pages
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-red-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect all'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-3">
              No Pages connected yet. Connect the Facebook Pages your ads run from and their
              leads will appear in your inbox.
            </p>
            <button
              type="button"
              onClick={handleConnect}
              className="inline-flex items-center justify-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
            >
              Connect with Facebook
            </button>
          </div>
        )}
      </section>

      {pickerOpen && (
        <MetaPagePicker
          onClose={() => setPickerOpen(false)}
          onTokenExpired={() => {
            setPickerOpen(false)
            setTokenExpired(true)
          }}
          onConnected={(result) => {
            setPickerOpen(false)
            setPartial(result)
            loadPages()
            if (result.connected.length > 0) {
              toast.show(
                `Connected ${result.connected.length} Page${result.connected.length === 1 ? '' : 's'}`,
                'success'
              )
            }
          }}
        />
      )}

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
