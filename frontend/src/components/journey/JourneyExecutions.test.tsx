import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { JourneyExecutionSummary } from '../../types/index'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

const getJourneyExecutions = vi.fn()
vi.mock('../../services/api', () => ({
  getJourneyExecutions: (...args: unknown[]) => getJourneyExecutions(...args),
}))

const JourneyExecutions = (await import('./JourneyExecutions')).default

function execution(overrides: Partial<JourneyExecutionSummary> = {}): JourneyExecutionSummary {
  return {
    leadId: 'lead-abcdef123',
    bundleId: 'bundle-1',
    status: 'running',
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    lastEventAt: new Date(Date.now() - 60_000).toISOString(),
    lastEventType: 'journey_step',
    eventCount: 3,
    events: [
      { ts: '2026-08-29T10:00:00.000Z', type: 'journey_started' },
      { ts: '2026-08-29T10:01:00.000Z', type: 'journey_step', stepId: 'greet' },
      { ts: '2026-08-29T10:02:00.000Z', type: 'message_out', channel: 'whatsapp', status: 'delivered' },
    ],
    ...overrides,
  }
}

function renderPanel() {
  render(<JourneyExecutions botId="bot-1" bundleId="bundle-1" />)
}

beforeEach(() => {
  getJourneyExecutions.mockReset()
})

describe('JourneyExecutions', () => {
  it('asks for the executions of this journey', async () => {
    getJourneyExecutions.mockResolvedValue({ success: true, data: [] })
    renderPanel()
    await waitFor(() => expect(getJourneyExecutions).toHaveBeenCalledWith('bot-1', 'bundle-1'))
  })

  // "Nothing has run" and "something ran and broke" must never look the same.
  it('says nothing has entered the journey rather than showing an empty table', async () => {
    getJourneyExecutions.mockResolvedValue({ success: true, data: [] })
    renderPanel()
    expect(await screen.findByText('No leads have entered this journey yet')).toBeTruthy()
  })

  it('renders one row per lead with its status', async () => {
    getJourneyExecutions.mockResolvedValue({
      success: true,
      data: [
        execution({ leadId: 'lead-one', status: 'completed' }),
        execution({ leadId: 'lead-two', status: 'failed', errorDetail: 'States.TaskFailed: booking blew up' }),
      ],
    })
    renderPanel()

    expect(await screen.findByText('2 recent runs')).toBeTruthy()
    expect(screen.getByText('Completed')).toBeTruthy()
    expect(screen.getByText('Failed')).toBeTruthy()
  })

  // The entire reason the terminal event carries an error at all: this line is
  // the difference between knowing it failed and knowing why.
  it('shows the failure reason inline', async () => {
    getJourneyExecutions.mockResolvedValue({
      success: true,
      data: [execution({ status: 'failed', errorDetail: 'States.TaskFailed: booking blew up' })],
    })
    renderPanel()

    expect(await screen.findByText('States.TaskFailed: booking blew up')).toBeTruthy()
  })

  it('distinguishes a handoff from a completion', async () => {
    getJourneyExecutions.mockResolvedValue({
      success: true,
      data: [execution({ status: 'handed_off' })],
    })
    renderPanel()

    expect(await screen.findByText('Handed off')).toBeTruthy()
    expect(screen.queryByText('Completed')).toBeNull()
  })

  // An execution started before terminal events shipped has no ending recorded
  // and sits at "In flight" forever. Presenting that as proof it is alive would
  // recreate the exact ambiguity this feature exists to remove.
  it('warns that In flight only means no ending was recorded', async () => {
    getJourneyExecutions.mockResolvedValue({ success: true, data: [execution({ status: 'running' })] })
    renderPanel()

    expect(await screen.findByText(/means no ending was recorded/)).toBeTruthy()
  })

  it('does not warn when every run has a recorded ending', async () => {
    getJourneyExecutions.mockResolvedValue({ success: true, data: [execution({ status: 'completed' })] })
    renderPanel()

    await screen.findByText('1 recent run')
    expect(screen.queryByText(/means no ending was recorded/)).toBeNull()
  })

  // Counts, never rates: at this volume a percentage is noise dressed as a
  // metric.
  it('summarises with counts and shows no percentages', async () => {
    getJourneyExecutions.mockResolvedValue({
      success: true,
      data: [
        execution({ leadId: 'a', status: 'completed' }),
        execution({ leadId: 'b', status: 'completed' }),
        execution({ leadId: 'c', status: 'failed' }),
      ],
    })
    renderPanel()

    expect(await screen.findByText('2 completed')).toBeTruthy()
    expect(screen.getByText('1 failed')).toBeTruthy()
    expect(screen.queryByText(/%/)).toBeNull()
  })

  it('surfaces a load failure instead of an empty state', async () => {
    getJourneyExecutions.mockResolvedValue({ success: false, error: 'Journey bundle not found' })
    renderPanel()

    expect(await screen.findByText('Journey bundle not found')).toBeTruthy()
    expect(screen.queryByText('No leads have entered this journey yet')).toBeNull()
  })
})

