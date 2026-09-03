import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const verifyMetaPageSubscriptions = vi.fn()

vi.mock('../services/api', () => ({
  connectMeta: (...a: unknown[]) => connectMeta(...a),
  disconnectMeta: (...a: unknown[]) => disconnectMeta(...a),
  disconnectMetaPage: (...a: unknown[]) => disconnectMetaPage(...a),
  getConnectedMetaPages: (...a: unknown[]) => getConnectedMetaPages(...a),
  getMetaLeads: (...a: unknown[]) => getMetaLeads(...a),
  getMetaStatus: (...a: unknown[]) => getMetaStatus(...a),
  verifyMetaPageSubscriptions: (...a: unknown[]) => verifyMetaPageSubscriptions(...a),
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
  verifyMetaPageSubscriptions.mockResolvedValue({
    success: true,
    data: { checked: 0, repaired: [], unrepairable: [], remaining: 0 },
  })
  window.history.replaceState({}, '', '/dashboard/meta-ads')
  // The repair effect gates itself once per browser session (sessionStorage),
  // not once per mount. Without clearing it here, only the first test in this
  // file would ever call verifyMetaPageSubscriptions.
  sessionStorage.clear()
})

describe('empty state', () => {
  it('shows the connect button when no Pages are connected', async () => {
    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/No Pages connected yet/)).toBeTruthy())
    expect(screen.getByRole('button', { name: /Connect with Facebook/i })).toBeTruthy()
  })
})

describe('connected Pages list', () => {
  it('lists every connected Page, with the pageId reachable for support', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1), page(2)] })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())
    expect(screen.getByText('Page 2')).toBeTruthy()
    // The pageId moved off the visible line -- the lead count and recency earn
    // that space -- but stays reachable on hover for a support conversation.
    expect(screen.getByTitle('page-1')).toBeTruthy()
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

    await waitFor(() => expect(screen.getByText(/Connected 1 Page.*1 needs attention/)).toBeTruthy())
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

    await waitFor(() => expect(screen.getByText(/Connected 0 Pages.*1 needs attention/)).toBeTruthy())
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

describe('the background subscription repair', () => {
  it('shows no repaired banner when there was nothing to repair', async () => {
    // The common case. A client reading their leads should not be told about a
    // maintenance pass that found everything healthy.
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    expect(screen.queryByText(/stopped/)).toBeFalsy()
    expect(toastShow).not.toHaveBeenCalled()
  })

  it('tells the client in lead terms, and names the Page, when it fixed one', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    verifyMetaPageSubscriptions.mockResolvedValue({
      success: true,
      data: { checked: 1, repaired: [{ pageId: 'page-1', pageName: 'Skyline Homes' }], unrepairable: [], remaining: 0 },
    })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/stopped.*receiving leads/)).toBeTruthy())
    expect(screen.getByText('Skyline Homes')).toBeTruthy()
    // This is a persistent panel, not a toast: the point of the redesign was
    // that a 3s toast is the wrong surface for something the client needs to
    // read and act on.
    expect(toastShow).not.toHaveBeenCalled()
  })

  it('says Page, not Pages, when it repaired exactly one', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    verifyMetaPageSubscriptions.mockResolvedValue({
      success: true,
      data: { checked: 1, repaired: [{ pageId: 'page-1', pageName: 'Page 1' }], unrepairable: [], remaining: 0 },
    })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/Reconnected 1 Page that/)).toBeTruthy())
  })

  it('says Pages, plural, when it repaired more than one', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1), page(2)] })
    verifyMetaPageSubscriptions.mockResolvedValue({
      success: true,
      data: {
        checked: 2,
        repaired: [
          { pageId: 'page-1', pageName: 'Page 1' },
          { pageId: 'page-2', pageName: 'Page 2' },
        ],
        unrepairable: [],
        remaining: 0,
      },
    })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/Reconnected 2 Pages that/)).toBeTruthy())
    // "Page 1"/"Page 2" render twice each (repaired banner + connected list) --
    // assert on presence via getAllByText rather than a getByText that would
    // throw on the ambiguity.
    expect(screen.getAllByText('Page 1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Page 2').length).toBeGreaterThanOrEqual(1)
  })

  it('reloads the Page list after a repair so the dashboard reflects the fix', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    verifyMetaPageSubscriptions.mockResolvedValue({
      success: true,
      data: { checked: 1, repaired: [{ pageId: 'page-1', pageName: 'Page 1' }], unrepairable: [], remaining: 0 },
    })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/Reconnected 1 Page that/)).toBeTruthy())
    // Once from the initial mount effect, once from the repair's own reload.
    await waitFor(() => expect(getConnectedMetaPages.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('the banner can be dismissed', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    verifyMetaPageSubscriptions.mockResolvedValue({
      success: true,
      data: { checked: 1, repaired: [{ pageId: 'page-1', pageName: 'Page 1' }], unrepairable: [], remaining: 0 },
    })

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText(/Reconnected 1 Page that/)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText(/Reconnected 1 Page that/)).toBeFalsy()
  })

  it('shows no repaired banner when the repair pass reports it could not fix a Page', async () => {
    // unrepairable is diagnostic (server logs), not a client-facing failure --
    // the client did not ask for this maintenance pass and should not be
    // handed an error about it.
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    verifyMetaPageSubscriptions.mockResolvedValue({
      success: true,
      data: { checked: 1, repaired: [], unrepairable: ['page-1'], remaining: 0 },
    })

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    expect(screen.queryByText(/stopped/)).toBeFalsy()
  })

  it('stays silent when the repair pass itself fails', async () => {
    // A background repair failing is not the client's problem to action.
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    verifyMetaPageSubscriptions.mockRejectedValue(new Error('network down'))

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())

    expect(screen.queryByText(/stopped/)).toBeFalsy()
    expect(toastShow).not.toHaveBeenCalled()
  })

  it('runs the repair check only once per browser session, not once per mount', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })

    const { unmount } = render(<MetaAds />)
    await waitFor(() => expect(verifyMetaPageSubscriptions).toHaveBeenCalledTimes(1))
    unmount()

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Page 1')).toBeTruthy())
    expect(verifyMetaPageSubscriptions).toHaveBeenCalledTimes(1)
  })
})

