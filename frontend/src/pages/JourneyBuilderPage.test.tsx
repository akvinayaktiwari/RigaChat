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

vi.mock('../services/api', () => ({
  getJourneyBundle: (...args: unknown[]) => getJourneyBundle(...args),
  updateJourneyBundle: (...args: unknown[]) => updateJourneyBundle(...args),
  publishJourneyBundle: (...args: unknown[]) => publishJourneyBundle(...args),
  createJourneyBundle: (...args: unknown[]) => createJourneyBundle(...args),
}))

const toastShow = vi.fn()
vi.mock('../components/Toast/Toast', () => ({
  useToast: () => ({ show: toastShow }),
}))

const JourneyBuilderPage = (await import('./JourneyBuilderPage')).default

function bundle(status: 'draft' | 'published'): JourneyBundle {
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

async function renderBuilder(status: 'draft' | 'published') {
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
  toastShow.mockReset()
  updateJourneyBundle.mockResolvedValue({ success: true, data: bundle('draft') })
  publishJourneyBundle.mockResolvedValue({ success: true, data: bundle('published') })
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
