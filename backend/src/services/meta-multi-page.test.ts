import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The bug this file exists for: exchangeCodeForPageCredentials took
// pagesData.data?.[0], so a client who approved several Pages on Meta's own
// consent screen got exactly one, chosen by array order. Leads from the rest
// never arrived, with no error anywhere.

interface ProviderPage {
  pageId: string
  pageName: string
  pageAccessToken: string
}

const fetchAllManageablePages = vi.fn<(token: string) => Promise<ProviderPage[]>>()
const subscribePageToWebhook = vi.fn<(pageId: string, token: string) => Promise<void>>()
const unsubscribePageFromWebhook = vi.fn<(pageId: string, token: string) => Promise<void>>()
const isPageSubscribedToLeadgen = vi.fn<(pageId: string, token: string) => Promise<boolean>>()
const exchangeCodeForLongLivedUserToken = vi.fn<(code: string) => Promise<string>>()

vi.mock('../providers/meta-provider.js', () => ({
  metaProvider: {
    fetchAllManageablePages,
    subscribePageToWebhook,
    unsubscribePageFromWebhook,
    isPageSubscribedToLeadgen,
    exchangeCodeForLongLivedUserToken,
  },
}))

// Mirrors MetaPageRegistration. Kept in step with it deliberately: `npm test`
// does not typecheck in this repo, so a field missing here is invisible until
// `npm run build` fails -- which is how it was caught, twice.
interface PageRow {
  pageId: string
  clientId: string
  pageName?: string
  pageAccessTokenEncrypted?: string
  connectedAt?: string
  lastVerifiedAt?: string
}

const setPageClientMapping =
  vi.fn<(pageId: string, clientId: string, page?: { pageName: string; pageAccessTokenEncrypted: string }) => Promise<void>>()
const removePageClientMapping = vi.fn<(pageId: string) => Promise<void>>()
const listPagesForClient = vi.fn<(clientId: string) => Promise<PageRow[]>>()
const getPageRegistration = vi.fn<(pageId: string) => Promise<PageRow | null>>()
const getClientIdForPage = vi.fn<(pageId: string) => Promise<string | null>>()
// Batched: the picker asks about every Page the person administers at once, so
// one BatchGet replaced a point read per Page.
const getClientIdsForPages = vi.fn<(pageIds: string[]) => Promise<Map<string, string>>>()
const markPageVerified = vi.fn<(pageId: string) => Promise<void>>()

class MetaPageConflictError extends Error {}

vi.mock('../repositories/meta-lead-repository.js', () => ({
  setPageClientMapping,
  removePageClientMapping,
  listPagesForClient,
  getPageRegistration,
  getClientIdForPage,
  getClientIdsForPages,
  markPageVerified,
  createMetaLead: async () => ({}),
  getMetaLeadsByClientId: async () => [],
  updateMetaLeadSyncStatus: async () => undefined,
  MetaPageConflictError,
}))

const updateClient = vi.fn<(clientId: string, patch: Record<string, unknown>) => Promise<void>>()
let clientRecord: Record<string, unknown> | null = { clientId: 'client-1', metaUserTokenEncrypted: 'enc-user' }
vi.mock('../repositories/client-repository.js', () => ({
  getClientById: async () => clientRecord,
  updateClient,
  removeClientMetaConnection: async () => undefined,
}))

vi.mock('../lib/kms.js', () => ({
  encrypt: async (v: string) => `enc(${v})`,
  decrypt: async (v: string) => v.replace(/^enc\(|\)$/g, '').replace(/^enc-/, ''),
}))

const {
  connectMetaPages,
  listSelectablePages,
  listConnectedPages,
  disconnectMetaPage,
  disconnectAllMetaPages,
  beginMetaConnection,
  reconcilePageSubscriptions,
} = await import('./meta-lead-service.js')
const { MetaTooManyPagesError, MetaUserTokenExpiredError, MetaPagesLookupError } = await import(
  '../lib/meta-connect-errors.js'
)

const page = (n: number) => ({ pageId: `page-${n}`, pageName: `Page ${n}`, pageAccessToken: `tok-${n}` })

