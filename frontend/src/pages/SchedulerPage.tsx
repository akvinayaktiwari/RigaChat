import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Info, Plus, Trash2, X } from 'lucide-react'
import {
  createScheduledAction,
  deleteScheduledAction,
  getLeadInbox,
  getScheduledActions,
  updateScheduledActionCadence,
} from '../services/api'
import { leadDetailPath } from '../lib/lead-ref'
import type { ScheduleCadence, ScheduledAction } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity'
const ghostButtonClasses = 'text-gray-600 font-medium rounded-xl hover:bg-gray-100 transition-colors'
const inputClasses =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'

const ACTION_TYPE_LABELS: Record<ScheduledAction['actionType'], string> = {
  weekly_report: 'Weekly WhatsApp report',
  lead_reminder: 'Lead reminder',
}

function describeCadence(cadence: ScheduleCadence): string {
  if (cadence.type === 'interval_days') {
    return `Every ${cadence.intervalDays} day${cadence.intervalDays === 1 ? '' : 's'}`
  }
  return `Once on ${new Date(cadence.at).toLocaleString()}`
}

function ListSkeleton() {
  return (
    <div className="space-y-3 mt-6">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-5 border border-black/5 animate-pulse h-20" />
      ))}
    </div>
  )
}

interface CadenceFormState {
  type: ScheduleCadence['type']
  intervalDays: string
  at: string
}

function cadenceFromForm(form: CadenceFormState): ScheduleCadence {
  if (form.type === 'interval_days') {
    return { type: 'interval_days', intervalDays: Number(form.intervalDays) || 1 }
  }
  return { type: 'one_off', at: new Date(form.at).toISOString() }
}

function formFromCadence(cadence: ScheduleCadence): CadenceFormState {
  if (cadence.type === 'interval_days') {
    return { type: 'interval_days', intervalDays: String(cadence.intervalDays), at: '' }
  }
  return { type: 'one_off', intervalDays: '7', at: cadence.at.slice(0, 16) }
}

const EMPTY_FORM: CadenceFormState = { type: 'interval_days', intervalDays: '7', at: '' }

