// Turns a JourneyBundle's flat `steps` array into a laid-out graph.
//
// The journey is already a directed graph -- structure lives entirely in the
// `next` / `onTrue` / `onFalse` / `onSatisfied` / `onExhausted` / `onNoReply`
// pointers on each step. Nothing rendered those, so the builder showed a
// numbered list and the operator could not see the shape of what they built.
//
// This module is deliberately pure and DOM-free: it is where the graph model
// is proven correct, against assertions rather than pixels.
//
// WHY DAGRE AND NOT REACT FLOW
//   The design forbids dragging nodes and drawing edges, which removes the only
//   reason to adopt a canvas framework. What is actually needed is layout, then
//   render. Dagre is layout-only, has no React dependency and no rendering
//   opinion. React Flow would add interaction machinery the design rejects and
//   then have to be fought to disable it.

import dagre from '@dagrejs/dagre'
import type { JourneyStep } from '../types/index'

// Which pointer produced an edge. The label is not decoration: every branch is
// rendered with a visible word, because no outcome in this UI may be signalled
// by colour alone.
export type EdgeLabel =
  | 'next'
  | 'yes'
  | 'no'
  | 'satisfied'
  | 'exhausted'
  | 'replied'
  | 'no_reply'

export interface GraphEdge {
  from: string
  to: string
  label: EdgeLabel
  // True when this edge points back at a step already on the path from the
  // start, i.e. it closes a loop. Excluded from layout and drawn as the loop
  // node's own contained rail instead. A backward diagonal crossing the canvas
  // is exactly the spaghetti the design is trying to avoid.
  isBackEdge: boolean
}

export interface LaidOutNode {
  stepId: string
  // Top-left, not centre. Dagre reports centres; every consumer here positions
  // an absolutely-placed div, so the conversion happens once, here.
  x: number
  y: number
  w: number
  h: number
}

export interface LaidOutEdge extends GraphEdge {
  // SVG path data. Empty for back-edges, which are node-local decoration.
  path: string
}

export interface JourneyLayout {
  nodes: LaidOutNode[]
  edges: LaidOutEdge[]
  // Steps that no path from startStepId reaches. These can exist in saved data
  // and will never run. Surfacing them is the main payoff of having a real
  // graph rather than a list.
  unreachable: string[]
  width: number
  height: number
}

// A step with two exits earns two labelled rails, so it needs a taller card
// than a step that simply continues. await_reply is sized with the fork rather
// than the standard node for that reason: it branches on whether the lead
// answered, and both outcomes must be readable without hovering.
const FORK_SIZE = { w: 272, h: 144 }
const LOOP_SIZE = { w: 288, h: 176 }
const STANDARD_SIZE = { w: 248, h: 112 }

// Minimums. Real height is computed per node by nodeHeight() below, because a
// fixed height silently overflows: a two-line title plus a two-line reason
// needs ~127px and the standard card reserved 112, so the last line rendered
// outside the card border.
export const NODE_SIZE: Record<JourneyStep['type'], { w: number; h: number }> = {
  send_message: STANDARD_SIZE,
  wait: STANDARD_SIZE,
  tool_call: STANDARD_SIZE,
  human_handoff: STANDARD_SIZE,
  condition: FORK_SIZE,
  await_reply: FORK_SIZE,
  wait_and_recheck: LOOP_SIZE,
}


// Vertical rhythm inside a node, in px. Kept next to the component's own
// classes: JourneyNode uses px-4 py-3.5, a 15px kind row, 14.5px/1.375 title
// and 12.5px/1.375 detail text.
const PAD_Y = 28
const KIND_ROW = 21
const TITLE_LINE = 20
const DETAIL_LINE = 17
const RAILS = 38
const GAP = 6

// Rough characters-per-line for a given font size at a given box width. An
// estimate, not a measurement -- dagre needs sizes BEFORE anything renders, so
// there is nothing to measure yet. JourneyNode clamps and clips to whatever
// this reserves, so an underestimate truncates rather than overflowing.
function lineCount(text: string | undefined, width: number, pxPerChar: number, max = 3): number {
  if (!text) return 0
  const perLine = Math.max(1, Math.floor((width - 32) / pxPerChar))
  return Math.min(max, Math.max(1, Math.ceil(text.length / perLine)))
}