beforeEach(() => {
  vi.clearAllMocks()
  clientRecord = { clientId: 'client-1', metaUserTokenEncrypted: 'enc-user' }
  fetchAllManageablePages.mockResolvedValue([page(1), page(2), page(3)])
  subscribePageToWebhook.mockResolvedValue(undefined)
  unsubscribePageFromWebhook.mockResolvedValue(undefined)
  exchangeCodeForLongLivedUserToken.mockResolvedValue('user-token')
  removePageClientMapping.mockResolvedValue(undefined)
  updateClient.mockResolvedValue(undefined)
  listPagesForClient.mockResolvedValue([])
  getClientIdForPage.mockResolvedValue(null)
  getClientIdsForPages.mockResolvedValue(new Map())
  markPageVerified.mockResolvedValue(undefined)
  isPageSubscribedToLeadgen.mockResolvedValue(true)
  getPageRegistration.mockResolvedValue(null)
  setPageClientMapping.mockResolvedValue(undefined)
})

describe('connectMetaPages', () => {
  it('connects EVERY selected Page, not just the first', async () => {
    // The whole bug, in one assertion.
    const result = await connectMetaPages('client-1', ['page-1', 'page-2', 'page-3'])

    expect(result.connected).toHaveLength(3)
    expect(result.skipped).toEqual([])
    expect(setPageClientMapping).toHaveBeenCalledTimes(3)
    expect(subscribePageToWebhook).toHaveBeenCalledTimes(3)
  })

  it('subscribes each connected Page to the leadgen webhook', async () => {
    // Without the subscription Meta never delivers a lead for that Page and the
    // dashboard still says "connected" -- an invisible failure.
    await connectMetaPages('client-1', ['page-1', 'page-2'])

    expect(subscribePageToWebhook).toHaveBeenCalledWith('page-1', 'tok-1')
    expect(subscribePageToWebhook).toHaveBeenCalledWith('page-2', 'tok-2')
  })

  it('stores each Page token against its own pageId', async () => {
    await connectMetaPages('client-1', ['page-1', 'page-2'])

    expect(setPageClientMapping).toHaveBeenCalledWith('page-1', 'client-1', {
      pageName: 'Page 1',
      pageAccessTokenEncrypted: 'enc(tok-1)',
    })
    expect(setPageClientMapping).toHaveBeenCalledWith('page-2', 'client-1', {
      pageName: 'Page 2',
      pageAccessTokenEncrypted: 'enc(tok-2)',
    })
  })

  it('connects only what was selected', async () => {
    const result = await connectMetaPages('client-1', ['page-2'])

    expect(result.connected.map((p) => p.pageId)).toEqual(['page-2'])
    expect(setPageClientMapping).toHaveBeenCalledTimes(1)
  })

  it('skips a Page claimed by another account and still connects the rest', async () => {
    // Failing the batch would let one conflicting Page block the others,
    // punishing the client for something they can neither see nor fix.
    setPageClientMapping.mockImplementation(async (pageId: string) => {
      if (pageId === 'page-2') throw new MetaPageConflictError('taken')
      return undefined
    })

    const result = await connectMetaPages('client-1', ['page-1', 'page-2', 'page-3'])

    expect(result.connected.map((p) => p.pageId)).toEqual(['page-1', 'page-3'])
    expect(result.skipped).toEqual([
      { pageId: 'page-2', pageName: 'Page 2', reason: 'already_connected_to_another_account' },
    ])
  })

  it('releases the claim when the webhook subscription fails', async () => {
    // A claimed Page with no subscription is the worst state: it looks
    // connected and can never receive a lead.
    subscribePageToWebhook.mockImplementation(async (pageId: string) => {
      if (pageId === 'page-2') throw new Error('Graph said no')
      return undefined
    })

    const result = await connectMetaPages('client-1', ['page-1', 'page-2'])

    expect(removePageClientMapping).toHaveBeenCalledWith('page-2')
    expect(result.skipped).toEqual([
      { pageId: 'page-2', pageName: 'Page 2', reason: 'subscribe_failed' },
    ])
    expect(result.connected.map((p) => p.pageId)).toEqual(['page-1'])
  })

  it('rejects more than 25 Pages in one request without connecting any', async () => {
    const many = Array.from({ length: 26 }, (_, i) => `page-${i}`)

    await expect(connectMetaPages('client-1', many)).rejects.toBeInstanceOf(MetaTooManyPagesError)
    expect(setPageClientMapping).not.toHaveBeenCalled()
  })

  it('reports an expired user token rather than connecting nothing silently', async () => {
    clientRecord = { clientId: 'client-1' }

    await expect(connectMetaPages('client-1', ['page-1'])).rejects.toBeInstanceOf(
      MetaUserTokenExpiredError
    )
  })
})

