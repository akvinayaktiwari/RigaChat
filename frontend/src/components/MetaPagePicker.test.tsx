import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import MetaPagePicker from './MetaPagePicker'
import type { MetaSelectablePage } from '../types/index'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)
// Without this the api mocks accumulate calls across tests, so a "was never
// called" assertion sees the previous test's clicks.
beforeEach(() => vi.clearAllMocks())

/**
 * The selected-count renders as two text nodes ({size} + " selected"), so no
 * string matcher reaches it. Read the aria-live region instead -- which is the
 * element a screen reader announces, so asserting on it tests the thing that
 * actually matters.
 */
function liveCount(): string {
  return document.querySelector('[aria-live="polite"]')?.textContent ?? ''
}

const getSelectableMetaPages = vi.fn()
const connectMetaPages = vi.fn()

vi.mock('../services/api', () => ({
  getSelectableMetaPages: (...args: unknown[]) => getSelectableMetaPages(...args),
  connectMetaPages: (...args: unknown[]) => connectMetaPages(...args),
}))

function page(n: number, over: Partial<MetaSelectablePage> = {}): MetaSelectablePage {
  return { pageId: `page-${n}`, pageName: `Page ${n}`, connected: false, unavailable: false, ...over }
}

function renderPicker(overrides: Partial<Parameters<typeof MetaPagePicker>[0]> = {}) {
  const props = {
    onClose: vi.fn(),
    onConnected: vi.fn(),
    onTokenExpired: vi.fn(),
    ...overrides,
  }
  render(<MetaPagePicker {...props} />)
  return props
}

