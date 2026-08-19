// Presentation metadata per step type, and per edge label.
//
// Keyed by the unions themselves rather than looked up by string, so adding a
// step type or an edge label without describing how it looks is a compile
// error. The graph can never render a step as an unlabelled grey box.

import type { JourneyStep } from '../../types/index'
import type { EdgeLabel } from '../../lib/journey-graph'

export interface NodeKind {
  // What the step DOES, in the operator's words. Never the type name: an
  // operator configures an agent, they do not configure a `wait_and_recheck`.
  label: string
  glyph: string
  // Tailwind background for the glyph chip.
  chip: string
}

export const NODE_KIND: Record<JourneyStep['type'], NodeKind> = {
  send_message: { label: 'Sends a message', glyph: '✎', chip: 'bg-violet-600' },
  wait: { label: 'Waits', glyph: '◷', chip: 'bg-slate-500' },
  await_reply: { label: 'Waits for their reply', glyph: '⇄', chip: 'bg-sky-500' },
  wait_and_recheck: { label: 'Waits, then rechecks', glyph: '↻', chip: 'bg-amber-500' },
  condition: { label: 'Decides', glyph: '⑂', chip: 'bg-emerald-600' },
  tool_call: { label: 'Uses a tool', glyph: '⚙', chip: 'bg-pink-600' },
  human_handoff: { label: 'Hands to a human', glyph: '☎', chip: 'bg-red-600' },
}

export interface EdgeKind {
  // Shown on the rail and on the edge. Every outcome carries a word: nothing in
  // this graph may be signalled by colour alone.
  label: string
  glyph: string
  text: string
  bg: string
  stroke: string
}

export const EDGE_KIND: Record<EdgeLabel, EdgeKind> = {
  next: { label: '', glyph: '', text: 'text-gray-500', bg: 'bg-gray-100', stroke: '#D3CDE2' },
  yes: { label: 'YES', glyph: '✓', text: 'text-emerald-700', bg: 'bg-emerald-50', stroke: '#047857' },
  no: { label: 'NO', glyph: '✕', text: 'text-slate-500', bg: 'bg-slate-100', stroke: '#64748B' },
  replied: { label: 'REPLIED', glyph: '✓', text: 'text-emerald-700', bg: 'bg-emerald-50', stroke: '#047857' },
  no_reply: { label: 'NO REPLY', glyph: '⏱', text: 'text-amber-700', bg: 'bg-amber-50', stroke: '#B45309' },
  satisfied: { label: 'SATISFIED', glyph: '✓', text: 'text-emerald-700', bg: 'bg-emerald-50', stroke: '#047857' },
  exhausted: { label: 'EXHAUSTED', glyph: '⏱', text: 'text-amber-700', bg: 'bg-amber-50', stroke: '#B45309' },
}

// The two rails a branching step shows permanently, in the order they read.
// A step that simply continues has none.
export function railsFor(step: JourneyStep): [EdgeLabel, EdgeLabel] | null {
  switch (step.type) {
    case 'condition':
      return ['yes', 'no']
    case 'await_reply':
      return ['replied', 'no_reply']
    case 'wait_and_recheck':
      return ['satisfied', 'exhausted']
    default:
      return null
  }
}

const FIELD_LABELS: Record<string, string> = {
  replied: 'replied',
  lead_score: 'lead score',
  appointment_booked: 'appointment booked',
}

// Turns a condition into a sentence an operator reads, rather than a diamond
// they have to decode. Falls back to the raw comparison when the value is not
// yet filled in, so a half-built step still says something true.
export function conditionSentence(step: Extract<JourneyStep, { type: 'condition' }>): string {
  const field = FIELD_LABELS[step.field] ?? step.field
  const verb = step.operator === 'equals' ? 'is' : 'is not'
  if (!step.value) return `Is ${field} set?`
  return `Is ${field} ${verb} ${step.value}?`
}
