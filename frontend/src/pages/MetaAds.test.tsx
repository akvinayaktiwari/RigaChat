import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MetaConnectPagesResult, MetaPageSummary } from '../types/index'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const connectMeta = vi.fn()
const disconnectMeta = vi.fn()
const disconnectMetaPage = vi.fn()
const getConnectedMetaPages = vi.fn()
const getMetaLeads = vi.fn()
const getMetaStatus = vi.fn()

vi.mock('../services/api', () => ({
  connectMeta: (...a: unknown[]) => connectMeta(...a),
  disconnectMeta: (...a: unknown[]) => disconnectMeta(...a),
  disconnectMetaPage: (...a: unknown[]) => disconnectMetaPage(...a),
  getConnectedMetaPages: (...a: unknown[]) => getConnectedMetaPages(...a),
  getMetaLeads: (...a: unknown[]) => getMetaLeads(...a),
  getMetaStatus: (...a: unknown[]) => getMetaStatus(...a),
}))

const toastShow = vi.fn()
vi.mock('../components/Toast/Toast', () => ({ useToast: () => ({ show: toastShow }) }))

// MetaPagePicker owns its own load/submit flow, thoroughly covered by
// MetaPagePicker.test.tsx. Here it is a stub whose callback props we can
// trigger directly, so MetaAds is exercised for what IT does with the result
// (partial-success summary, token-expired banner, refresh) rather than
// re-testing the picker's internals.
const pickerProps: { onClose?: () => void; onTokenExpired?: () => void; onConnected?: (r: unknown) => void } = {}
vi.mock('../components/MetaPagePicker', () => ({
  default: (props: { onClose: () => void; onTokenExpired: () => void; onConnected: (r: unknown) => void }) => {
    pickerProps.onClose = props.onClose
    pickerProps.onTokenExpired = props.onTokenExpired
    pickerProps.onConnected = props.onConnected
    return <div data-testid="meta-page-picker" />
  },
}))

const MetaAds = (await import('./MetaAds')).default

function page(n: number, over: Partial<MetaPageSummary> = {}): MetaPageSummary {
  return {
    pageId: `page-${n}`,
    clientId: 'client-1',
    pageName: `Page ${n}`,
    connectedAt: '2026-01-01T00:00:00.000Z',
    lastVerifiedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

beforeEach(() => {
  getMetaStatus.mockResolvedValue({ success: true, data: null })
  getMetaLeads.mockResolvedValue({ success: true, data: [] })
  getConnectedMetaPages.mockResolvedValue({ success: true, data: [] })
  window.history.replaceState({}, '', '/dashboard/meta-ads')
})

describe('empty state', () => {
  it('shows the connect button when no Pages are connected', async () => {
    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/No Pages connected yet/)).toBeTruthy())
    expect(screen.getByRole('button', { name: /Connect with Facebook/i })).toBeTruthy()
  })
})

describe('connected Pages list', () => {
  it('lists every connected Page with its pageId', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1), page(2)] })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())
    expect(screen.getByText('Page 2')).toBeTruthy()
    expect(screen.getByText('page-1')).toBeTruthy()
    expect(screen.getByText('Connected Pages (2)')).toBeTruthy()
  })

  it('shows Connected badge once at least one Page is connected, even with no legacy status', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
  })
})

describe('per-Page disconnect', () => {
  it('does nothing when the confirm dialog is declined', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    expect(disconnectMetaPage).not.toHaveBeenCalled()
  })

  it('disconnects the Page, toasts, and reloads the list on confirm', async () => {
    getConnectedMetaPages
      .mockResolvedValueOnce({ success: true, data: [page(1)] })
      .mockResolvedValueOnce({ success: true, data: [] })
    disconnectMetaPage.mockResolvedValue({ success: true, data: { success: true } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() => expect(disconnectMetaPage).toHaveBeenCalledWith('page-1'))
    await waitFor(() => expect(toastShow).toHaveBeenCalledWith('Page 1 disconnected', 'success'))
    await waitFor(() => expect(getConnectedMetaPages).toHaveBeenCalledTimes(2))
  })

  it('toasts the server error instead of silently failing', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    disconnectMetaPage.mockResolvedValue({ success: false, error: 'Page still has an active journey' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() =>
      expect(toastShow).toHaveBeenCalledWith('Page still has an active journey', 'error')
    )
  })
})

describe('disconnect all', () => {
  it('clears connected status on success', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    disconnectMeta.mockResolvedValue({ success: true, data: { success: true } })

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Disconnect all/i }))

    await waitFor(() => expect(toastShow).toHaveBeenCalledWith('Meta Ads disconnected', 'success'))
  })

  it('toasts a failure without throwing', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    disconnectMeta.mockRejectedValue(new Error('network down'))

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Disconnect all/i }))

    await waitFor(() => expect(toastShow).toHaveBeenCalledWith('Failed to disconnect Meta Ads', 'error'))
  })
})