describe('MetaPagePicker', () => {
  it('surfaces a rejected connect instead of silently resetting', async () => {
    // try/finally with no catch made this an unhandled rejection: the spinner
    // stopped, the selection stayed on screen, and the client was told nothing.
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1)], maxPerBatch: 25 } })
    connectMetaPages.mockRejectedValue(new Error('network down'))

    renderPicker()
    await waitFor(() => expect(liveCount()).toContain('1 selected'))

    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText(/were not connected/)).toBeTruthy()
  })

  it('closes on Escape, so the dialog is not a keyboard trap', async () => {
    // aria-modal="true" is a claim about the page behind being inert. Without a
    // key handler it is only an attribute.
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1)], maxPerBatch: 25 } })

    const props = renderPicker()
    await waitFor(() => expect(liveCount()).toContain('1 selected'))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalled()
  })

  it('moves focus into the dialog on open', async () => {
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1)], maxPerBatch: 25 } })

    renderPicker()
    await waitFor(() => expect(liveCount()).toContain('1 selected'))

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('tells a screen reader WHY a row is disabled at the cap', async () => {
    // The cap explanation lives in the footer, which a screen reader never
    // reaches from the checkbox. Without this the row is just "dimmed".
    const many = Array.from({ length: 30 }, (_, i) => page(i))
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: many, maxPerBatch: 25 } })

    renderPicker()
    await waitFor(() => expect(liveCount()).toContain('25 selected'))

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    const capped = boxes.find((b) => !b.checked)
    expect(capped?.getAttribute('aria-describedby')).toBe('meta-picker-cap-reason')
    expect(document.getElementById('meta-picker-cap-reason')?.textContent).toMatch(/deselect a Page/)
  })

  it('pre-selects every connectable Page', async () => {
    // The client already answered "which Pages?" on Meta's consent screen.
    // Asking again is what produced the original bug, where Pages they approved
    // silently went unconnected.
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1), page(2), page(3)], maxPerBatch: 25 } })

    renderPicker()

    await waitFor(() => expect(liveCount()).toContain('3 selected'))
  })

  it('does not pre-select a Page already connected to another account', async () => {
    getSelectableMetaPages.mockResolvedValue({
      success: true,
      data: { pages: [page(1), page(2, { unavailable: true })], maxPerBatch: 25 },
    })

    renderPicker()

    await waitFor(() => expect(liveCount()).toContain('1 selected'))
    expect(screen.getByText('Connected to another account')).toBeTruthy()
  })

  it('disables a Page owned by another account so the conflict is visible before submit', async () => {
    // A conflict explained up front costs nothing. The same conflict explained
    // in an error after submitting costs a support round trip.
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1, { unavailable: true })], maxPerBatch: 25 } })

    renderPicker()

    await waitFor(() =>
      expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).disabled).toBe(true)
    )
  })

  it('shows an already-connected Page as checked and disabled', async () => {
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1, { connected: true })], maxPerBatch: 25 } })

    renderPicker()

    await waitFor(() => {
      const box = screen.getAllByRole('checkbox')[0] as HTMLInputElement
      expect(box.checked).toBe(true)
      expect(box.disabled).toBe(true)
    })
    expect(screen.getByText('Connected')).toBeTruthy()
  })

  it('lets a client deselect a Page and connects only the rest', async () => {
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1), page(2)], maxPerBatch: 25 } })
    connectMetaPages.mockResolvedValue({ success: true, data: { connected: [], skipped: [] } })

    renderPicker()
    await waitFor(() => expect(liveCount()).toContain('2 selected'))

    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(liveCount()).toContain('1 selected')

    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => expect(connectMetaPages).toHaveBeenCalledWith(['page-2']))
  })

  it('refuses a 26th selection at the checkbox and says why', async () => {
    // The cap is enforced live, not on submit: a client should never compose an
    // invalid request and then be rejected for it.
    const many = Array.from({ length: 30 }, (_, i) => page(i))
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: many, maxPerBatch: 25 } })

    renderPicker()

    // 30 available, capped at 25 on load. At the cap the count and the reason
    // share one element, so match on the container rather than an exact string.
    await waitFor(() => expect(liveCount()).toContain('25 is the maximum per batch'))
    expect(liveCount()).toContain('25 selected')

    // An unselected Page is disabled while at the cap.
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    const unselected = boxes.find((b) => !b.checked)
    expect(unselected?.disabled).toBe(true)
  })

  it('reports an expired token to the parent instead of rendering an empty list', async () => {
    // Showing "no Pages" for an expired token tells the client their Pages are
    // gone, when in fact every connected Page is still receiving leads.
    getSelectableMetaPages.mockResolvedValue({ success: false, error: 'Your Facebook connection expired.' })

    const props = renderPicker()

    await waitFor(() => expect(props.onTokenExpired).toHaveBeenCalled())
  })

  it('hands the partial-success result to the parent', async () => {
    const result = {
      connected: [{ pageId: 'page-1' }],
      skipped: [{ pageId: 'page-2', pageName: 'Page 2', reason: 'already_connected_to_another_account' }],
    }
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1), page(2)], maxPerBatch: 25 } })
    connectMetaPages.mockResolvedValue({ success: true, data: result })

    const props = renderPicker()
    await waitFor(() => expect(liveCount()).toContain('2 selected'))

    fireEvent.click(screen.getByRole('button', { name: /connect/i }))

    await waitFor(() => expect(props.onConnected).toHaveBeenCalledWith(result))
  })

  it('cannot submit with nothing selected', async () => {
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [page(1)], maxPerBatch: 25 } })

    renderPicker()
    await waitFor(() => expect(liveCount()).toContain('1 selected'))

    fireEvent.click(screen.getAllByRole('checkbox')[0])

    expect((screen.getByRole('button', { name: /connect/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(connectMetaPages).not.toHaveBeenCalled()
  })

  it('tells a client with no Pages what to do rather than showing a blank panel', async () => {
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: [], maxPerBatch: 25 } })

    renderPicker()

    await waitFor(() => expect(screen.getByText(/No Facebook Pages found/)).toBeTruthy())
  })

  it('surfaces a load failure as an alert', async () => {
    getSelectableMetaPages.mockResolvedValue({ success: false, error: 'Graph is down' })

    renderPicker()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('Graph is down')).toBeTruthy()
  })
})

describe('the batch cap comes from the server', () => {
  it('honours a smaller cap than the local default without a redeploy', async () => {
    // The cap is enforced server-side. Hard-coding a copy in the client is how
    // the two drift, and a client-side cap ABOVE the server's lets someone
    // compose a selection that is only refused after they hit Connect.
    const many = Array.from({ length: 30 }, (_, i) => page(i))
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: many, maxPerBatch: 3 } })

    renderPicker()

    await waitFor(() => expect(liveCount()).toContain('3 selected'))
    expect(liveCount()).toContain('3 is the maximum per batch')
  })

  it('falls back to 25 if the server omits the cap', async () => {
    const many = Array.from({ length: 30 }, (_, i) => page(i))
    getSelectableMetaPages.mockResolvedValue({ success: true, data: { pages: many, maxPerBatch: 0 } })

    renderPicker()

    await waitFor(() => expect(liveCount()).toContain('25 selected'))
  })
})
