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

export const NODE_SIZE: Record<JourneyStep['type'], { w: number; h: number }> = {
  send_message: STANDARD_SIZE,
  wait: STANDARD_SIZE,
  tool_call: STANDARD_SIZE,
  human_handoff: STANDARD_SIZE,
  condition: FORK_SIZE,
  await_reply: FORK_SIZE,
  wait_and_recheck: LOOP_SIZE,
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
  for (const step of steps) {
    const size = NODE_SIZE[step.type]
    g.setNode(step.stepId, { width: size.w, height: size.h })
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