function detailTextOf(step: JourneyStep): string | undefined {
  switch (step.type) {
    case 'send_message':
      return step.messageHint ?? 'The agent writes this itself'
    case 'wait':
      return `${step.waitDays} days`
    case 'await_reply':
      return step.promptHint ?? 'Pauses until the lead answers'
    case 'tool_call':
      return step.toolName || 'No tool chosen yet'
    case 'human_handoff':
      return step.reason ?? 'Ends the journey and alerts a human'
    case 'wait_and_recheck':
      // Two fixed lines: cadence, then the field being checked.
      return undefined
    case 'condition':
      return undefined
  }
}

// The height this step's content actually needs.
export function nodeHeight(step: JourneyStep): number {
  const { w, h } = NODE_SIZE[step.type]
  const title = step.type === 'condition' ? conditionText(step) : step.name

  let height = PAD_Y + KIND_ROW + GAP
  height += lineCount(title, w, 7.4, 3) * TITLE_LINE

  if (step.type === 'wait_and_recheck') {
    height += 2 * DETAIL_LINE
  } else {
    height += lineCount(detailTextOf(step), w, 6.3, 2) * DETAIL_LINE
  }

  if (step.type === 'condition' || step.type === 'await_reply' || step.type === 'wait_and_recheck') {
    height += RAILS
  }

  return Math.max(h, height)
}


// One height per STEP TYPE, sized to the tallest card of that type in this
// journey.
//
// Uniform within a type rather than across all of them: the design tells a
// loop from a message by silhouette, so forcing every node to one height would
// erase the distinction the graph depends on. Uniform per type keeps peers
// aligned -- which is what "ragged" actually meant -- while a loop stays
// visibly a loop.
//
// Bounded by construction: lineCount() caps titles at 3 lines and details at
// 2, so one pathologically long name cannot inflate every card in its class.
export function uniformHeights(steps: JourneyStep[]): Record<JourneyStep['type'], number> {
  const heights = { ...NODE_SIZE } as unknown as Record<JourneyStep['type'], number>
  for (const key of Object.keys(NODE_SIZE) as Array<JourneyStep['type']>) {
    heights[key] = NODE_SIZE[key].h
  }
  for (const step of steps) {
    heights[step.type] = Math.max(heights[step.type], nodeHeight(step))
  }
  return heights
}

// Mirrors conditionSentence() in components/journey/node-kind.ts. Duplicated
// rather than imported so this pure layout module keeps no dependency on the
// component layer; only its LENGTH matters here.
function conditionText(step: Extract<JourneyStep, { type: 'condition' }>): string {
  return step.value ? `Is ${step.field} ${step.operator} ${step.value}?` : `Is ${step.field} set?`
}

export const BRANCH_GAP = 64
export const RANK_GAP = 44
export const CANVAS_PADDING = 56

// Every outgoing pointer on every step type, in one place. Adding a step type
// to the union without describing its exits here is a compile error, so the
// graph can never silently omit an edge the executor will actually follow.
function exitsOf(step: JourneyStep): Array<{ to: string; label: EdgeLabel }> {
  switch (step.type) {
    case 'send_message':
    case 'wait':
    case 'tool_call':
      return step.next ? [{ to: step.next, label: 'next' }] : []
    case 'condition':
      return [
        ...(step.onTrue ? [{ to: step.onTrue, label: 'yes' as const }] : []),
        ...(step.onFalse ? [{ to: step.onFalse, label: 'no' as const }] : []),
      ]
    case 'await_reply':
      return [
        ...(step.next ? [{ to: step.next, label: 'replied' as const }] : []),
        ...(step.onNoReply ? [{ to: step.onNoReply, label: 'no_reply' as const }] : []),
      ]
    case 'wait_and_recheck':
      return [
        ...(step.onSatisfied ? [{ to: step.onSatisfied, label: 'satisfied' as const }] : []),
        ...(step.onExhausted ? [{ to: step.onExhausted, label: 'exhausted' as const }] : []),
      ]
    case 'human_handoff':
      return []
  }
}