describe('connect error banner', () => {
  it('maps a known reason code to its specific message', async () => {
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=error&reason=no_pages')

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText(/No Facebook Page found on that account/)).toBeTruthy()
  })

  it('falls back to a generic message for an unknown reason code', async () => {
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=error&reason=something_new')

    render(<MetaAds />)

    await waitFor(() =>
      expect(screen.getByText(/Couldn.t connect Meta Ads. Please try again/)).toBeTruthy()
    )
  })

  it('can be dismissed', async () => {
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=error&reason=no_pages')

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Dismiss/i }))

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('the select_pages redirect', () => {
  it('opens the picker and strips the query param', async () => {
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=select_pages')

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByTestId('meta-page-picker')).toBeTruthy())
    expect(window.location.search).toBe('')
  })
})

describe('picker callbacks surfaced by MetaAds', () => {
  it('shows the partial-success summary and refreshes the Page list', async () => {
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=select_pages')
    getConnectedMetaPages
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [page(1)] })

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByTestId('meta-page-picker')).toBeTruthy())

    const result: MetaConnectPagesResult = {
      connected: [page(1)],
      skipped: [{ pageId: 'page-2', pageName: 'Page 2', reason: 'already_connected_to_another_account' }],
    }
    pickerProps.onConnected?.(result)

    await waitFor(() => expect(screen.getByText('Connected 1 of 2 Pages')).toBeTruthy())
    expect(screen.getByText(/Page 2.*already connected to another account/)).toBeTruthy()
    await waitFor(() => expect(toastShow).toHaveBeenCalledWith('Connected 1 Page', 'success'))
  })

  it('does not toast a success message when nothing actually connected', async () => {
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=select_pages')

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByTestId('meta-page-picker')).toBeTruthy())

    pickerProps.onConnected?.({
      connected: [],
      skipped: [{ pageId: 'page-2', pageName: 'Page 2', reason: 'subscribe_failed' }],
    })

    await waitFor(() => expect(screen.getByText('Connected 0 of 1 Pages')).toBeTruthy())
    expect(toastShow).not.toHaveBeenCalledWith(expect.stringContaining('Connected'), 'success')
  })

  it('shows the reconnect banner, not an empty list, on an expired token', async () => {
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=select_pages')

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByTestId('meta-page-picker')).toBeTruthy())

    pickerProps.onTokenExpired?.()

    await waitFor(() => expect(screen.getByText(/Your Facebook connection expired/)).toBeTruthy())
    expect(screen.queryByTestId('meta-page-picker')).toBeNull()
  })

  it('reconnecting from the expired-token banner starts a fresh connect', async () => {
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=select_pages')

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByTestId('meta-page-picker')).toBeTruthy())
    pickerProps.onTokenExpired?.()
    await waitFor(() => expect(screen.getByText(/Your Facebook connection expired/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Reconnect/i }))

    expect(connectMeta).toHaveBeenCalled()
  })
})

describe('a connection that predates the Page registry', () => {
  // The backfill has not reached this client, so GET /meta/pages returns [] while
  // metaConnection is live and leads are arriving. Branching the panel on
  // pages.length alone put "No Pages connected yet" and a Connect button
  // directly under a "Connected" badge, for a working account.
  beforeEach(() => {
    getMetaStatus.mockResolvedValue({
      success: true,
      data: { connected: true, pageId: 'page-1', pageName: 'Skyline Homes' },
    })
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [] })
  })

  it('does not offer to connect an account that is already connected', async () => {
    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText('Connected')).toBeTruthy())
    expect(screen.queryByText(/No Pages connected yet/)).toBeNull()
  })

  it('says the connection is live rather than showing an empty list', async () => {
    render(<MetaAds />)

    await waitFor(() =>
      expect(screen.getByText(/Your Facebook connection is active and leads are arriving/)).toBeTruthy()
    )
  })

  it('still offers Add Pages so they can reach the picker', async () => {
    render(<MetaAds />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Pages' })).toBeTruthy())
  })
})

describe('per-Page disconnect when the network fails', () => {
  it('tells the client the Page is still connected instead of failing silently', async () => {
    // A rejected promise here was an unhandled rejection: the row stopped
    // spinning and nothing was said either way.
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    disconnectMetaPage.mockRejectedValue(new Error('network down'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    await waitFor(() =>
      expect(toastShow).toHaveBeenCalledWith(expect.stringContaining('still connected'), 'error')
    )
  })
})
