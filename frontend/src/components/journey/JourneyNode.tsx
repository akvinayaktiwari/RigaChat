// One step, drawn as a card.
//
// Three silhouettes, and which one a step gets is decided by its shape in the
// data, not by taste:
//   - a step that simply continues        -> standard card
//   - a step with two outcomes            -> fork card, both rails always visible
//   - wait_and_recheck                    -> loop capsule, the only node with a
//                                            return rail and an iteration badge
//
// The rails are never hover-revealed. An operator scanning this graph has to be
// able to answer "what happens if they don't reply" without touching anything.

import type { JourneyStep } from '../../types/index'
import { conditionSentence, EDGE_KIND, NODE_KIND, railsFor } from './node-kind'
import type { EdgeLabel } from '../../lib/journey-graph'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const MONO_FONT = { fontFamily: "'JetBrains Mono', ui-monospace, monospace" }

interface JourneyNodeProps {
  step: JourneyStep
  selected: boolean
  onSelect: () => void
}

function KindRow({ step }: { step: JourneyStep }) {
  const kind = NODE_KIND[step.type]
  return (
    <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-[0.11em] uppercase text-gray-400">
      <span
        className={`w-[15px] h-[15px] rounded-[5px] grid place-items-center text-[9px] text-white ${kind.chip}`}
        aria-hidden="true"
      >
        {kind.glyph}
      </span>
      {kind.label}
    </div>
  )
}

function Rail({ label }: { label: EdgeLabel }) {
  const edge = EDGE_KIND[label]
  return (
    <div
      className={`flex-1 rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold tracking-[0.08em] flex items-center gap-1.5 ${edge.bg} ${edge.text}`}
    >
      <span aria-hidden="true">{edge.glyph}</span>
      {edge.label}
    </div>
  )
}

function Mono({ children }: { children: string }) {
  return (
    <code
      style={MONO_FONT}
      className="text-[11.5px] bg-gray-100 rounded px-1.5 py-0.5 text-gray-700"
    >
      {children}
    </code>
  )
}

// The one or two lines under the title. Says what the step will actually do
// with the values the operator has entered, so an unconfigured step reads as
// unconfigured rather than as finished.
function Detail({ step }: { step: JourneyStep }) {
  switch (step.type) {
    case 'send_message':
      return step.messageHint ? (
        <p className="text-[12.5px] text-gray-500 leading-snug line-clamp-2">“{step.messageHint}”</p>
      ) : (
        <p className="text-[12.5px] text-gray-400 leading-snug italic">The agent writes this itself</p>
      )
    case 'wait':
      return (
        <p className="text-[12.5px] text-gray-500 leading-snug">
          {step.waitDays} {step.waitDays === 1 ? 'day' : 'days'}
        </p>
      )
    case 'await_reply':
      return (
        <p className="text-[12.5px] text-gray-500 leading-snug">
          {step.promptHint ? step.promptHint : 'Pauses until the lead answers'}
        </p>
      )
    case 'tool_call':
      return step.toolName ? (
        <p className="text-[12.5px] text-gray-500 leading-snug">
          <Mono>{step.toolName}</Mono>
        </p>
      ) : (
        <p className="text-[12.5px] text-amber-700 leading-snug">No tool chosen yet</p>
      )
    case 'human_handoff':
      return (
        <p className="text-[12.5px] text-gray-500 leading-snug">
          {step.reason ? step.reason : 'Ends the journey and alerts a human'}
        </p>
      )
    default:
      return null
  }
}

export default function JourneyNode({ step, selected, onSelect }: JourneyNodeProps) {
  const rails = railsFor(step)
  const isLoop = step.type === 'wait_and_recheck'

  const border = isLoop
    ? 'border-amber-500'
    : selected
      ? 'border-violet-600'
      : 'border-[#E4E0EC]'

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full h-full text-left bg-white border rounded-2xl px-4 py-3.5 flex flex-col gap-1.5 relative
        transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2
        ${border} ${selected ? 'shadow-[0_0_0_2px_var(--color-violet-600,#7C3AED)]' : 'hover:border-violet-300'}`}
    >
      <KindRow step={step} />

      <div style={JAKARTA_FONT} className="font-bold text-[14.5px] leading-snug tracking-[-0.01em] text-gray-900">
        {step.type === 'condition' ? conditionSentence(step) : step.name}
      </div>

      {step.type === 'wait_and_recheck' ? (
        <>
          <p className="text-[12.5px] text-gray-500 leading-snug">
            Every {step.waitDays} {step.waitDays === 1 ? 'day' : 'days'}, up to {step.maxIterations} times
          </p>
          <p className="text-[12.5px] text-gray-500 leading-snug">
            Checks <Mono>{step.recheckField}</Mono>
          </p>
        </>
      ) : (
        <Detail step={step} />
      )}

      {rails && (
        <div className="flex gap-2 mt-auto pt-2.5">
          <Rail label={rails[0]} />
          <Rail label={rails[1]} />
        </div>
      )}

      {isLoop && (
        <span
          style={MONO_FONT}
          className="absolute -right-2 -top-2 text-[10px] font-bold tracking-[0.06em] bg-amber-50 text-amber-700 border border-amber-500 rounded-full px-2 py-0.5 whitespace-nowrap"
        >
          REPEAT 1–{step.maxIterations}×
        </span>
      )}
    </button>
  )
}