describe('a batch that ran out of Lambda time', () => {
  it('says the rest were not attempted, not that they failed', async () => {
    // "Meta refused the subscription" would be a lie and would send the client
    // looking for a problem on Facebook's side. Nothing was attempted, and
    // pressing Connect again is all it takes.
    window.history.replaceState({}, '', '/dashboard/meta-ads?meta=select_pages')

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByTestId('meta-page-picker')).toBeTruthy())

    pickerProps.onConnected?.({
      connected: [page(1)],
      skipped: [{ pageId: 'page-2', pageName: 'Page 2', reason: 'batch_budget_exceeded' }],
    })

    await waitFor(() => expect(screen.getByText(/not attempted/)).toBeTruthy())
    expect(screen.getByText(/press Add Pages again/)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Per-Page lead filtering. MetaLead already carries pageId, so this is entirely
// client-side -- no endpoint, no round trip.
// ---------------------------------------------------------------------------
function lead(n: number, pageId: string) {
  return {
    leadId: `lead-${n}`,
    pageId,
    clientId: 'client-1',
    source: 'meta' as const,
    name: `Lead ${n}`,
    phone: '+919876543210',
    customFields: '{}',
    sourceUrl: '',
    createdAt: '2026-09-01T00:00:00.000Z',
  }
}

describe('filtering leads by Page', () => {
  beforeEach(() => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1), page(2)] })
    getMetaLeads.mockResolvedValue({
      success: true,
      data: [lead(1, 'page-1'), lead(2, 'page-1'), lead(3, 'page-2')],
    })
  })

  it('counts leads per Page on each chip', async () => {
    render(<MetaAds />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Page 1 (2)' })).toBeTruthy())
    expect(screen.getByRole('button', { name: 'Page 2 (1)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All Pages (3)' })).toBeTruthy()
  })

  it('shows only that Page\'s leads once a chip is picked', async () => {
    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Lead 3')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Page 1 (2)' }))

    expect(screen.getByText('Lead 1')).toBeTruthy()
    expect(screen.getByText('Lead 2')).toBeTruthy()
    expect(screen.queryByText('Lead 3')).toBeNull()
  })

  it('marks the active chip pressed, so it is not conveyed by colour alone', async () => {
    render(<MetaAds />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'All Pages (3)' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Page 2 (1)' }))

    expect(screen.getByRole('button', { name: 'Page 2 (1)' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'All Pages (3)' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('announces something meaningful, not a bare count', async () => {
    // A screen reader hearing "1" learns nothing about what changed.
    render(<MetaAds />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('from every Page'))

    fireEvent.click(screen.getByRole('button', { name: 'Page 2 (1)' }))

    expect(screen.getByRole('status').textContent).toBe('1 lead from Page 2')
  })

  it('names the Page on each lead row, so a lead can be acted on', async () => {
    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText('Lead 3')).toBeTruthy())
    // Two leads from Page 1, one from Page 2 -- the chip also carries the name,
    // so match on the row-level element count rather than a single lookup.
    expect(screen.getAllByText('Page 1').length).toBeGreaterThanOrEqual(2)
  })

  it('offers a way back when the chosen Page has no leads', async () => {
    getMetaLeads.mockResolvedValue({ success: true, data: [lead(1, 'page-1')] })

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Lead 1')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Page 2 (0)' }))

    expect(screen.getByText(/No leads from Page 2 yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show every Page' }))
    expect(screen.getByText('Lead 1')).toBeTruthy()
  })

  it('keeps leads from a Page that was disconnected reachable', async () => {
    // Their leads still exist. Dropping the Page from the filter would strand
    // them with no way to view them.
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    getMetaLeads.mockResolvedValue({ success: true, data: [lead(1, 'page-1'), lead(9, 'page-gone')] })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Disconnected Page (1)' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Disconnected Page (1)' }))
    expect(screen.getByText('Lead 9')).toBeTruthy()
  })

  it('does not offer a filter when there is only one Page to filter by', async () => {
    // A filter with one option is decoration.
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1)] })
    getMetaLeads.mockResolvedValue({ success: true, data: [lead(1, 'page-1')] })

    render(<MetaAds />)
    await waitFor(() => expect(screen.getByText('Lead 1')).toBeTruthy())

    expect(screen.queryByRole('group', { name: 'Filter leads by Page' })).toBeNull()
  })
})

