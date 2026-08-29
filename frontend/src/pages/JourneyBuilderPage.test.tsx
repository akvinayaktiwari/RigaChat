import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { JourneyBundle } from '../types/index'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

const getJourneyBundle = vi.fn()
const updateJourneyBundle = vi.fn()
const publishJourneyBundle = vi.fn()
const createJourneyBundle = vi.fn()
const pauseJourneyBundle = vi.fn()
const getJourneyExecutions = vi.fn()

vi.mock('../services/api', () => ({
  getJourneyBundle: (...args: unknown[]) => getJourneyBundle(...args),
  updateJourneyBundle: (...args: unknown[]) => updateJourneyBundle(...args),
  publishJourneyBundle: (...args: unknown[]) => publishJourneyBundle(...args),
  createJourneyBundle: (...args: unknown[]) => createJourneyBundle(...args),
  pauseJourneyBundle: (...args: unknown[]) => pauseJourneyBundle(...args),
  getJourneyExecutions: (...args: unknown[]) => getJourneyExecutions(...args),
}))

const toastShow = vi.fn()
vi.mock('../components/Toast/Toast', () => ({
  useToast: () => ({ show: toastShow }),
}))

const JourneyBuilderPage = (await import('./JourneyBuilderPage')).default

function bundle(status: JourneyBundle['status']): JourneyBundle {
  return {
    bundleId: 'bundle-1',
    botId: 'bot-1',
    clientId: 'client-1',
    name: 'Real estate lead qualification',
    description: 'Greets a new lead on WhatsApp',
    isPrebuiltTemplate: false,
    status,
    journey: {
      journeyId: 'journey-1',
      botId: 'bot-1',
      clientId: 'client-1',
      name: 'Real estate lead qualification',
      triggerType: 'lead_captured',
      startStepId: 'step-1',
      steps: [{ stepId: 'step-1', name: 'Greet the lead', type: 'send_message' }],
    },
    agent: {
      personaId: 'persona-1',
      name: 'Site visit assistant',
      systemPrompt: 'You are a helpful assistant for a real estate business.',
      mcpToolbox: [],
      channelConfig: {},
    },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

async function renderBuilder(status: JourneyBundle['status']) {
  getJourneyBundle.mockResolvedValue({ success: true, data: bundle(status) })

  render(
    <MemoryRouter initialEntries={['/dashboard/journeys/bot-1/bundle-1']}>
      <Routes>
        <Route path="/dashboard/journeys/:botId/:bundleId" element={<JourneyBuilderPage />} />
      </Routes>
    </MemoryRouter>
  )

  await screen.findAllByDisplayValue('Real estate lead qualification')
}

beforeEach(() => {
  getJourneyBundle.mockReset()
  updateJourneyBundle.mockReset()
  publishJourneyBundle.mockReset()
  createJourneyBundle.mockReset()
  pauseJourneyBundle.mockReset()
  getJourneyExecutions.mockReset()
  getJourneyExecutions.mockResolvedValue({ success: true, data: [] })
  toastShow.mockReset()
  updateJourneyBundle.mockResolvedValue({ success: true, data: bundle('draft') })
  publishJourneyBundle.mockResolvedValue({ success: true, data: bundle('published') })
  pauseJourneyBundle.mockResolvedValue({ success: true, data: bundle('paused') })
})

// The behaviour under test is a real backend consequence, not a UI nicety:
// updateJourneyBundle drops a published bundle to 'draft' AND releases its
// trigger claim (backend journey-service.ts), so new leads stop igniting into
// it. Saving used to do that silently, which meant fixing one word in a live
// journey turned off a client's lead follow-up with no indication.
describe('saving a published journey', () => {
  it('does not call the API until the operator confirms', async () => {
    await renderBuilder('published')

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Saving will take this journey off duty')).toBeTruthy()
    expect(updateJourneyBundle).not.toHaveBeenCalled()
  })

  it('names the trigger that is being released', async () => {
    await renderBuilder('published')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText(/New leads will stop entering/)).toBeTruthy()
    // Scoped to the dialog: the trigger name also appears in the form's own
    // <select>, so an unscoped query matches twice and proves nothing.
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('When a lead is captured')).toBeTruthy()
  })

  it('leaves the journey published when the operator backs out', async () => {
    await renderBuilder('published')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Keep it live' }))

    await waitFor(() =>
      expect(screen.queryByText('Saving will take this journey off duty')).toBeNull()
    )
    expect(updateJourneyBundle).not.toHaveBeenCalled()
  })

  it('saves once confirmed, and says the journey is no longer taking leads', async () => {
    await renderBuilder('published')
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save as draft' }))

    await waitFor(() => expect(updateJourneyBundle).toHaveBeenCalledTimes(1))
    expect(toastShow).toHaveBeenCalledWith(
      'Saved as draft. This journey is no longer handling new leads.',
      'warning'
    )
  })
})

