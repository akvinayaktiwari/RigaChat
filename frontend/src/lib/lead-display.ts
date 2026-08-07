import type { LeadOutcome, LeadSource, LeadStatus, UnifiedLead } from '../types/index'

const DAY_MS = 24 * 60 * 60 * 1000

export const SOURCE_LABELS: Record<LeadSource, string> = {
  chat: 'Chatbot',
  form: 'Form',
  meta: 'Meta Ads',
}

export const SOURCE_BADGE_CLASSES: Record<LeadSource, string> = {
  chat: 'bg-violet-50 text-violet-700 border-violet-200',
  form: 'bg-sky-50 text-sky-700 border-sky-200',
  meta: 'bg-blue-50 text-blue-700 border-blue-200',
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  closed: 'Closed',
}

export const STATUS_BADGE_CLASSES: Record<LeadStatus, string> = {
  new: 'bg-amber-50 text-amber-700 border-amber-200',
  contacted: 'bg-sky-50 text-sky-700 border-sky-200',
  qualified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
}

export const OUTCOME_LABELS: Record<LeadOutcome, string> = {
  won: 'Won',
  lost: 'Lost',
  unreachable: 'Unreachable',
}

export const STATUS_ORDER: LeadStatus[] = ['new', 'contacted', 'qualified', 'closed']
export const OUTCOME_ORDER: LeadOutcome[] = ['won', 'lost', 'unreachable']

// No state row means nobody has opened this lead yet, which is exactly what
// 'new' means. The absence is the value — see UnifiedLead.state.
export function leadStatus(lead: UnifiedLead): LeadStatus {
  return lead.state?.status ?? 'new'
}

export type UrgencyTone = 'overdue' | 'due' | 'waiting' | 'scheduled' | 'quiet'

export interface Urgency {
  label: string
  tone: UrgencyTone
}

function overdueLabel(dueMs: number, now: number): string {
  const days = Math.floor((now - dueMs) / DAY_MS)
  if (days >= 1) return `Overdue ${days}d`
  return 'Due now'
}

function waitingLabel(createdAt: string, now: number): string {
  const days = Math.floor((now - Date.parse(createdAt)) / DAY_MS)
  if (days >= 1) return `Waiting ${days}d`
  return 'New today'
}

// The one number a salesperson actually needs on a list row: how late am I.
// Mirrors the tiers lead-inbox-service.ts sorts by, so the label always agrees
// with the position — a row that says "Overdue" is never below one that doesn't.
export function leadUrgency(lead: UnifiedLead, now: number): Urgency {
  const state = lead.state

  if (state?.status === 'closed') {
    const outcome = state.outcome ? OUTCOME_LABELS[state.outcome] : 'Closed'
    return { label: outcome, tone: 'quiet' }
  }

  if (state?.nextActionAt) {
    const due = Date.parse(state.nextActionAt)
    if (due <= now) return { label: overdueLabel(due, now), tone: 'overdue' }
    const days = Math.ceil((due - now) / DAY_MS)
    return { label: days <= 1 ? 'Due today' : `In ${days}d`, tone: days <= 1 ? 'due' : 'scheduled' }
  }

  if (!state || state.status === 'new') {
    return { label: waitingLabel(lead.createdAt, now), tone: 'waiting' }
  }

  return { label: 'No next step', tone: 'quiet' }
}

export const URGENCY_CLASSES: Record<UrgencyTone, string> = {
  overdue: 'bg-red-50 text-red-700 border-red-200',
  due: 'bg-orange-50 text-orange-700 border-orange-200',
  waiting: 'bg-amber-50 text-amber-700 border-amber-200',
  scheduled: 'bg-gray-50 text-gray-600 border-gray-200',
  quiet: 'bg-gray-50 text-gray-400 border-gray-200',
}

export function leadInitials(name: string | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
