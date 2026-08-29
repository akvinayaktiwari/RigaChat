import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { JourneyBundle } from '../types/index'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

const getMyBots = vi.fn()
const getJourneyBundles = vi.fn()
const getJourneyTemplates = vi.fn()
const publishJourneyBundle = vi.fn()
const pauseJourneyBundle = vi.fn()
const deleteJourneyBundle = vi.fn()
const createJourneyBundleFromTemplate = vi.fn()
const getActiveJourneys = vi.fn()

vi.mock('../services/api', () => ({
  getMyBots: (...args: unknown[]) => getMyBots(...args),
  getJourneyBundles: (...args: unknown[]) => getJourneyBundles(...args),
  getJourneyTemplates: (...args: unknown[]) => getJourneyTemplates(...args),
  publishJourneyBundle: (...args: unknown[]) => publishJourneyBundle(...args),
  pauseJourneyBundle: (...args: unknown[]) => pauseJourneyBundle(...args),
  deleteJourneyBundle: (...args: unknown[]) => deleteJourneyBundle(...args),
  createJourneyBundleFromTemplate: (...args: unknown[]) => createJourneyBundleFromTemplate(...args),
  getActiveJourneys: (...args: unknown[]) => getActiveJourneys(...args),
}))

const toastShow = vi.fn()
vi.mock('../components/Toast/Toast', () => ({
  useToast: () => ({ show: toastShow }),
}))

const JourneysPage = (await import('./JourneysPage')).default