export default function SchedulerPage() {
  const [actions, setActions] = useState<ScheduledAction[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAction, setModalAction] = useState<ScheduledAction | 'new' | null>(null)
  const [form, setForm] = useState<CadenceFormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionToDelete, setActionToDelete] = useState<ScheduledAction | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [leadLinks, setLeadLinks] = useState<Record<string, { name: string; href: string }>>({})

  useEffect(() => {
    getScheduledActions().then((res) => {
      setActions(res.data ?? [])
      setLoading(false)
    })
  }, [])

  // Resolve the raw leadIds on lead-scoped rows into names. Via the unified
  // inbox rather than getLeadById, which reads the chat leads table only -- a
  // journey can schedule a reminder for a form or Meta lead just as easily, and
  // those would resolve to nothing. Fetched only when a lead-scoped row exists,
  // and a failure degrades to the short id rather than blocking the page.
  useEffect(() => {
    if (!actions.some((action) => action.leadId)) return

    let cancelled = false
    getLeadInbox()
      .then((res) => {
        if (cancelled || !res.success) return
        const links: Record<string, { name: string; href: string }> = {}
        for (const lead of res.data ?? []) {
          links[lead.leadId] = {
            name: lead.name?.trim() || lead.phone || lead.email || 'Unnamed lead',
            href: leadDetailPath(lead.leadRef),
          }
        }
        setLeadLinks(links)
      })
      .catch(() => {
        /* keeps the short-id fallback below */
      })

    return () => {
      cancelled = true
    }
  }, [actions])

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalAction('new')
  }

  function openEdit(action: ScheduledAction) {
    setForm(formFromCadence(action.cadence))
    setFormError(null)
    setModalAction(action)
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    const cadence = cadenceFromForm(form)

    try {
      if (modalAction === 'new') {
        const res = await createScheduledAction({ actionType: 'weekly_report', cadence })
        if (res.success && res.data) {
          setActions((prev) => [...prev, res.data as ScheduledAction])
          setModalAction(null)
        } else {
          setFormError(res.error ?? 'Failed to create schedule')
        }
      } else if (modalAction) {
        const res = await updateScheduledActionCadence(modalAction.scheduleId, cadence)
        if (res.success && res.data) {
          setActions((prev) => prev.map((a) => (a.scheduleId === modalAction.scheduleId ? (res.data as ScheduledAction) : a)))
          setModalAction(null)
        } else {
          setFormError(res.error ?? 'Failed to update schedule')
        }
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!actionToDelete) return
    setDeleting(true)
    try {
      const res = await deleteScheduledAction(actionToDelete.scheduleId)
      if (res.success) {
        setActions((prev) => prev.filter((a) => a.scheduleId !== actionToDelete.scheduleId))
      }
    } catch (error) {
      console.error('Failed to delete scheduled action:', error)
    } finally {
      setDeleting(false)
      setActionToDelete(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
            Scheduler
          </h1>
          <p className="text-sm text-gray-500 mt-1">Recurring and one-off automated actions</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
        >
          <Plus size={16} />
          New Schedule
        </button>
      </div>

      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 mt-4 flex items-start gap-3">
        <Info size={18} className="text-violet-500 shrink-0 mt-0.5" />
        <p className="text-violet-700 text-sm">
          Weekly reports are self-serve here and send for real. Lead reminders are created automatically by a
          Journey and shown read-only below — they are scheduled and fire on time, but nothing is delivered to
          anyone yet, so cancelling one does not stop a message going out.
        </p>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <Clock className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            No schedules yet
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs mb-6">
            Set up a weekly WhatsApp report to get started
          </p>
          <button
            type="button"
            onClick={openCreate}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
          >
            <Plus size={16} />
            New Schedule
          </button>
        </div>
      ) : (
        <div className="space-y-3 mt-6">
          {actions.map((action) => (
            <div
              key={action.scheduleId}
              className="bg-white rounded-2xl border border-black/5 p-5 flex items-center justify-between hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-4">
                <div className="bg-violet-50 text-violet-500 rounded-xl p-2.5 w-10 h-10 flex items-center justify-center shrink-0">
                  <Clock size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900" style={JAKARTA_FONT}>
                      {ACTION_TYPE_LABELS[action.actionType]}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500">{describeCadence(action.cadence)}</p>
                  {action.leadId &&
                    (leadLinks[action.leadId] ? (
                      <Link
                        to={leadLinks[action.leadId].href}
                        className="text-xs text-violet-600 hover:underline mt-0.5 inline-block"
                      >
                        {leadLinks[action.leadId].name}
                      </Link>
                    ) : (
                      // Unresolved: the lead is older than the inbox window, or
                      // the inbox call failed. A short id beats a full uuid.
                      <p className="text-xs text-gray-400 mt-0.5">Lead {action.leadId.slice(0, 8)}</p>
                    ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(action)}
                  className={`px-3 py-2 text-xs ${ghostButtonClasses}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setActionToDelete(action)}
                  title="Delete schedule"
                  className="text-gray-400 hover:text-red-500 transition-colors p-2"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalAction && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 w-full max-w-md relative">
            <button
              type="button"
              onClick={() => setModalAction(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X size={20} />
            </button>

            <h2 className="font-bold text-xl text-gray-900 mb-5" style={JAKARTA_FONT}>
              {modalAction === 'new' ? 'New weekly report' : 'Edit schedule'}
            </h2>

            <label className={labelClasses}>Cadence</label>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: 'interval_days' }))}
                className={`flex-1 px-3 py-2 text-sm rounded-xl border transition-colors ${
                  form.type === 'interval_days'
                    ? 'border-violet-500 bg-violet-50 text-violet-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Recurring
              </button>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: 'one_off' }))}
                className={`flex-1 px-3 py-2 text-sm rounded-xl border transition-colors ${
                  form.type === 'one_off'
                    ? 'border-violet-500 bg-violet-50 text-violet-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                One-off
              </button>
            </div>

            {form.type === 'interval_days' ? (
              <div className="mb-4">
                <label className={labelClasses}>Every N days</label>
                <input
                  type="number"
                  min={1}
                  value={form.intervalDays}
                  onChange={(e) => setForm((f) => ({ ...f, intervalDays: e.target.value }))}
                  className={inputClasses}
                />
              </div>
            ) : (
              <div className="mb-4">
                <label className={labelClasses}>Send at</label>
                <input
                  type="datetime-local"
                  value={form.at}
                  onChange={(e) => setForm((f) => ({ ...f, at: e.target.value }))}
                  className={inputClasses}
                />
              </div>
            )}

            {formError && <p className="text-sm text-red-500 mb-4">{formError}</p>}

            <div className="flex items-center justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={() => setModalAction(null)}
                disabled={saving}
                className="text-gray-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={`px-4 py-2.5 text-sm ${primaryButtonClasses} disabled:opacity-50`}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {actionToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 max-w-sm w-full">
            <h2 className="font-bold text-xl text-gray-900" style={JAKARTA_FONT}>
              Delete this schedule?
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              {ACTION_TYPE_LABELS[actionToDelete.actionType]} — {describeCadence(actionToDelete.cadence)} will be
              cancelled.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setActionToDelete(null)}
                disabled={deleting}
                className="text-gray-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="bg-red-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
