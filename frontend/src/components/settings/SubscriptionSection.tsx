import { AlertTriangle, CheckCircle2, Clock, Sparkles, XCircle } from 'lucide-react'
import { nextTierUp } from '../../lib/pricingTiers'
import type { EntitlementFeatures, SubscriptionStatus, SubscriptionSummary } from '../../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const PLAN_LABELS: Record<SubscriptionSummary['plan'], string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  agency: 'Agency',
}

const STATUS_BADGES: Record<SubscriptionStatus, { label: string; icon: typeof CheckCircle2; classes: string }> = {
  trialing: { label: 'Trialing', icon: Clock, classes: 'bg-violet-50 text-violet-700 border-violet-200' },
  active: { label: 'Active', icon: CheckCircle2, classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  trial_expired: { label: 'Trial Expired', icon: AlertTriangle, classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  past_due: { label: 'Past Due', icon: AlertTriangle, classes: 'bg-amber-50 text-amber-700 border-amber-200' },
  suspended: { label: 'Suspended', icon: XCircle, classes: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelled', icon: XCircle, classes: 'bg-gray-100 text-gray-600 border-gray-200' },
}

function daysRemaining(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

function formatLimit(limit: number | null, unit: string): string {
  return limit === null ? `Unlimited ${unit}` : `${limit} ${unit}`
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-gray-900 text-right">{value}</span>
    </div>
  )
}

function describeFeatures(features: EntitlementFeatures): { chat: string; crm: string; agents: string; voice: string } {
  return {
    chat: features.chat.enabled
      ? `${formatLimit(features.chat.limits.conversations, 'conversations/month')}${features.chat.mode === 'degraded' ? ' (degraded)' : ''}`
      : 'Not included',
    crm: features.crm.enabled ? formatLimit(features.crm.limits.leads, 'leads') : 'Not included',
    agents: features.agents.enabled ? formatLimit(features.agents.limits.max, 'agents') : 'Not included',
    // Bare 'Not included' like its siblings: this string is the value in a row
    // already labelled "Voice", and the old copy rendered as "Voice  Voice: not
    // included".
    voice: features.voice.enabled ? formatLimit(features.voice.limits.minutes, 'minutes/month') : 'Not included',
  }
}

interface SubscriptionSectionProps {
  subscription: SubscriptionSummary
  onUpgradeClick: () => void
}

export default function SubscriptionSection({ subscription, onUpgradeClick }: SubscriptionSectionProps) {
  const { plan, status, trialEndsAt, features, usage } = subscription
  const badge = STATUS_BADGES[status]
  const BadgeIcon = badge.icon
  const limits = describeFeatures(features)
  const chatLimit = features.chat.limits.conversations
  // Nothing above agency, so the CTA would open a modal offering only plans the
  // account already has. Hide it rather than render a dead end.
  const canUpgrade = nextTierUp(plan) !== undefined
  const trialDaysLeft = status === 'trialing' && trialEndsAt ? daysRemaining(trialEndsAt) : null

  // `usage` is absent on a cache hit: subscription-cache.ts stores entitlements
  // but never the counter, because a stale "47 of 100" reads as authoritative
  // and is wrong the moment a conversation happens. The provider revalidates on
  // mount either way, so this shows for the length of one request and is
  // replaced by the real number. Absent means not loaded yet, never zero.
  const usageLabel = !usage
    ? 'Loading'
    : chatLimit === null
      ? `${usage.chatConversations} used`
      : `${usage.chatConversations} of ${chatLimit} used`

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-gray-50 mb-6">
        <h3 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
          Subscription
        </h3>
        {canUpgrade && (
          <button
            type="button"
            onClick={onUpgradeClick}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
          >
            <Sparkles size={14} />
            Upgrade plan
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl font-extrabold text-gray-900" style={JAKARTA_FONT}>
          {PLAN_LABELS[plan]}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-2.5 py-1 rounded-full ${badge.classes}`}
        >
          <BadgeIcon size={12} />
          {badge.label}
        </span>
      </div>

      {trialDaysLeft !== null && (
        <div className="mb-6 bg-violet-50 border border-violet-100 rounded-xl p-4 text-sm text-violet-700 flex items-center gap-2">
          <Clock size={16} className="shrink-0" />
          {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'} left in your trial
        </div>
      )}

      {(status === 'trial_expired' || status === 'suspended' || status === 'past_due') && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-center gap-2">
          <AlertTriangle size={16} className="shrink-0" />
          Your account is in a limited state. Contact us to restore full access.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Limits</p>
          <LimitRow label="Chat" value={limits.chat} />
          <LimitRow label="CRM" value={limits.crm} />
          <LimitRow label="Agents" value={limits.agents} />
          <LimitRow label="Voice" value={limits.voice} />
        </div>

        {features.chat.enabled && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Usage this period</p>
            <LimitRow label="Conversations" value={usageLabel} />
          </div>
        )}
      </div>
    </div>
  )
}