// The events came down with the summary, because the read had to load them to
// derive it. Expanding must therefore cost NO extra request — re-querying for
// data already in the browser is the waste this shape exists to avoid.
describe('drilling into a run', () => {
  it('shows nothing until a run is opened', async () => {
    getJourneyExecutions.mockResolvedValue({ success: true, data: [execution()] })
    renderPanel()

    await screen.findByText('1 recent run')
    expect(screen.queryByText('Journey started')).toBeNull()
  })

  it('reveals that run\'s events on click, with no second request', async () => {
    getJourneyExecutions.mockResolvedValue({ success: true, data: [execution()] })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { expanded: false }))

    expect(await screen.findByText('Journey started')).toBeTruthy()
    expect(screen.getByText('Step greet')).toBeTruthy()
    expect(screen.getByText(/Sent a message \(whatsapp\) — delivered/)).toBeTruthy()
    expect(getJourneyExecutions).toHaveBeenCalledTimes(1)
  })

  it('closes again on a second click', async () => {
    getJourneyExecutions.mockResolvedValue({ success: true, data: [execution()] })
    renderPanel()

    const row = await screen.findByRole('button', { expanded: false })
    fireEvent.click(row)
    await screen.findByText('Journey started')
    fireEvent.click(screen.getByRole('button', { expanded: true }))

    await waitFor(() => expect(screen.queryByText('Journey started')).toBeNull())
  })

  it('opens runs independently', async () => {
    getJourneyExecutions.mockResolvedValue({
      success: true,
      data: [
        execution({ leadId: 'lead-one', events: [{ ts: '2026-08-29T10:00:00.000Z', type: 'handoff' }] }),
        execution({ leadId: 'lead-two', events: [{ ts: '2026-08-29T11:00:00.000Z', type: 'message_in' }] }),
      ],
    })
    renderPanel()

    await screen.findByText('2 recent runs')
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])

    expect(await screen.findByText('Handed to a human')).toBeTruthy()
    expect(screen.queryByText('They replied')).toBeNull()
  })

  it('spells out a failed ending inside the run', async () => {
    getJourneyExecutions.mockResolvedValue({
      success: true,
      data: [
        execution({
          status: 'failed',
          events: [
            { ts: '2026-08-29T10:00:00.000Z', type: 'tool_call', toolName: 'booking' },
            {
              ts: '2026-08-29T10:01:00.000Z',
              type: 'journey_ended',
              outcome: 'failed',
              errorDetail: 'States.TaskFailed: booking blew up',
            },
          ],
        }),
      ],
    })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { expanded: false }))

    expect(await screen.findByText('Called booking')).toBeTruthy()
    expect(screen.getByText('Journey ended — failed')).toBeTruthy()
  })
})
