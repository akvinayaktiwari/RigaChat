import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import JourneyGraph from './JourneyGraph'
import { NODE_SIZE } from '../../lib/journey-graph'
import type { JourneyStep } from '../../types/index'

afterEach(cleanup)

function msg(stepId: string, name: string, next?: string): JourneyStep {
  return { stepId, name, type: 'send_message', ...(next ? { next } : {}) }
}

const FORK: JourneyStep = {
  stepId: 'fork',
  name: 'Score check',
  type: 'condition',
  field: 'lead_score',
  operator: 'equals',
  value: '60',
  onTrue: 'yes-step',
  onFalse: 'no-step',
}

const LOOP: JourneyStep = {
  stepId: 'loop',
  name: 'Nudge and re-qualify',
  type: 'wait_and_recheck',
  waitDays: 2,
  maxIterations: 4,
  recheckField: 'replied',
  onSatisfied: 'yes-step',
  onExhausted: 'no-step',
}

const REPLY: JourneyStep = {
  stepId: 'reply',
  name: 'Listen for budget',
  type: 'await_reply',
  next: 'yes-step',
  onNoReply: 'no-step',
}

describe('branch legibility', () => {
  // The rails are never hover-revealed. An operator scanning the graph has to be
  // able to answer "what happens if they don't reply" without touching anything.
  it('shows both condition rails at rest', () => {
    render(
      <JourneyGraph
        steps={[FORK, msg('yes-step', 'Book it'), msg('no-step', 'Nudge')]}
        startStepId="fork"
      />
    )

    expect(screen.getByText('YES')).toBeTruthy()
    expect(screen.getByText('NO')).toBeTruthy()
  })

  it('shows both await_reply outcomes at rest', () => {
    render(
      <JourneyGraph
        steps={[REPLY, msg('yes-step', 'Book it'), msg('no-step', 'Nudge')]}
        startStepId="reply"
      />
    )

    expect(screen.getByText('REPLIED')).toBeTruthy()
    expect(screen.getByText('NO REPLY')).toBeTruthy()
  })

  it('renders a condition as a readable sentence rather than its field name', () => {
    render(
      <JourneyGraph
        steps={[FORK, msg('yes-step', 'Book it'), msg('no-step', 'Nudge')]}
        startStepId="fork"
      />
    )

    expect(screen.getByText('Is lead score is 60?')).toBeTruthy()
  })

  it('shows the loop iteration count from the step, not a hardcoded range', () => {
    render(
      <JourneyGraph
        steps={[LOOP, msg('yes-step', 'Book it'), msg('no-step', 'Nudge')]}
        startStepId="loop"
      />
    )

    expect(screen.getByText('REPEAT 1–4×')).toBeTruthy()
    expect(screen.getByText(/Every 2 days, up to 4 times/)).toBeTruthy()
    expect(screen.getByText('SATISFIED')).toBeTruthy()
    expect(screen.getByText('EXHAUSTED')).toBeTruthy()
  })
})

describe('node sizing', () => {
  it('gives a fork and a loop their own silhouettes', () => {
    const { container } = render(
      <JourneyGraph
        steps={[FORK, LOOP, msg('yes-step', 'Book it'), msg('no-step', 'Nudge')]}
        startStepId="fork"
      />
    )

    const positioned = Array.from(container.querySelectorAll<HTMLElement>('div.absolute[style*="width"]'))
    const widths = positioned.map((el) => el.style.width)

    expect(widths).toContain(`${NODE_SIZE.condition.w}px`)
    expect(widths).toContain(`${NODE_SIZE.wait_and_recheck.w}px`)
    expect(widths).toContain(`${NODE_SIZE.send_message.w}px`)
  })
})

describe('unreachable steps', () => {
  // The payoff of having a real graph rather than a list: a step nothing points
  // at will never run, and saved journeys really do contain them.
  it('flags a step no path reaches, and names it', () => {
    render(
      <JourneyGraph
        steps={[msg('a', 'Greet', 'b'), msg('b', 'Follow up'), msg('orphan', 'Forgotten step')]}
        startStepId="a"
      />
    )

    expect(screen.getByText('Not connected')).toBeTruthy()
    expect(screen.getByText(/1 step will never run/)).toBeTruthy()
    // Twice on purpose: once as the node's own title, once named in the banner
    // so the operator does not have to hunt for which step is stranded.
    expect(screen.getAllByText(/Forgotten step/)).toHaveLength(2)
  })

  it('says nothing when every step is reachable', () => {
    render(<JourneyGraph steps={[msg('a', 'Greet', 'b'), msg('b', 'Follow up')]} startStepId="a" />)

    expect(screen.queryByText('Not connected')).toBeNull()
    expect(screen.queryByText(/will never run/)).toBeNull()
  })
})

describe('interaction', () => {
  it('reports which step was selected', () => {
    const onSelect = vi.fn()
    render(<JourneyGraph steps={[msg('a', 'Greet')]} startStepId="a" onSelect={onSelect} />)

    fireEvent.click(screen.getByText('Greet'))

    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('marks the selected node for assistive tech, not by colour alone', () => {
    render(<JourneyGraph steps={[msg('a', 'Greet')]} startStepId="a" selectedStepId="a" />)

    expect(screen.getByRole('button', { pressed: true })).toBeTruthy()
  })

  // Direct manipulation is the thing this design removes: no drag handles, no
  // connect points, so an unreadable graph cannot be drawn by hand.
  it('exposes no draggable element', () => {
    const { container } = render(
      <JourneyGraph steps={[FORK, msg('yes-step', 'A'), msg('no-step', 'B')]} startStepId="fork" />
    )

    expect(container.querySelector('[draggable="true"]')).toBeNull()
  })

  it('invites the first step when the journey is empty', () => {
    render(<JourneyGraph steps={[]} startStepId="" />)

    expect(screen.getByText(/Add a step and the journey will draw itself/)).toBeTruthy()
  })
})
