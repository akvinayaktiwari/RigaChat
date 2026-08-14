import { describe, expect, it } from 'vitest'
import { leadInitials, leadStatus, leadUrgency } from './lead-display'
import type { LeadState, LeadStatus, UnifiedLead } from '../types/index'

const NOW = Date.parse('2026-08-14T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function at(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString()
}

function lead(state: Partial<LeadState> | null, createdAt = at(0)): UnifiedLead {
  return {
    leadId: 'lead-1',
    clientId: 'client-1',
    source: 'chat',
    leadRef: { source: 'chat', botId: 'bot-1', leadId: 'lead-1' },
    createdAt,
    state: state === null ? null : ({ status: 'new', notes: [], ...state } as LeadState),
  }
}

describe('leadStatus', () => {
  it('reads the status off the state row', () => {
    expect(leadStatus(lead({ status: 'qualified' }))).toBe('qualified')
  })

  // Absence is the value: no state row means nobody has opened it, which is
  // exactly what 'new' means. See UnifiedLead.state.
  it('reports a lead with no state row as new', () => {
    expect(leadStatus(lead(null))).toBe('new')
  })
})

describe('leadUrgency', () => {
  it('labels a closed lead with its outcome', () => {
    expect(leadUrgency(lead({ status: 'closed', outcome: 'won' }), NOW)).toEqual({
      label: 'Won',
      tone: 'quiet',
    })
  })

  it('falls back to Closed when a closed lead has no outcome', () => {
    expect(leadUrgency(lead({ status: 'closed' }), NOW)).toEqual({
      label: 'Closed',
      tone: 'quiet',
    })
  })

  it('counts whole days overdue', () => {
    const urgency = leadUrgency(lead({ nextActionAt: at(-3 * DAY_MS) }), NOW)
    expect(urgency).toEqual({ label: 'Overdue 3d', tone: 'overdue' })
  })

  it('says Due now for something overdue by less than a day', () => {
    const urgency = leadUrgency(lead({ nextActionAt: at(-1000) }), NOW)
    expect(urgency).toEqual({ label: 'Due now', tone: 'overdue' })
  })

  // The boundary the sort depends on: due exactly now is overdue, not scheduled.
  it('treats a next action due exactly now as overdue', () => {
    expect(leadUrgency(lead({ nextActionAt: at(0) }), NOW).tone).toBe('overdue')
  })

  it('says Due today inside the next day', () => {
    expect(leadUrgency(lead({ nextActionAt: at(DAY_MS / 2) }), NOW)).toEqual({
      label: 'Due today',
      tone: 'due',
    })
  })

  it('counts days ahead beyond tomorrow', () => {
    expect(leadUrgency(lead({ nextActionAt: at(3 * DAY_MS) }), NOW)).toEqual({
      label: 'In 3d',
      tone: 'scheduled',
    })
  })

  it('reports how long an untouched lead has been waiting', () => {
    expect(leadUrgency(lead(null, at(-2 * DAY_MS)), NOW)).toEqual({
      label: 'Waiting 2d',
      tone: 'waiting',
    })
  })

  it('says New today for a lead captured in the last day', () => {
    expect(leadUrgency(lead(null, at(-1000)), NOW)).toEqual({
      label: 'New today',
      tone: 'waiting',
    })
  })

  it('flags a worked lead with no scheduled follow-up', () => {
    expect(leadUrgency(lead({ status: 'contacted' }), NOW)).toEqual({
      label: 'No next step',
      tone: 'quiet',
    })
  })

  // Closed wins over a stale next action, matching the server's branch order.
  it('prefers closed over a next action still on the row', () => {
    const urgency = leadUrgency(
      lead({ status: 'closed', outcome: 'lost', nextActionAt: at(-5 * DAY_MS) }),
      NOW
    )
    expect(urgency).toEqual({ label: 'Lost', tone: 'quiet' })
  })
})

