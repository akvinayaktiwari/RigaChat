import { useState } from 'react'
import { AlertCircle, Loader2, X } from 'lucide-react'
import {
  changePlan,
  extendTrial,
  setOverrides,
  toggleInternal,
} from '../../services/adminApi'
import type {
  AdminAccountSummary,
  AdminSubscription,
  AuditAction,
  PlanTier,
  SubscriptionOverrides,
} from '../../services/adminApi'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const inputClasses =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'
const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-50'
const secondaryButtonClasses =
  'bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50'

const PLAN_OPTIONS: PlanTier[] = ['free', 'starter', 'growth', 'agency']
const VALID_PLANS = new Set<string>(PLAN_OPTIONS)

interface OverrideFieldState {
  mode: 'unset' | 'number' | 'unlimited'
  value: string
}

const EMPTY_OVERRIDE_FIELD: OverrideFieldState = { mode: 'unset', value: '' }

interface OverrideFormState {
  chatConversations: OverrideFieldState
  leadsMax: OverrideFieldState
  agentsMax: OverrideFieldState
  voiceMinutes: OverrideFieldState
}

function overrideFieldFromCurrent(value: number | null | undefined): OverrideFieldState {
  if (value === undefined) return EMPTY_OVERRIDE_FIELD
  if (value === null) return { mode: 'unlimited', value: '' }
  return { mode: 'number', value: String(value) }
}