// Depth-first from the start, marking any edge that targets a step currently on
// the stack. That is the textbook back-edge test, and it is the one that
// matches what a human means by "this loops": the target is an ancestor of the
// source, not merely a step that was visited earlier down some other branch.
//
// A pointer to a step that does not exist is dropped rather than emitted. Saved
// data can contain one (delete a step, and anything aimed at it dangles), and a
// dangling edge would otherwise crash layout.
export function edgesOf(steps: JourneyStep[], startStepId?: string): GraphEdge[] {
  const byId = new Map(steps.map((s) => [s.stepId, s]))
  const edges: GraphEdge[] = []
  const seen = new Set<string>()
  const onStack = new Set<string>()

  function walk(stepId: string): void {
    const step = byId.get(stepId)
    if (!step) return
    seen.add(stepId)
    onStack.add(stepId)

    for (const { to, label } of exitsOf(step)) {
      if (!byId.has(to)) continue
      edges.push({ from: stepId, to, label, isBackEdge: onStack.has(to) })
      if (!seen.has(to)) walk(to)
    }

    onStack.delete(stepId)
  }

  // Start where the executor starts. Then sweep anything the start could not
  // reach, so an orphaned subgraph still renders its own internal edges instead
  // of appearing as a pile of disconnected cards.
  const entry = startStepId && byId.has(startStepId) ? startStepId : steps[0]?.stepId
  if (entry) walk(entry)
  for (const step of steps) {
    if (!seen.has(step.stepId)) walk(step.stepId)
  }

  return edges
}

// Breadth-first over every edge, back-edges included: a loop back into the
// graph does not make its target unreachable.
export function reachableFrom(
  steps: JourneyStep[],
  startStepId: string,
  edges: GraphEdge[]
): Set<string> {
  const byId = new Map(steps.map((s) => [s.stepId, s]))
  const out = new Map<string, string[]>()
  for (const edge of edges) {
    const list = out.get(edge.from)
    if (list) list.push(edge.to)
    else out.set(edge.from, [edge.to])
  }

  const reached = new Set<string>()
  if (!byId.has(startStepId)) return reached

  const queue = [startStepId]
  reached.add(startStepId)
  while (queue.length > 0) {
    const current = queue.shift() as string
    for (const next of out.get(current) ?? []) {
      if (reached.has(next)) continue
      reached.add(next)
      queue.push(next)
    }
  }
  return reached
}

function pathFrom(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  return `M ${first.x} ${first.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join('')
}

export function layout(steps: JourneyStep[], startStepId: string): JourneyLayout {
  const edges = edgesOf(steps, startStepId)
  const reached = reachableFrom(steps, startStepId, edges)
  const unreachable = steps.filter((s) => !reached.has(s.stepId)).map((s) => s.stepId)

  if (steps.length === 0) {
    return { nodes: [], edges: [], unreachable: [], width: 0, height: 0 }
  }

  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({
    rankdir: 'TB',
    nodesep: BRANCH_GAP,
    ranksep: RANK_GAP,
    marginx: CANVAS_PADDING,
    marginy: CANVAS_PADDING,
  })
  g.setDefaultEdgeLabel(() => ({}))

  // Insertion order follows `steps`, which is stable across calls. Dagre is
  // deterministic given the same insertion order, which is what makes repeated
  // layouts of an unchanged journey produce identical coordinates -- a node
  // that jumps on every keystroke is unusable.
  // Every card of a given type gets the same height, so peers line up.
  const heights = uniformHeights(steps)
  for (const step of steps) {
    g.setNode(step.stepId, { width: NODE_SIZE[step.type].w, height: heights[step.type] })
  }

  // Back-edges are excluded: they are drawn as the loop node's own rail, and
  // feeding a cycle to dagre makes it invent a reversed edge that would render
  // as a line crossing the graph.
  for (const edge of edges) {
    if (edge.isBackEdge) continue
    g.setEdge(edge.from, edge.to, {}, edge.label)
  }

  dagre.layout(g)

  const nodes: LaidOutNode[] = steps.map((step) => {
    const positioned = g.node(step.stepId) as { x: number; y: number; width: number; height: number }
    return {
      stepId: step.stepId,
      x: positioned.x - positioned.width / 2,
      y: positioned.y - positioned.height / 2,
      w: positioned.width,
      h: positioned.height,
    }
  })

  const laidOutEdges: LaidOutEdge[] = edges.map((edge) => {
    if (edge.isBackEdge) return { ...edge, path: '' }
    const routed = g.edge(edge.from, edge.to, edge.label) as
      | { points?: Array<{ x: number; y: number }> }
      | undefined
    return { ...edge, path: pathFrom(routed?.points ?? []) }
  })

  const graph = g.graph() as { width?: number; height?: number }

  return {
    nodes,
    edges: laidOutEdges,
    unreachable,
    width: graph.width ?? 0,
    height: graph.height ?? 0,
  }
}