describe('paths that must NOT be gated', () => {
  it('saves a draft journey immediately, with no confirmation', async () => {
    await renderBuilder('draft')

    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    await waitFor(() => expect(updateJourneyBundle).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Saving will take this journey off duty')).toBeNull()
    expect(toastShow).toHaveBeenCalledWith('Journey saved', 'success')
  })

  // Publish saves and then immediately re-claims the trigger, so the journey is
  // never off duty for longer than that round trip. Gating it would be noise.
  it('publishes a published journey without a confirmation', async () => {
    await renderBuilder('published')

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(publishJourneyBundle).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Saving will take this journey off duty')).toBeNull()
  })
})

// Pause is the only way to take a live journey off the air without either
// deleting it (which fails anyone mid-journey) or saving an edit (which drops
// it to draft for an unrelated reason). These tests pin the three things that
// make it usable: it is offered exactly when it applies, it does NOT save
// first, and the state it leaves behind is visibly resumable.
describe('pausing a live journey', () => {
  it('offers Pause only on a published journey', async () => {
    await renderBuilder('published')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()

    cleanup()
    await renderBuilder('draft')
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  // Saving first would release the trigger claim as a DRAFT edit, losing the
  // paused-and-resumable state the operator actually asked for.
  it('pauses without saving first', async () => {
    await renderBuilder('published')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    await waitFor(() => expect(pauseJourneyBundle).toHaveBeenCalledWith('bot-1', 'bundle-1'))
    expect(updateJourneyBundle).not.toHaveBeenCalled()
  })

  it('tells the operator that leads already in the journey still finish', async () => {
    await renderBuilder('published')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    await waitFor(() =>
      expect(toastShow).toHaveBeenCalledWith('Journey paused — leads already in it will finish', 'success')
    )
  })

  it('shows the Paused badge and swaps Publish for Resume once paused', async () => {
    await renderBuilder('published')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    expect(await screen.findByText('Paused')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    // Pause is gone: a paused bundle holds no trigger claim to release.
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  // Resume used to route through handlePublish, which saves first. Saving
  // regenerates the journey from the plan builder and that round trip is lossy
  // (it drops mcpToolbox capabilities the plan cannot express), so resuming a
  // paused journey could silently rewrite the definition being resumed.
  it('resumes without saving, so the paused definition is what goes live', async () => {
    await renderBuilder('paused')

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    await waitFor(() => expect(publishJourneyBundle).toHaveBeenCalledWith('bot-1', 'bundle-1'))
    expect(updateJourneyBundle).not.toHaveBeenCalled()
    expect(toastShow).toHaveBeenCalledWith('Journey resumed', 'success')
  })

  it('surfaces a failed pause instead of silently leaving it live', async () => {
    pauseJourneyBundle.mockResolvedValue({ success: false, error: 'Only a published journey can be paused' })
    await renderBuilder('published')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    expect(await screen.findByText('Only a published journey can be paused')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  })
})

// The Activity tab is the read path's entry point. It is keyed by bundleId, so
// it only makes sense on a journey that has actually been saved.
describe('activity tab', () => {
  it('loads this journey\'s runs when opened', async () => {
    await renderBuilder('published')

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))

    await waitFor(() => expect(getJourneyExecutions).toHaveBeenCalledWith('bot-1', 'bundle-1'))
  })

  it('reports an empty journey as never run, not as broken', async () => {
    await renderBuilder('published')
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }))

    expect(await screen.findByText('No leads have entered this journey yet')).toBeTruthy()
  })
})
