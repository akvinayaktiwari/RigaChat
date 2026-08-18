import { describe, expect, it } from 'vitest'
import { edgesOf, layout, NODE_SIZE, reachableFrom } from './journey-graph'
import type { JourneyStep } from '../types/index'

function msg(stepId: string, next?: string): JourneyStep {
  return { stepId, name: stepId, type: 'send_message', ...(next ? { next } : {}) }
}
function fork(stepId: string, onTrue: string, onFalse: string): JourneyStep {
  return {
    stepId,
    name: stepId,
    type: 'condition',
    field: 'replied',
    operator: 'equals',
    value: 'true',
    onTrue,
    onFalse,
  }
}
function reply(stepId: string, next: string, onNoReply: string): JourneyStep {
  return { stepId, name: stepId, type: 'await_reply', next, onNoReply }
}
function loop(stepId: string, onSatisfied: string, onExhausted: string): JourneyStep {
  return {
    stepId,
    name: stepId,
    type: 'wait_and_recheck',
    waitDays: 2,
    maxIterations: 4,
    recheckField: 'replied',
    onSatisfied,
    onExhausted,
  }
}
function handoff(stepId: string): JourneyStep {
  return { stepId, name: stepId, type: 'human_handoff' }
}

describe('edgesOf', () => {
  it('emits one edge per populated pointer, labelled by the pointer that produced it', () => {
    const steps = [fork('a', 'b', 'c'), msg('b'), msg('c')]

    const edges = edgesOf(steps, 'a')

    expect(edges).toHaveLength(2)
    expect(edges.find((e) => e.to === 'b')?.label).toBe('yes')
    expect(edges.find((e) => e.to === 'c')?.label).toBe('no')
  })

  it('distinguishes await_reply outcomes from a plain next', () => {
    const steps = [reply('a', 'b', 'c'), msg('b'), msg('c')]

    const labels = edgesOf(steps, 'a').map((e) => e.label)

    expect(labels).toContain('replied')
    expect(labels).toContain('no_reply')
    expect(labels).not.toContain('next')
  })

  it('labels wait_and_recheck exits satisfied and exhausted', () => {
    const steps = [loop('a', 'b', 'c'), msg('b'), msg('c')]

    const labels = edgesOf(steps, 'a').map((e) => e.label).sort()

    expect(labels).toEqual(['exhausted', 'satisfied'])
  })

  it('emits nothing for a terminal step', () => {
    expect(edgesOf([handoff('a')], 'a')).toHaveLength(0)
  })

  it('drops a pointer at a step that does not exist', () => {
    // Saved data really can contain one: delete a step and anything aimed at it
    // dangles. A dangling edge would otherwise reach dagre and crash layout.
    const steps = [msg('a', 'ghost')]

    expect(edgesOf(steps, 'a')).toHaveLength(0)
  })

  // The whole reason back-edges are detected: they are drawn as the loop node's
  // own contained rail, never as a line crossing the canvas.
  it('marks an edge back to an ancestor as a back-edge', () => {
    const steps = [msg('a', 'b'), loop('b', 'c', 'a'), msg('c')]

    const edges = edgesOf(steps, 'a')
    const backToStart = edges.find((e) => e.from === 'b' && e.to === 'a')

    expect(backToStart?.isBackEdge).toBe(true)
    expect(edges.find((e) => e.from === 'b' && e.to === 'c')?.isBackEdge).toBe(false)
  })

  it('marks a self-loop as a back-edge', () => {
    const steps = [loop('a', 'b', 'a'), msg('b')]

    expect(edgesOf(steps, 'a').find((e) => e.to === 'a')?.isBackEdge).toBe(true)
  })

  // A step reachable down two separate branches is a merge, not a loop. Calling
  // it a back-edge would hide a legitimate edge from the layout.
  it('does not mistake a merge point for a loop', () => {
    const steps = [fork('a', 'b', 'c'), msg('b', 'd'), msg('c', 'd'), msg('d')]

    expect(edgesOf(steps, 'a').filter((e) => e.isBackEdge)).toHaveLength(0)
  })

  it('still emits edges inside a subgraph the start cannot reach', () => {
    const steps = [msg('a'), msg('orphan1', 'orphan2'), msg('orphan2')]

    expect(edgesOf(steps, 'a').find((e) => e.from === 'orphan1')).toBeTruthy()
  })
})

describe('reachableFrom', () => {
  it('follows back-edges rather than treating their target as unreachable', () => {
    const steps = [msg('a', 'b'), loop('b', 'c', 'a'), msg('c')]

    const reached = reachableFrom(steps, 'a', edgesOf(steps, 'a'))

    expect([...reached].sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing when the start step is not in the journey', () => {
    const steps = [msg('a')]

    expect(reachableFrom(steps, 'missing', edgesOf(steps, 'a')).size).toBe(0)
  })
})

describe('layout', () => {
  it('reports a step no path reaches', () => {
    const steps = [msg('a', 'b'), msg('b'), msg('stranded')]

    expect(layout(steps, 'a').unreachable).toEqual(['stranded'])
  })

  it('reports nothing unreachable for a fully connected journey', () => {
    const steps = [fork('a', 'b', 'c'), msg('b'), msg('c')]

    expect(layout(steps, 'a').unreachable).toHaveLength(0)
  })

  it('lays out a single step with no exits without error', () => {
    const result = layout([msg('only')], 'only')

    expect(result.nodes).toHaveLength(1)
    expect(result.edges).toHaveLength(0)
    expect(result.width).toBeGreaterThan(0)
  })

  it('handles an empty journey', () => {
    const result = layout([], '')

    expect(result.nodes).toHaveLength(0)
    expect(result.width).toBe(0)
  })

  it('sizes each node by its step type', () => {
    const steps = [fork('a', 'b', 'c'), loop('b', 'c', 'a'), msg('c')]

    const nodes = layout(steps, 'a').nodes
    const byId = new Map(nodes.map((n) => [n.stepId, n]))

    expect(byId.get('a')?.w).toBe(NODE_SIZE.condition.w)
    expect(byId.get('b')?.h).toBe(NODE_SIZE.wait_and_recheck.h)
    expect(byId.get('c')?.w).toBe(NODE_SIZE.send_message.w)
  })

  it('positions nodes by top-left, never off-canvas', () => {
    const steps = [fork('a', 'b', 'c'), msg('b'), msg('c')]

    for (const node of layout(steps, 'a').nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('gives every forward edge a path and every back-edge none', () => {
    const steps = [msg('a', 'b'), loop('b', 'c', 'a'), msg('c')]

    const edges = layout(steps, 'a').edges

    for (const edge of edges) {
      if (edge.isBackEdge) expect(edge.path).toBe('')
      else expect(edge.path).toMatch(/^M /)
    }
  })

  // A node that shifts on every keystroke is unusable, so layout must be a pure
  // function of the journey, not of call count.
  it('is deterministic across repeated calls', () => {
    const steps = [fork('a', 'b', 'c'), msg('b', 'd'), msg('c', 'd'), loop('d', 'e', 'a'), msg('e')]

    expect(JSON.stringify(layout(steps, 'a'))).toBe(JSON.stringify(layout(steps, 'a')))
  })

  it('lays out a journey whose only structure is a cycle', () => {
    const steps = [loop('a', 'b', 'a'), msg('b')]

    const result = layout(steps, 'a')

    expect(result.nodes).toHaveLength(2)
    expect(result.unreachable).toHaveLength(0)
  })
})
