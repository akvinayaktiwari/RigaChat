// The journey, drawn as the graph it actually is.
//
// Nodes are absolutely positioned from journey-graph.ts's layout; edges are one
// SVG layer underneath. There is no drag-to-connect and no free placement: the
// system owns layout, the operator owns logic. That is what makes it impossible
// to draw an unreadable graph by direct manipulation.

import { useMemo } from 'react'
import type { JourneyStep } from '../../types/index'
import { CANVAS_PADDING, layout } from '../../lib/journey-graph'
import { EDGE_KIND } from './node-kind'
import JourneyNode from './JourneyNode'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface JourneyGraphProps {
  steps: JourneyStep[]
  startStepId: string
  selectedStepId?: string | null
  onSelect?: (stepId: string) => void
}

export default function JourneyGraph({
  steps,
  startStepId,
  selectedStepId = null,
  onSelect,
}: JourneyGraphProps) {
  // Layout is pure and deterministic, so it only needs to run when the shape or
  // the labels actually change. Without this it would re-run on every parent
  // render and every keystroke in the form below.
  const graph = useMemo(() => layout(steps, startStepId), [steps, startStepId])
  const stepById = useMemo(() => new Map(steps.map((s) => [s.stepId, s])), [steps])
  const unreachable = useMemo(() => new Set(graph.unreachable), [graph.unreachable])

  if (steps.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-[#F8F7FF] p-10 text-center">
        <p className="text-sm text-gray-500">
          Add a step and the journey will draw itself here.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 overflow-auto bg-[#F8F7FF] [background-image:radial-gradient(#E9E5F6_1.1px,transparent_1.1px)] [background-size:16px_16px]">
      <div
        className="relative"
        style={{
          width: Math.max(graph.width, 320),
          height: Math.max(graph.height, 200) + CANVAS_PADDING,
        }}
      >
        <svg
          className="absolute inset-0 pointer-events-none overflow-visible"
          width={graph.width}
          height={graph.height}
          aria-hidden="true"
        >
          {graph.edges.map((edge, i) => {
            if (!edge.path) return null
            const kind = EDGE_KIND[edge.label]
            return (
              <path
                key={`${edge.from}-${edge.to}-${edge.label}-${i}`}
                d={edge.path}
                fill="none"
                stroke={kind.stroke}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )
          })}
        </svg>

        {graph.nodes.map((node) => {
          const step = stepById.get(node.stepId)
          if (!step) return null
          return (
            <div
              key={node.stepId}
              className="absolute"
              style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
            >
              {unreachable.has(node.stepId) && (
                <span className="absolute -top-2 left-3 z-10 text-[10px] font-bold tracking-[0.08em] uppercase bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5">
                  Not connected
                </span>
              )}
              <JourneyNode
                step={step}
                selected={selectedStepId === node.stepId}
                onSelect={() => onSelect?.(node.stepId)}
              />
            </div>
          )
        })}
      </div>

      {graph.unreachable.length > 0 && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-3">
          <p style={JAKARTA_FONT} className="text-[13px] font-bold text-red-800 mb-0.5">
            {graph.unreachable.length} step{graph.unreachable.length === 1 ? '' : 's'} will never run
          </p>
          <p className="text-[12.5px] text-red-900/80 leading-relaxed">
            Nothing points at{' '}
            {graph.unreachable
              .map((id) => stepById.get(id)?.name ?? id)
              .map((n) => `“${n}”`)
              .join(', ')}
            . Point an earlier step at{' '}
            {graph.unreachable.length === 1 ? 'it' : 'them'}, or delete{' '}
            {graph.unreachable.length === 1 ? 'it' : 'them'}.
          </p>
        </div>
      )}
    </div>
  )
}