describe('listSelectablePages', () => {
  it('marks the client own Pages connected and other accounts Pages unavailable', async () => {
    listPagesForClient.mockResolvedValue([{ pageId: 'page-1', clientId: 'client-1' }])
    getClientIdsForPages.mockResolvedValue(new Map([['page-3', 'someone-else']]))

    const pages = await listSelectablePages('client-1')

    expect(pages).toEqual([
      { pageId: 'page-1', pageName: 'Page 1', connected: true, unavailable: false },
      { pageId: 'page-2', pageName: 'Page 2', connected: false, unavailable: false },
      { pageId: 'page-3', pageName: 'Page 3', connected: false, unavailable: true },
    ])
  })

  it('surfaces an expired token as reconnect, never as an empty Page list', async () => {
    // Rendering expiry as "no Pages" tells the client their Pages are gone,
    // when every connected Page is still receiving leads.
    clientRecord = { clientId: 'client-1' }

    await expect(listSelectablePages('client-1')).rejects.toBeInstanceOf(MetaUserTokenExpiredError)
  })

  it('includes a Page created on Facebook after the initial connect', async () => {
    // The reason the user token is stored at all: no re-auth to see new Pages.
    fetchAllManageablePages.mockResolvedValue([page(1), page(9)])

    const pages = await listSelectablePages('client-1')

    expect(pages.map((p) => p.pageId)).toContain('page-9')
  })
})