describe('per-Page lead totals on the connected list', () => {
  it('leads with recency, because that is what reveals a Page gone quiet', async () => {
    // A Page that broke days ago still shows a healthy cumulative count. The
    // date is the half that catches it.
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    getConnectedMetaPages.mockResolvedValue({
      success: true,
      data: [page(1, { leadCount: 39, lastLeadAt: twoHoursAgo })],
    })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/39 leads · last 2 hours ago/)).toBeTruthy())
  })

  it('says a Page has produced nothing rather than showing a bare zero', async () => {
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1, { leadCount: 0 })] })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText('No leads yet')).toBeTruthy())
  })

  it('says lead, not leads, for a single one', async () => {
    getConnectedMetaPages.mockResolvedValue({
      success: true,
      data: [page(1, { leadCount: 1, lastLeadAt: new Date(Date.now() - 60_000).toISOString() })],
    })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/^1 lead · /)).toBeTruthy())
  })

  it('never renders a lead as arriving in the future when clocks disagree', async () => {
    // Server stamps the lead, browser renders it. A few seconds of skew must not
    // produce "last in 4 seconds".
    const slightlyAhead = new Date(Date.now() + 5000).toISOString()
    getConnectedMetaPages.mockResolvedValue({
      success: true,
      data: [page(1, { leadCount: 3, lastLeadAt: slightlyAhead })],
    })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByText(/3 leads · last/)).toBeTruthy())
    expect(screen.queryByText(/ in /)).toBeNull()
  })
})

describe('when the leads window is full', () => {
  it('says the list is a window, so its counts are not read as lifetime totals', async () => {
    // The per-Page totals above ARE lifetime. These are not. Saying so stops the
    // two disagreeing silently.
    getConnectedMetaPages.mockResolvedValue({ success: true, data: [page(1), page(2)] })
    getMetaLeads.mockResolvedValue({
      success: true,
      data: Array.from({ length: 50 }, (_, i) => lead(i, i % 2 ? 'page-1' : 'page-2')),
    })

    render(<MetaAds />)

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/most recent/))
  })
})