// ---------------------------------------------------------------------------
// The frontend renders the label; backend/src/services/lead-inbox-service.ts
// decides the row's position. They are two independent implementations of the
// same rule, and nothing but this test stops them drifting -- at which point a
// row reading "Overdue" sorts below one that does not, and the queue silently
// stops being a queue.
//
// TIER_* is a hand-copy of lead-inbox-service.ts:78-82. Be honest about what
// that buys: this catches the frontend drifting from the rule, and the server
// side is held by lead-inbox-service.test.ts's own ordering tests. It does NOT
// auto-fail if the backend constants change -- nothing imports across the two
// packages -- so changing the server's tiers means updating this copy in the
// same commit. The pairing is the guard, not this file alone.
// ---------------------------------------------------------------------------
const TIER_OVERDUE = 0
const TIER_UNTOUCHED = 1
const TIER_SCHEDULED = 2
const TIER_IN_PROGRESS = 3
const TIER_CLOSED = 4

function serverTier(l: UnifiedLead, now: number): number {
  const state = l.state
  if (state?.status === 'closed') return TIER_CLOSED
  if (state?.nextActionAt) {
    return Date.parse(state.nextActionAt) <= now ? TIER_OVERDUE : TIER_SCHEDULED
  }
  if (!state || state.status === 'new') return TIER_UNTOUCHED
  return TIER_IN_PROGRESS
}

// 'quiet' covers two server tiers, so the label disambiguates: only the
// in-progress branch produces 'No next step'.
function tierFromUrgency(l: UnifiedLead, now: number): number {
  const { tone, label } = leadUrgency(l, now)
  switch (tone) {
    case 'overdue':
      return TIER_OVERDUE
    case 'waiting':
      return TIER_UNTOUCHED
    case 'due':
    case 'scheduled':
      return TIER_SCHEDULED
    case 'quiet':
      return label === 'No next step' ? TIER_IN_PROGRESS : TIER_CLOSED
  }
}

describe('leadUrgency agrees with the server-side sort', () => {
  const cases: Array<{ name: string; lead: UnifiedLead }> = [
    { name: 'no state row', lead: lead(null) },
    { name: 'explicitly new', lead: lead({ status: 'new' }) },
    { name: 'overdue by days', lead: lead({ nextActionAt: at(-3 * DAY_MS) }) },
    { name: 'overdue by seconds', lead: lead({ nextActionAt: at(-1000) }) },
    { name: 'due exactly now', lead: lead({ nextActionAt: at(0) }) },
    { name: 'due within a day', lead: lead({ nextActionAt: at(DAY_MS / 2) }) },
    { name: 'scheduled ahead', lead: lead({ nextActionAt: at(5 * DAY_MS) }) },
    { name: 'contacted, no next step', lead: lead({ status: 'contacted' }) },
    { name: 'qualified, no next step', lead: lead({ status: 'qualified' }) },
    { name: 'closed won', lead: lead({ status: 'closed', outcome: 'won' }) },
    { name: 'closed, no outcome', lead: lead({ status: 'closed' }) },
    {
      name: 'closed with a stale next action',
      lead: lead({ status: 'closed', outcome: 'lost', nextActionAt: at(-DAY_MS) }),
    },
  ]

  for (const { name, lead: fixture } of cases) {
    it(`places "${name}" in the same tier as the server`, () => {
      expect(tierFromUrgency(fixture, NOW)).toBe(serverTier(fixture, NOW))
    })
  }

  // A worked lead with an outcome set but not closed must not read as closed:
  // outcome is only meaningful alongside status 'closed'.
  it('ignores an outcome on a lead that is not closed', () => {
    const fixture = lead({ status: 'contacted', outcome: 'won' })
    expect(leadUrgency(fixture, NOW).label).toBe('No next step')
    expect(tierFromUrgency(fixture, NOW)).toBe(serverTier(fixture, NOW))
  })

  it('orders every status without a next action ahead of closed', () => {
    const statuses: LeadStatus[] = ['new', 'contacted', 'qualified']
    for (const status of statuses) {
      const open = lead({ status })
      const closed = lead({ status: 'closed' })
      expect(tierFromUrgency(open, NOW)).toBeLessThan(tierFromUrgency(closed, NOW))
    }
  })
})

describe('leadInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(leadInitials('Vinayak Tiwari')).toBe('VT')
  })

  it('caps at two initials', () => {
    expect(leadInitials('Ada Grace Byron King')).toBe('AG')
  })

  it('handles a single name', () => {
    expect(leadInitials('Vinayak')).toBe('V')
  })

  it('falls back to ? for a missing name', () => {
    expect(leadInitials(undefined)).toBe('?')
    expect(leadInitials('')).toBe('?')
  })
})
