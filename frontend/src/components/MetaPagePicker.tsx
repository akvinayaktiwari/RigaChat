import { useEffect, useRef, useState } from 'react'
import { useDialogFocus } from '../hooks/useDialogFocus'
import { Check, Loader2, TriangleAlert, X } from 'lucide-react'
import { connectMetaPages, getSelectableMetaPages } from '../services/api'
import type { MetaConnectPagesResult, MetaSelectablePage } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

/**
 * 25 is a batch size, not a ceiling: each Page costs a webhook subscription
 * round trip against a 60s Lambda budget, so a client with 60 Pages connects
 * them in three passes rather than being told 25 is all they may ever have.
 *
 * The real number arrives with the Pages -- the server enforces it, so a
 * hard-coded copy here could drift above it and let someone compose a selection
 * that is refused only after they hit Connect. This is the fallback for a
 * response that somehow omits it.
 */
const DEFAULT_MAX_PER_BATCH = 25

interface MetaPagePickerProps {
  onClose: () => void
  onConnected: (result: MetaConnectPagesResult) => void
  /** Fired when Meta rejects the stored user token, so the parent can offer reconnect. */
  onTokenExpired: () => void
}

export default function MetaPagePicker({ onClose, onConnected, onTokenExpired }: MetaPagePickerProps) {
  const [pages, setPages] = useState<MetaSelectablePage[] | null>(null)
  const [maxPerBatch, setMaxPerBatch] = useState(DEFAULT_MAX_PER_BATCH)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // aria-modal="true" is a claim about the rest of the page being inert. Without
  // a trap it is just an attribute: a keyboard user Tabs straight out of the
  // dialog into the page behind it. Shared with Modal so there is one
  // implementation rather than two.
  useDialogFocus(dialogRef, onClose)

  useEffect(() => {
    let cancelled = false

    getSelectableMetaPages()
      .then((res) => {
        if (cancelled) return
        if (!res.success || !res.data) {
          // An expired user token is its own state, not an empty list. Telling
          // a client "no Pages" when their Pages are fine reads as data loss.
          if (res.error?.toLowerCase().includes('expired')) {
            onTokenExpired()
            return
          }
          setLoadError(res.error ?? 'Could not load your Pages.')
          return
        }
        setPages(res.data.pages)
        setMaxPerBatch(res.data.maxPerBatch || DEFAULT_MAX_PER_BATCH)
        // Every connectable Page starts selected: the client already answered
        // "which Pages?" on Meta's own consent screen, and asking again is what
        // produced the bug where approved Pages went unconnected.
        //
        // Capped at MAX_PER_BATCH on load too, not just in toggle(). Without
        // the slice, a client with 30 Pages opened the picker already holding
        // an invalid selection and only found out when the server rejected it
        // -- the exact "compose an invalid request, get rejected after" flow
        // the live cap exists to prevent.
        setSelected(
          new Set(
            res.data.pages
              .filter((p) => !p.connected && !p.unavailable)
              .slice(0, res.data.maxPerBatch || DEFAULT_MAX_PER_BATCH)
              .map((p) => p.pageId)
          )
        )
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not reach Meta. Try again shortly.')
      })

    return () => {
      cancelled = true
    }
  }, [onTokenExpired])

  const atCap = selected.size >= maxPerBatch

  function toggle(page: MetaSelectablePage): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(page.pageId)) {
        next.delete(page.pageId)
      } else if (next.size < maxPerBatch) {
        // Refused at the checkbox with the reason already visible, rather than
        // accepted and rejected after submit.
        next.add(page.pageId)
      }
      return next
    })
  }

  async function handleConnect(): Promise<void> {
    setSubmitting(true)
    try {
      const res = await connectMetaPages([...selected])
      if (res.success && res.data) {
        onConnected(res.data)
      } else {
        setLoadError(res.error ?? 'Could not connect those Pages.')
      }
    } catch {
      // A rejected promise here used to be an unhandled rejection: the spinner
      // stopped and the client was shown nothing at all, with their selection
      // still on screen looking as though nothing had been attempted.
      setLoadError('Could not reach Meta. Your Pages were not connected — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meta-picker-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 id="meta-picker-title" className="font-bold text-gray-900" style={JAKARTA_FONT}>
              Choose Facebook Pages
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Leads from every Page you connect arrive in your inbox.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] -mr-2 text-gray-400 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadError && (
            <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">
              <TriangleAlert size={16} className="shrink-0 mt-0.5" />
              {loadError}
            </div>
          )}

          {!pages && !loadError && (
            <div className="space-y-2" aria-busy="true">
              {/* Skeletons at the real row height so the panel does not jump. */}
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[52px] bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {pages?.length === 0 && (
            <p className="text-sm text-gray-500 py-6 text-center">
              No Facebook Pages found on this account. Create a Page you manage, then try again.
            </p>
          )}

          <ul className="space-y-1">
            {pages?.map((page) => {
              const isSelected = selected.has(page.pageId)
              const capBlocked = !isSelected && atCap
              const disabled = page.connected || page.unavailable || capBlocked

              return (
                <li key={page.pageId}>
                  <label
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 min-h-[52px] ${
                      disabled ? 'opacity-60' : 'hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={page.connected || isSelected}
                      disabled={disabled}
                      onChange={() => toggle(page)}
                      // Why it is disabled, on the control itself. The cap
                      // explanation lives in the footer, which a screen reader
                      // never reaches from here -- so a cap-disabled row
                      // announced only as "checkbox, dimmed", with no reason.
                      {...(capBlocked ? { 'aria-describedby': 'meta-picker-cap-reason' } : {})}
                      className="w-4 h-4 accent-violet-600 shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-base text-gray-900 truncate">{page.pageName}</span>
                      {page.connected && <span className="block text-xs text-emerald-600">Connected</span>}
                      {page.unavailable && (
                        <span className="block text-xs text-gray-500">Connected to another account</span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-gray-600" aria-live="polite">
            {selected.size} selected
            {/* amber-700, not amber-600: 600 on white is ~2.9:1, under AA for small text. */}
            {atCap && (
              <span id="meta-picker-cap-reason" className="text-amber-700">
                {' '}
                · {maxPerBatch} is the maximum per batch — deselect a Page to choose a different one
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={selected.size === 0 || submitting}
            className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {submitting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
