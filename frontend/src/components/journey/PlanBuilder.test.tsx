import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import PlanBuilder from './PlanBuilder'
import { DEFAULT_PLAN } from '../../lib/journey-plan'
import type { JourneyPlan } from '../../lib/journey-plan'

afterEach(cleanup)

function renderPlan(patch: Partial<JourneyPlan> = {}) {
  const onChange = vi.fn()
  const plan = { ...DEFAULT_PLAN, ...patch }
  render(<PlanBuilder plan={plan} onChange={onChange} />)
  return { onChange, plan }
}

describe('the two sections', () => {
  // One screen, two labelled sections. Two separate surfaces would make the
  // operator ask which screen controls the conversation.
  it('shows both on the same screen', () => {
    renderPlan()

    expect(screen.getByText('Conversation guide')).toBeTruthy()
    expect(screen.getByText('Follow-up rules')).toBeTruthy()
  })

  it('never asks the operator to author a step', () => {
    renderPlan()

    for (const jargon of ['send_message', 'await_reply', 'wait_and_recheck', 'Step 1', 'startStepId']) {
      expect(screen.queryByText(new RegExp(jargon))).toBeNull()
    }
  })
})

describe('editing the guide', () => {
  it('adds a fact to learn', () => {
    const { onChange } = renderPlan()

    const input = screen.getAllByPlaceholderText('add a fact')[0]
    fireEvent.change(input, { target: { value: 'Timeline to move' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ learn: [...DEFAULT_PLAN.learn, 'Timeline to move'] })
    )
  })

  it('refuses a duplicate rather than adding it twice', () => {
    const { onChange } = renderPlan({ learn: ['Budget range'] })

    const input = screen.getAllByPlaceholderText('add a fact')[0]
    fireEvent.change(input, { target: { value: 'Budget range' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes a limit', () => {
    const { onChange } = renderPlan({ never: ['Invent prices', 'Promise availability'] })

    fireEvent.click(screen.getByLabelText('Remove Invent prices'))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ never: ['Promise availability'] }))
  })

  // The operator's "never" list is additive. The only-answer-from-context rule
  // is not theirs to remove, and the UI should say so rather than implying the
  // list is the whole of the agent's safety.
  it('says the knowledge-base limit is already in force', () => {
    renderPlan()

    expect(screen.getByText(/only answers from your knowledge base/i)).toBeTruthy()
  })
})

describe('the 24-hour WhatsApp rule', () => {
  // A guardrail, not a setting. The system knows the rule; the operator picks
  // only the words.
  it('explains it in plain language when a nudge is scheduled past a day', () => {
    renderPlan({ followUp: { waitDays: 1, maxNudges: 1, nudgeMessage: 'Still interested?' } })

    expect(screen.getByText(/After a day without a reply/)).toBeTruthy()
    expect(screen.getByText(/only allows an approved message after 24 hours/i)).toBeTruthy()
  })

  it('never mentions templates, session windows, or Meta', () => {
    renderPlan()

    expect(screen.queryByText(/session window/i)).toBeNull()
    expect(screen.queryByText(/Meta/)).toBeNull()
  })

  it('disappears entirely when nudging is off', () => {
    renderPlan({ followUp: { waitDays: 1, maxNudges: 0, nudgeMessage: '' } })

    expect(screen.queryByText(/After a day without a reply/)).toBeNull()
  })
})

describe('turning rules off', () => {
  it('says what happens when follow-up is off, rather than just hiding the fields', () => {
    renderPlan({ followUp: { waitDays: 1, maxNudges: 0, nudgeMessage: '' } })

    expect(screen.getByText(/No follow-up/)).toBeTruthy()
  })

  it('says nobody is told when handoff is off', () => {
    renderPlan({ handoff: { enabled: false, reason: '' } })

    expect(screen.getByText(/Nobody is told/)).toBeTruthy()
  })

  it('toggles booking off through the switch', () => {
    const { onChange } = renderPlan()

    fireEvent.click(screen.getByLabelText('Let the assistant book site visits'))

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ booking: expect.objectContaining({ enabled: false }) })
    )
  })
})

describe('the timeline that replaces reading a graph', () => {
  it('shows what happens and when', () => {
    renderPlan()

    expect(screen.getByText('What will happen')).toBeTruthy()
    expect(screen.getByText(/Hands the lead to you/)).toBeTruthy()
  })

  it('marks the entry that needs an approved message', () => {
    renderPlan()

    expect(screen.getByText('template')).toBeTruthy()
  })

  it('states the total length in the goal summary', () => {
    renderPlan({
      followUp: { waitDays: 1, maxNudges: 1, nudgeMessage: 'x' },
      booking: { enabled: true, recheckDays: 1, maxRechecks: 3 },
    })

    expect(screen.getByText(/About 4 days end to end/)).toBeTruthy()
  })
})

// jsdom does no layout, so this cannot catch overflow by measuring. What it CAN
// pin is the CSS contract that prevents it: a grid track defaults to
// min-content, and <textarea>/<input> carry an intrinsic minimum width that
// w-full does not override. A bare `grid-cols-2` therefore lets the fields push
// the track wider than the container and the whole page scrolls sideways --
// which is exactly what happened.
describe('the layout cannot overflow its container', () => {
  it('sizes grid tracks with minmax(0,1fr), never a bare fraction', () => {
    const { container } = render(<PlanBuilder plan={DEFAULT_PLAN} onChange={vi.fn()} />)

    const grid = container.querySelector('[class*="grid-cols"]')
    const classes = grid?.className ?? ''

    expect(classes).toMatch(/grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/)
    expect(classes).not.toMatch(/xl:grid-cols-2\b/)
  })

  it('lets both sections shrink below their content width', () => {
    const { container } = render(<PlanBuilder plan={DEFAULT_PLAN} onChange={vi.fn()} />)

    const sections = Array.from(container.querySelectorAll('section'))
    expect(sections).toHaveLength(2)
    for (const section of sections) {
      expect(section.className).toContain('min-w-0')
    }
  })

  it('lets a long pinned message shrink rather than widen the page', () => {
    render(<PlanBuilder plan={DEFAULT_PLAN} onChange={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit words' })[0])

    const editor = screen.getByRole('textbox', { name: /Sent to the lead/i })
    expect(editor.className).toContain('min-w-0')
  })
})
