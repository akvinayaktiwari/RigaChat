import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

    expect(await screen.findByText('2 runs')).toBeTruthy()
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

    await screen.findByText('1 run')
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