describe('disconnect', () => {
  it('removes one Page and unsubscribes its webhook', async () => {
    getPageRegistration.mockResolvedValue({
      pageId: 'page-1',
      clientId: 'client-1',
      pageAccessTokenEncrypted: 'enc-tok-1',
    })

    await disconnectMetaPage('client-1', 'page-1')

    expect(unsubscribePageFromWebhook).toHaveBeenCalledWith('page-1', 'tok-1')
    expect(removePageClientMapping).toHaveBeenCalledWith('page-1')
  })

  it('refuses to remove a Page owned by another client', async () => {
    // Otherwise a stale local view lets one tenant delete another tenant's
    // live lead routing through their own disconnect call.
    getPageRegistration.mockResolvedValue({ pageId: 'page-1', clientId: 'someone-else' })

    await disconnectMetaPage('client-1', 'page-1')

    expect(removePageClientMapping).not.toHaveBeenCalled()
  })

  it('still removes the Page when unsubscribing fails', async () => {
    // A revoked token cannot be unsubscribed; that must not trap the Page in
    // the client's account forever.
    getPageRegistration.mockResolvedValue({
      pageId: 'page-1',
      clientId: 'client-1',
      pageAccessTokenEncrypted: 'enc-tok-1',
    })
    unsubscribePageFromWebhook.mockRejectedValue(new Error('token revoked'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await disconnectMetaPage('client-1', 'page-1')

    expect(removePageClientMapping).toHaveBeenCalledWith('page-1')
  })

  it('disconnect-all removes every Page AND deletes the stored user token', async () => {
    // "Disconnect" has to mean disconnected. Keeping a credential that can
    // enumerate someone's Facebook assets after they asked us to stop is not
    // defensible.
    listPagesForClient.mockResolvedValue([
      { pageId: 'page-1', clientId: 'client-1' },
      { pageId: 'page-2', clientId: 'client-1' },
    ])
    getPageRegistration.mockImplementation(async (pageId: string) => ({
      pageId,
      clientId: 'client-1',
    }))

    await disconnectAllMetaPages('client-1')

    expect(removePageClientMapping).toHaveBeenCalledWith('page-1')
    expect(removePageClientMapping).toHaveBeenCalledWith('page-2')
    expect(updateClient).toHaveBeenCalledWith('client-1', { metaUserTokenEncrypted: undefined })
  })
})

describe('beginMetaConnection', () => {
  it('exchanges the code and stores the encrypted long-lived user token', async () => {
    exchangeCodeForLongLivedUserToken.mockResolvedValue('fresh-user-token')

    await beginMetaConnection('client-1', 'auth-code')

    expect(exchangeCodeForLongLivedUserToken).toHaveBeenCalledWith('auth-code')
    expect(updateClient).toHaveBeenCalledWith('client-1', { metaUserTokenEncrypted: 'enc(fresh-user-token)' })
  })
})

describe('listConnectedPages', () => {
  it('returns the client Pages without their access tokens', async () => {
    listPagesForClient.mockResolvedValue([
      { pageId: 'page-1', clientId: 'client-1', pageName: 'Page 1', pageAccessTokenEncrypted: 'enc-tok-1' },
    ])

    const result = await listConnectedPages('client-1')

    expect(result).toEqual([{ pageId: 'page-1', clientId: 'client-1', pageName: 'Page 1' }])
    expect(result[0]).not.toHaveProperty('pageAccessTokenEncrypted')
  })

  it('returns an empty list for a client with no Pages', async () => {
    listPagesForClient.mockResolvedValue([])

    await expect(listConnectedPages('client-1')).resolves.toEqual([])
  })
})

describe('listSelectablePages token expiry via Graph rejection', () => {
  it('translates a Graph lookup failure into MetaUserTokenExpiredError, not a 500', async () => {
    // The stored token can still be present but no longer valid on Meta's
    // side -- Graph rejecting it must read the same as a missing token.
    fetchAllManageablePages.mockRejectedValue(new MetaPagesLookupError('Error validating access token'))

    await expect(listSelectablePages('client-1')).rejects.toBeInstanceOf(MetaUserTokenExpiredError)
  })

  it('propagates a non-lookup error from fetchAllManageablePages as-is', async () => {
    fetchAllManageablePages.mockRejectedValue(new Error('network blip'))

    await expect(listSelectablePages('client-1')).rejects.toThrow('network blip')
  })
})

describe('disconnect-all when a Page fails', () => {
  beforeEach(() => {
    listPagesForClient.mockResolvedValue([
      { pageId: 'page-1', clientId: 'client-1' },
      { pageId: 'page-2', clientId: 'client-1' },
    ])
    getPageRegistration.mockImplementation(async (pageId: string) => ({ pageId, clientId: 'client-1' }))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // The dangerous version of this bug: a sequential loop threw on Page 1, so
  // updateClient never ran and we kept a live Meta user token for a client who
  // had just asked us to disconnect. Silent, and indefinite.
  it('still deletes the stored user token when one Page cannot be removed', async () => {
    removePageClientMapping.mockImplementation(async (pageId: string) => {
      if (pageId === 'page-1') throw new Error('ddb down')
    })

    await expect(disconnectAllMetaPages('client-1')).rejects.toThrow(/could not be removed/)

    expect(updateClient).toHaveBeenCalledWith('client-1', { metaUserTokenEncrypted: undefined })
  })

  it('removes the Pages that can be removed rather than stopping at the first failure', async () => {
    removePageClientMapping.mockImplementation(async (pageId: string) => {
      if (pageId === 'page-1') throw new Error('ddb down')
    })

    await expect(disconnectAllMetaPages('client-1')).rejects.toThrow()

    expect(removePageClientMapping).toHaveBeenCalledWith('page-2')
  })

  it('tells the client how many Pages are still attached', async () => {
    removePageClientMapping.mockImplementation(async (pageId: string) => {
      if (pageId === 'page-1') throw new Error('ddb down')
    })

    await expect(disconnectAllMetaPages('client-1')).rejects.toThrow('1 of 2 Page(s) could not be removed')
  })
})

describe('connecting a batch concurrently', () => {
  // Concurrency must not reorder the result: the connected and skipped lists
  // are read by a human against the order they picked.
  it('reports Pages in the order they were selected, not the order Graph replied', async () => {
    const many = Array.from({ length: 12 }, (_, i) => page(i + 1))
    fetchAllManageablePages.mockResolvedValue(many)
    // Later Pages resolve first, so an order-naive implementation shuffles.
    subscribePageToWebhook.mockImplementation(async (pageId: string) => {
      const n = Number(pageId.split('-')[1])
      await new Promise((resolve) => setTimeout(resolve, (12 - n) * 2))
    })

    const result = await connectMetaPages('client-1', many.map((p) => p.pageId))

    expect(result.connected.map((p) => p.pageId)).toEqual(many.map((p) => p.pageId))
  })

  it('does not put the whole batch in flight at once', async () => {
    const many = Array.from({ length: 12 }, (_, i) => page(i + 1))
    fetchAllManageablePages.mockResolvedValue(many)

    let inFlight = 0
    let peak = 0
    subscribePageToWebhook.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      inFlight -= 1
    })

    await connectMetaPages('client-1', many.map((p) => p.pageId))

    // Bounded: 25 simultaneous Graph calls trades a Lambda timeout for a rate limit.
    expect(peak).toBeLessThanOrEqual(5)
    expect(peak).toBeGreaterThan(1)
  })
})

describe('the user token expiring mid-flow', () => {
  // The picker can sit open while a ~60-day token reaches its last minute. If
  // Connect then surfaces a generic 500, the dashboard says "could not reach
  // Meta" and offers no way back -- defeating the expired-vs-empty distinction
  // the rest of this work exists to draw.
  it('reports Connect against a dead token as reconnect, not a server error', async () => {
    fetchAllManageablePages.mockRejectedValue(new MetaPagesLookupError('token invalid'))

    await expect(connectMetaPages('client-1', ['page-1'])).rejects.toBeInstanceOf(
      MetaUserTokenExpiredError
    )
  })

  it('claims nothing when the token dies before the batch starts', async () => {
    fetchAllManageablePages.mockRejectedValue(new MetaPagesLookupError('token invalid'))

    await expect(connectMetaPages('client-1', ['page-1'])).rejects.toThrow()

    expect(setPageClientMapping).not.toHaveBeenCalled()
  })
})

describe('a Page landing mid-disconnect', () => {
  // A connect running in another tab can register a Page after disconnect-all
  // snapshots the list. That Page carries its OWN token, so deleting the user
  // token does not stop its leads: it would keep delivering indefinitely to a
  // client who was told everything was disconnected.
  it('sweeps up a Page that appeared after the first pass', async () => {
    listPagesForClient
      .mockResolvedValueOnce([{ pageId: 'page-1', clientId: 'client-1' }])
      .mockResolvedValueOnce([{ pageId: 'page-9', clientId: 'client-1' }])
      .mockResolvedValue([])
    getPageRegistration.mockImplementation(async (pageId: string) => ({ pageId, clientId: 'client-1' }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await disconnectAllMetaPages('client-1')

    expect(removePageClientMapping).toHaveBeenCalledWith('page-1')
    expect(removePageClientMapping).toHaveBeenCalledWith('page-9')
  })

  it('still deletes the user token after the sweep', async () => {
    listPagesForClient
      .mockResolvedValueOnce([{ pageId: 'page-1', clientId: 'client-1' }])
      .mockResolvedValueOnce([{ pageId: 'page-9', clientId: 'client-1' }])
      .mockResolvedValue([])
    getPageRegistration.mockImplementation(async (pageId: string) => ({ pageId, clientId: 'client-1' }))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await disconnectAllMetaPages('client-1')

    expect(updateClient).toHaveBeenCalledWith('client-1', { metaUserTokenEncrypted: undefined })
  })
})

describe('repairing a Page that is claimed but not subscribed', () => {
  const STALE = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const FRESH = new Date().toISOString()

  function owned(pageId: string, lastVerifiedAt: string) {
    return {
      pageId,
      clientId: 'client-1',
      pageName: `Page ${pageId}`,
      pageAccessTokenEncrypted: `enc-${pageId}`,
      lastVerifiedAt,
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // The state a Lambda timeout leaves behind: connectMetaPages claims the Page,
  // then the process dies before subscribing AND before the rollback. The
  // dashboard shows "Connected" and not one lead ever arrives.
  it('re-subscribes a Page Meta says is not subscribed', async () => {
    listPagesForClient.mockResolvedValue([owned('page-1', STALE)])
    isPageSubscribedToLeadgen.mockResolvedValue(false)

    const report = await reconcilePageSubscriptions('client-1')

    expect(subscribePageToWebhook).toHaveBeenCalledWith('page-1', 'page-1')
    expect(report.repaired).toEqual([{ pageId: 'page-1', pageName: 'Page page-1' }])
  })

  it('falls back to the pageId as the name when the row has none', async () => {
    listPagesForClient.mockResolvedValue([
      { pageId: 'page-1', clientId: 'client-1', pageAccessTokenEncrypted: 'enc-page-1' },
    ])
    isPageSubscribedToLeadgen.mockResolvedValue(false)

    const report = await reconcilePageSubscriptions('client-1')

    expect(report.repaired).toEqual([{ pageId: 'page-1', pageName: 'page-1' }])
  })

  it('leaves a healthy Page alone', async () => {
    listPagesForClient.mockResolvedValue([owned('page-1', STALE)])
    isPageSubscribedToLeadgen.mockResolvedValue(true)

    const report = await reconcilePageSubscriptions('client-1')

    expect(subscribePageToWebhook).not.toHaveBeenCalled()
    expect(report.repaired).toEqual([])
    expect(markPageVerified).toHaveBeenCalledWith('page-1')
  })

  // Bounded cost: one Graph call per Page would otherwise land on every
  // dashboard load.
  it('makes no Graph call for a Page checked recently', async () => {
    listPagesForClient.mockResolvedValue([owned('page-1', FRESH)])

    const report = await reconcilePageSubscriptions('client-1')

    expect(isPageSubscribedToLeadgen).not.toHaveBeenCalled()
    expect(report.checked).toBe(0)
  })

  it('checks a Page that has never been verified', async () => {
    listPagesForClient.mockResolvedValue([
      { pageId: 'page-1', clientId: 'client-1', pageAccessTokenEncrypted: 'enc-page-1' },
    ])

    await reconcilePageSubscriptions('client-1')

    expect(isPageSubscribedToLeadgen).toHaveBeenCalled()
  })

  it('skips a pre-registry row that has no token to authenticate with', async () => {
    listPagesForClient.mockResolvedValue([{ pageId: 'page-1', clientId: 'client-1' }])

    const report = await reconcilePageSubscriptions('client-1')

    expect(isPageSubscribedToLeadgen).not.toHaveBeenCalled()
    expect(report.checked).toBe(0)
  })

  // This runs alongside a normal dashboard read. One unreachable Page must not
  // take the whole page down.
  it('reports a Page it cannot check instead of throwing', async () => {
    listPagesForClient.mockResolvedValue([owned('page-1', STALE), owned('page-2', STALE)])
    isPageSubscribedToLeadgen.mockImplementation(async (pageId: string) => {
      if (pageId === 'page-1') throw new Error('graph down')
      return true
    })

    const report = await reconcilePageSubscriptions('client-1')

    expect(report.unrepairable).toEqual(['page-1'])
    expect(markPageVerified).toHaveBeenCalledWith('page-2')
  })

  it('does not mark a Page verified when re-subscribing it failed', async () => {
    // Otherwise the failure resets the staleness clock and the broken Page goes
    // unchecked for another twelve hours.
    listPagesForClient.mockResolvedValue([owned('page-1', STALE)])
    isPageSubscribedToLeadgen.mockResolvedValue(false)
    subscribePageToWebhook.mockRejectedValue(new Error('graph down'))

    const report = await reconcilePageSubscriptions('client-1')

    expect(markPageVerified).not.toHaveBeenCalled()
    expect(report.unrepairable).toEqual(['page-1'])
  })

  it('reports remaining: 0 when every stale Page was checked', async () => {
    listPagesForClient.mockResolvedValue([owned('page-1', STALE)])

    const report = await reconcilePageSubscriptions('client-1')

    expect(report.remaining).toBe(0)
  })

  // Caps the pass at 40 so one client with hundreds of stale Pages cannot blow
  // the same Lambda budget connectMetaPages guards.
  it('caps a pass at 40 Pages and reports the rest as remaining', async () => {
    const many = Array.from({ length: 45 }, (_, i) => owned(`page-${i + 1}`, STALE))
    listPagesForClient.mockResolvedValue(many)

    const report = await reconcilePageSubscriptions('client-1')

    expect(report.checked).toBe(40)
    expect(report.remaining).toBe(5)
  })

  // Oldest-first so a capped pass makes progress instead of re-checking the
  // same arbitrary slice on every load.
  it('checks the stalest Pages first when capped', async () => {
    const stalest = { ...owned('page-oldest', new Date(0).toISOString()) }
    const many = Array.from({ length: 40 }, (_, i) => owned(`page-${i + 1}`, STALE))
    listPagesForClient.mockResolvedValue([...many, stalest])

    await reconcilePageSubscriptions('client-1')

    expect(isPageSubscribedToLeadgen).toHaveBeenCalledWith('page-oldest', expect.anything())
  })

  it('stops starting new checks past its own deadline and reports them as remaining, not checked', async () => {
    const many = Array.from({ length: 10 }, (_, i) => owned(`page-${i + 1}`, STALE))
    listPagesForClient.mockResolvedValue(many)
    let call = 0
    const realNow = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call += 1
      // First call is Date.now() at the top of the function, second is
      // `startedAt` for the deadline math; every call after that must already
      // read past VERIFY_DEADLINE_MS so the guard fires for every row.
      return call <= 2 ? realNow : realNow + 21_000
    })

    const report = await reconcilePageSubscriptions('client-1')

    expect(isPageSubscribedToLeadgen).not.toHaveBeenCalled()
    expect(report.checked).toBe(0)
    expect(report.remaining).toBe(10)

    vi.restoreAllMocks()
  })
})

describe('running out of Lambda time mid-batch', () => {
  // The 60s limit used to be a cliff. A kill lands wherever it lands, and the
  // dangerous spot is between the claim and the webhook subscription: the Page
  // reads Connected and receives nothing, and the rollback died with the
  // process. Checked instead, the deadline becomes an outcome the client can
  // act on.
  afterEach(() => vi.restoreAllMocks())

  function clockThatJumps(afterCalls: number, jumpMs: number): void {
    const realNow = Date.now()
    let calls = 0
    vi.spyOn(Date, 'now').mockImplementation(() => {
      calls += 1
      return calls > afterCalls ? realNow + jumpMs : realNow
    })
  }

  it('reports the Pages it never got to, rather than being killed holding them', async () => {
    const many = Array.from({ length: 10 }, (_, i) => page(i + 1))
    fetchAllManageablePages.mockResolvedValue(many)
    clockThatJumps(3, 50_000)

    const result = await connectMetaPages('client-1', many.map((p) => p.pageId))

    const outOfTime = result.skipped.filter((p) => p.reason === 'batch_budget_exceeded')
    expect(outOfTime.length).toBeGreaterThan(0)
    expect(result.connected.length + result.skipped.length).toBe(10)
  })

  it('never claims a Page it does not go on to subscribe', async () => {
    // The whole point of checking BEFORE the claim rather than between the two.
    const many = Array.from({ length: 10 }, (_, i) => page(i + 1))
    fetchAllManageablePages.mockResolvedValue(many)
    clockThatJumps(3, 50_000)

    await connectMetaPages('client-1', many.map((p) => p.pageId))

    expect(setPageClientMapping.mock.calls.length).toBe(subscribePageToWebhook.mock.calls.length)
  })

  it('leaves the skipped Pages untouched so a retry picks them up', async () => {
    const many = Array.from({ length: 10 }, (_, i) => page(i + 1))
    fetchAllManageablePages.mockResolvedValue(many)
    clockThatJumps(3, 50_000)

    const result = await connectMetaPages('client-1', many.map((p) => p.pageId))

    const outOfTime = result.skipped.filter((p) => p.reason === 'batch_budget_exceeded')
    for (const skipped of outOfTime) {
      expect(setPageClientMapping).not.toHaveBeenCalledWith(skipped.pageId, 'client-1', expect.anything())
    }
  })

  it('does not fire the deadline on a batch that finishes in time', async () => {
    const many = Array.from({ length: 10 }, (_, i) => page(i + 1))
    fetchAllManageablePages.mockResolvedValue(many)

    const result = await connectMetaPages('client-1', many.map((p) => p.pageId))

    expect(result.connected).toHaveLength(10)
    expect(result.skipped).toEqual([])
  })

  // The guard is "checked BEFORE the atomic claim, never between claim and
  // webhook-subscribe" (see the comment on the guard itself). If a Page that
  // would otherwise conflict or fail subscription instead reports its own
  // reason once the deadline has already passed, that proves the deadline
  // check does NOT run first for every Page -- exactly the bug this ordering
  // guards against.
  it('reports batch_budget_exceeded, not the underlying conflict/subscribe reason, once the deadline has already passed', async () => {
    const many = Array.from({ length: 5 }, (_, i) => page(i + 1))
    fetchAllManageablePages.mockResolvedValue(many)
    // Deadline already blown before the first Page is even considered.
    let call = 0
    const realNow = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => {
      call += 1
      // First call is `startedAt`; every call after that must already read as
      // past the deadline so every Page's guard check fires.
      return call === 1 ? realNow : realNow + 46_000
    })
    setPageClientMapping.mockImplementation(async (pageId: string) => {
      if (pageId === 'page-2') throw new MetaPageConflictError('taken')
      return undefined
    })
    subscribePageToWebhook.mockImplementation(async (pageId: string) => {
      if (pageId === 'page-4') throw new Error('Graph said no')
      return undefined
    })

    const result = await connectMetaPages('client-1', many.map((p) => p.pageId))

    expect(result.connected).toEqual([])
    expect(result.skipped.every((s) => s.reason === 'batch_budget_exceeded')).toBe(true)
    expect(result.skipped.map((s) => s.pageId).sort()).toEqual(['page-1', 'page-2', 'page-3', 'page-4', 'page-5'])
    // Neither the conflict path nor the subscribe-failure path ran at all.
    expect(setPageClientMapping).not.toHaveBeenCalled()
    expect(subscribePageToWebhook).not.toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})

describe('bounding the repair pass', () => {
  const STALE_OLD = '2026-01-01T00:00:00.000Z'
  const STALE_NEW = '2026-06-01T00:00:00.000Z'

  function due(pageId: string, lastVerifiedAt: string) {
    return {
      pageId,
      clientId: 'client-1',
      pageName: `Page ${pageId}`,
      pageAccessTokenEncrypted: `enc-${pageId}`,
      lastVerifiedAt,
    }
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    isPageSubscribedToLeadgen.mockResolvedValue(true)
  })

  afterEach(() => vi.restoreAllMocks())

  // A client's Pages go stale TOGETHER -- connected in one batch, so they cross
  // the 12h boundary in one batch. Unbounded, an account with hundreds of Pages
  // turns one dashboard load into hundreds of Graph calls and blows the same
  // Lambda budget connectMetaPages guards.
  it('checks at most one pass worth of Pages, however many are due', async () => {
    listPagesForClient.mockResolvedValue(
      Array.from({ length: 120 }, (_, i) => due(`page-${i}`, STALE_OLD))
    )

    const report = await reconcilePageSubscriptions('client-1')

    expect(isPageSubscribedToLeadgen.mock.calls.length).toBeLessThanOrEqual(40)
    expect(report.checked).toBeLessThanOrEqual(40)
  })

  it('reports how many are still due so the pass is visibly partial', async () => {
    listPagesForClient.mockResolvedValue(
      Array.from({ length: 120 }, (_, i) => due(`page-${i}`, STALE_OLD))
    )

    const report = await reconcilePageSubscriptions('client-1')

    expect(report.remaining).toBe(80)
  })

  // Without an ordering, a capped pass re-checks an arbitrary slice forever and
  // the oldest Pages are never reached.
  it('takes the least recently verified Pages first', async () => {
    listPagesForClient.mockResolvedValue([
      due('fresh-1', STALE_NEW),
      due('oldest-1', STALE_OLD),
      due('fresh-2', STALE_NEW),
    ])

    await reconcilePageSubscriptions('client-1')

    expect(isPageSubscribedToLeadgen.mock.calls[0]?.[0]).toBe('oldest-1')
  })

  it('reports nothing remaining when it got through them all', async () => {
    listPagesForClient.mockResolvedValue([due('page-1', STALE_OLD)])

    const report = await reconcilePageSubscriptions('client-1')

    expect(report.remaining).toBe(0)
    expect(report.checked).toBe(1)
  })

  it('stops when it runs out of time rather than being killed mid-pass', async () => {
    listPagesForClient.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => due(`page-${i}`, STALE_OLD))
    )
    const realNow = Date.now()
    let calls = 0
    vi.spyOn(Date, 'now').mockImplementation(() => {
      calls += 1
      return calls > 4 ? realNow + 30_000 : realNow
    })

    const report = await reconcilePageSubscriptions('client-1')

    // Everything it skipped for time is still reported as due, so the next
    // dashboard load resumes rather than losing them.
    expect(report.remaining).toBeGreaterThan(0)
    expect(isPageSubscribedToLeadgen.mock.calls.length).toBeLessThan(30)
  })
})