function buildOverridesPayload(form: OverrideFormState): SubscriptionOverrides {
  const overrides: SubscriptionOverrides = {}

  function resolve(field: OverrideFieldState): number | null | undefined {
    if (field.mode === 'unset') return undefined
    if (field.mode === 'unlimited') return null
    const parsed = Number(field.value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  const chatConversations = resolve(form.chatConversations)
  if (chatConversations !== undefined) overrides.chat = { conversations: chatConversations }

  const leadsMax = resolve(form.leadsMax)
  if (leadsMax !== undefined) overrides.leads = { max: leadsMax }

  const agentsMax = resolve(form.agentsMax)
  if (agentsMax !== undefined) overrides.agents = { max: agentsMax }

  const voiceMinutes = resolve(form.voiceMinutes)
  if (voiceMinutes !== undefined) overrides.voice = { minutes: voiceMinutes }

  return overrides
}

function OverrideRow({
  label,
  field,
  onChange,
}: {
  label: string
  field: OverrideFieldState
  onChange: (next: OverrideFieldState) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-32 shrink-0 text-sm text-gray-700">{label}</label>
      <input
        type="number"
        value={field.value}
        disabled={field.mode === 'unlimited'}
        placeholder="plan default"
        onChange={(e) => onChange({ mode: e.target.value === '' ? 'unset' : 'number', value: e.target.value })}
        className={`${inputClasses} disabled:bg-gray-50 disabled:text-gray-400`}
      />
      <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
        <input
          type="checkbox"
          checked={field.mode === 'unlimited'}
          onChange={(e) => onChange(e.target.checked ? { mode: 'unlimited', value: '' } : EMPTY_OVERRIDE_FIELD)}
        />
        Unlimited
      </label>
    </div>
  )
}

interface AdminActionModalProps {
  account: AdminAccountSummary
  action: AuditAction
  token: string
  currentOverrides: SubscriptionOverrides | null
  onClose: () => void
  onSuccess: (updated: AdminSubscription) => void
}

export function AdminActionModal({ account, action, token, currentOverrides, onClose, onSuccess }: AdminActionModalProps) {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newIsInternal] = useState(!account.isInternal)
  const [newTrialEndsAt, setNewTrialEndsAt] = useState('')
  const [newPlan, setNewPlan] = useState<PlanTier>(VALID_PLANS.has(account.plan) ? (account.plan as PlanTier) : 'free')
  const [overridesForm, setOverridesForm] = useState<OverrideFormState>({
    chatConversations: overrideFieldFromCurrent(currentOverrides?.chat?.conversations),
    leadsMax: overrideFieldFromCurrent(currentOverrides?.leads?.max),
    agentsMax: overrideFieldFromCurrent(currentOverrides?.agents?.max),
    voiceMinutes: overrideFieldFromCurrent(currentOverrides?.voice?.minutes),
  })

  const reasonIsValid = reason.trim().length > 0

  async function handleSubmit() {
    setError(null)
    setSubmitting(true)

    try {
      let result
      if (action === 'toggle_internal') {
        result = await toggleInternal(token, account.accountId, newIsInternal, reason)
      } else if (action === 'extend_trial') {
        if (!newTrialEndsAt) {
          setError('Pick a date first.')
          setSubmitting(false)
          return
        }
        result = await extendTrial(token, account.accountId, `${newTrialEndsAt}T00:00:00.000Z`, reason)
      } else if (action === 'change_plan') {
        result = await changePlan(token, account.accountId, newPlan, reason)
      } else {
        result = await setOverrides(token, account.accountId, buildOverridesPayload(overridesForm), reason)
      }

      if (!result.success || !result.data) {
        setError(result.error ?? 'Action failed. Please try again.')
        setSubmitting(false)
        return
      }

      onSuccess(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed. Please try again.')
      setSubmitting(false)
    }
  }

  const title =
    action === 'toggle_internal'
      ? newIsInternal
        ? 'Mark as internal'
        : 'Remove internal status'
      : action === 'extend_trial'
        ? 'Extend trial'
        : action === 'change_plan'
          ? 'Change plan'
          : 'Set overrides'

  const description =
    action === 'toggle_internal'
      ? newIsInternal
        ? 'This account will be treated as internal — unlimited access, bypasses plan limits and billing.'
        : 'This account will no longer be treated as internal — real plan limits and billing apply.'
      : action === 'extend_trial'
        ? 'Only accounts with status "trialing" or "trial_expired" are eligible — the server will reject this otherwise.'
        : action === 'change_plan'
          ? `Current plan: ${account.plan}`
          : 'Leave a field blank to use the plan default, or check Unlimited. This is an escape hatch — no extra validation.'

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 w-full max-w-md relative">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          title="Close"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          <X size={20} />
        </button>

        <h2 className="font-bold text-xl text-gray-900 mb-1" style={JAKARTA_FONT}>
          {title}
        </h2>
        <p className="text-sm text-gray-500 mb-5">{description}</p>

        {action === 'extend_trial' && (
          <div className="mb-4">
            <label className={labelClasses}>New trial end date</label>
            <input
              type="date"
              value={newTrialEndsAt}
              onChange={(e) => setNewTrialEndsAt(e.target.value)}
              className={inputClasses}
            />
          </div>
        )}

        {action === 'change_plan' && (
          <div className="mb-4">
            <label className={labelClasses}>Plan</label>
            <select value={newPlan} onChange={(e) => setNewPlan(e.target.value as PlanTier)} className={inputClasses}>
              {PLAN_OPTIONS.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>
          </div>
        )}

        {action === 'set_overrides' && (
          <div className="mb-4 space-y-3">
            <OverrideRow
              label="Chat convos"
              field={overridesForm.chatConversations}
              onChange={(next) => setOverridesForm((prev) => ({ ...prev, chatConversations: next }))}
            />
            <OverrideRow
              label="CRM leads"
              field={overridesForm.leadsMax}
              onChange={(next) => setOverridesForm((prev) => ({ ...prev, leadsMax: next }))}
            />
            <OverrideRow
              label="Agents max"
              field={overridesForm.agentsMax}
              onChange={(next) => setOverridesForm((prev) => ({ ...prev, agentsMax: next }))}
            />
            <OverrideRow
              label="Voice minutes"
              field={overridesForm.voiceMinutes}
              onChange={(next) => setOverridesForm((prev) => ({ ...prev, voiceMinutes: next }))}
            />
          </div>
        )}

        <div>
          <label className={labelClasses}>Reason (required)</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you making this change?"
            className={`${inputClasses} resize-y`}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 text-red-600 text-sm flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} disabled={submitting} className={`px-4 py-2.5 text-sm ${secondaryButtonClasses}`}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !reasonIsValid}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {submitting ? 'Submitting...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