function bundle(status: JourneyBundle['status']): JourneyBundle {
  return {
    bundleId: 'bundle-1',
    botId: 'bot-1',
    clientId: 'client-1',
    name: 'Real estate lead qualification',
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

async function renderList(status: JourneyBundle['status']) {
  getJourneyBundles.mockResolvedValue({ success: true, data: [bundle(status)] })

  render(
    <MemoryRouter initialEntries={['/dashboard/journeys']}>
      <JourneysPage />
    </MemoryRouter>
  )

  await screen.findByText('Real estate lead qualification')
}

beforeEach(() => {
  getMyBots.mockReset()
  getJourneyBundles.mockReset()
  getJourneyTemplates.mockReset()
  publishJourneyBundle.mockReset()
  pauseJourneyBundle.mockReset()
  deleteJourneyBundle.mockReset()
  createJourneyBundleFromTemplate.mockReset()
  getActiveJourneys.mockReset()
  toastShow.mockReset()

  getMyBots.mockResolvedValue({ success: true, data: [{ botId: 'bot-1', name: 'Riga sales bot' }] })
  getJourneyTemplates.mockResolvedValue({ success: true, data: [] })
  getActiveJourneys.mockResolvedValue({ success: true, data: [] })
  publishJourneyBundle.mockResolvedValue({ success: true, data: bundle('published') })
  pauseJourneyBundle.mockResolvedValue({ success: true, data: bundle('paused') })
  deleteJourneyBundle.mockResolvedValue({ success: true, data: { message: 'Journey bundle deleted' } })
})

// The list is where an operator answers "is anything actually running right
// now?". A status word alone doesn't answer it — which leads a live journey is
// picking up is the part that decides whether they touch it.
describe('showing which journey is running', () => {
  it('labels a published journey Live and names what starts it', async () => {
    await renderList('published')

    expect(screen.getByText('Live')).toBeTruthy()
    expect(screen.getByText('Running — starts when a new lead comes in')).toBeTruthy()
  })

  it('labels a paused journey Paused and says no new leads are entering', async () => {
    await renderList('paused')

    expect(screen.getByText('Paused')).toBeTruthy()
    expect(screen.getByText('Paused — no new leads are entering it')).toBeTruthy()
    expect(screen.queryByText('Live')).toBeNull()
  })

  it('labels a draft as not running yet', async () => {
    await renderList('draft')

    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.getByText('Draft — not running yet')).toBeTruthy()
  })
})

describe('pause, resume, publish are offered per status', () => {
  it('offers Pause on a live journey and not Publish', async () => {
    await renderList('published')

    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
  })

  it('offers Resume on a paused journey, never Pause', async () => {
    await renderList('paused')

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  it('offers Publish on a draft, never Pause', async () => {
    await renderList('draft')

    expect(screen.getByRole('button', { name: 'Publish' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  it('pauses the right bundle and flips the row to Paused', async () => {
    await renderList('published')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    await waitFor(() => expect(pauseJourneyBundle).toHaveBeenCalledWith('bot-1', 'bundle-1'))
    expect(await screen.findByText('Paused')).toBeTruthy()
    expect(toastShow).toHaveBeenCalledWith('Journey paused — leads already in it will finish', 'success')
  })

  // Resume is publish again: same call, same trigger claim, no rebuild.
  it('resumes through publish and flips the row back to Live', async () => {
    await renderList('paused')

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    await waitFor(() => expect(publishJourneyBundle).toHaveBeenCalledWith('bot-1', 'bundle-1'))
    expect(await screen.findByText('Live')).toBeTruthy()
  })

  it('keeps the journey live and reports the error when pausing fails', async () => {
    pauseJourneyBundle.mockResolvedValue({ success: false, error: 'Only a published journey can be paused' })
    await renderList('published')

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    await waitFor(() =>
      expect(toastShow).toHaveBeenCalledWith('Only a published journey can be paused', 'error')
    )
    expect(screen.getByText('Live')).toBeTruthy()
  })
})

// The failure this exists for: 23 bots, one live journey, and the dropdown
// defaulting to whichever botId sorts first — so the page opened on a bot with
// nothing running and the live journey was invisible behind 22 other entries.
describe('active across all bots', () => {
  function twoBots() {
    getMyBots.mockResolvedValue({
      success: true,
      data: [
        { botId: 'bot-aaa', name: 'Quiet bot' },
        { botId: 'bot-zzz', name: 'Busy bot' },
      ],
    })
  }

  it('names the live journey and the bot it runs on, without picking a bot first', async () => {
    twoBots()
    getActiveJourneys.mockResolvedValue({
      success: true,
      data: [{ ...bundle('published'), bundleId: 'live-1', botId: 'bot-zzz' }],
    })
    getJourneyBundles.mockResolvedValue({ success: true, data: [] })

    render(
      <MemoryRouter initialEntries={['/dashboard/journeys']}>
        <JourneysPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Active across all bots')).toBeTruthy()
    expect(screen.getByText('1 of 2 bots')).toBeTruthy()
    // Scoped to the strip's own row: the bot name also appears in the dropdown,
    // which is now defaulted to this same bot.
    expect(screen.getByText(/Busy bot · a new lead comes in/)).toBeTruthy()
  })

  // The core fix. bot-aaa sorts first, so the old code selected it; the live
  // journey is on bot-zzz.
  it('defaults the dropdown to a bot that has a live journey, not the first one', async () => {
    twoBots()
    getActiveJourneys.mockResolvedValue({
      success: true,
      data: [{ ...bundle('published'), bundleId: 'live-1', botId: 'bot-zzz' }],
    })
    getJourneyBundles.mockResolvedValue({ success: true, data: [] })

    render(
      <MemoryRouter initialEntries={['/dashboard/journeys']}>
        <JourneysPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(getJourneyBundles).toHaveBeenCalledWith('bot-zzz'))
    expect(getJourneyBundles).not.toHaveBeenCalledWith('bot-aaa')
  })

  it('falls back to the first bot when nothing is running anywhere', async () => {
    twoBots()
    getActiveJourneys.mockResolvedValue({ success: true, data: [] })
    getJourneyBundles.mockResolvedValue({ success: true, data: [] })

    render(
      <MemoryRouter initialEntries={['/dashboard/journeys']}>
        <JourneysPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(getJourneyBundles).toHaveBeenCalledWith('bot-aaa'))
    expect(screen.queryByText('Active across all bots')).toBeNull()
  })

  // A failed index must cost the strip, not the page.
  it('still renders the journey list when the active index fails', async () => {
    twoBots()
    getActiveJourneys.mockRejectedValue(new Error('boom'))
    getJourneyBundles.mockResolvedValue({ success: true, data: [bundle('draft')] })

    render(
      <MemoryRouter initialEntries={['/dashboard/journeys']}>
        <JourneysPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Real estate lead qualification')).toBeTruthy()
    expect(screen.queryByText('Active across all bots')).toBeNull()
  })
})

describe('deleting a journey', () => {
  it('shows Delete as a labelled action, not a bare icon', async () => {
    await renderList('draft')

    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })

  // Deleting tears down the state machine, which FAILS anyone mid-journey
  // rather than letting them finish. Pause does not. The warning is the only
  // place that difference is visible before the irreversible click.
  it('warns that deleting a live journey drops leads mid-flight', async () => {
    await renderList('published')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Delete this journey?')).toBeTruthy()
    expect(screen.getByText(/drop any leads currently part-way through it/)).toBeTruthy()
    expect(deleteJourneyBundle).not.toHaveBeenCalled()
  })

  // Regression: the warning originally fired only on 'published'. Pause keeps
  // the state machine alive so in-flight leads finish, which makes a paused
  // journey the one MOST likely to still have people in it — deleting it
  // silently killed exactly the executions pause had just promised to keep.
  it('warns about mid-flight leads when deleting a PAUSED journey too', async () => {
    await renderList('paused')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Delete this journey?')).toBeTruthy()
    expect(screen.getByText(/still running. Deleting it drops them/)).toBeTruthy()
  })

  it('does not warn about mid-flight leads for a draft', async () => {
    await renderList('draft')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Delete this journey?')).toBeTruthy()
    expect(screen.queryByText(/drop any leads currently part-way through it/)).toBeNull()
    expect(screen.queryByText(/still running. Deleting it drops them/)).toBeNull()
  })

  it('deletes only after the confirmation, and removes the row', async () => {
    await renderList('published')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const dialog = await screen.findByText('Delete this journey?')
    fireEvent.click(within(dialog.parentElement as HTMLElement).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteJourneyBundle).toHaveBeenCalledWith('bot-1', 'bundle-1'))
    await waitFor(() => expect(screen.queryByText('Real estate lead qualification')).toBeNull())
  })
})
