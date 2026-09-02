import { beforeEach, describe, expect, it, vi } from 'vitest'

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
const exchangeCodeForLongLivedUserToken = vi.fn<(code: string) => Promise<string>>()

vi.mock('../providers/meta-provider.js', () => ({
  metaProvider: {
    fetchAllManageablePages,
    subscribePageToWebhook,
    unsubscribePageFromWebhook,
    exchangeCodeForLongLivedUserToken,
  },
}))

interface PageRow {
  pageId: string
  clientId: string
  pageName?: string
  pageAccessTokenEncrypted?: string
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

class MetaPageConflictError extends Error {}

vi.mock('../repositories/meta-lead-repository.js', () => ({
  setPageClientMapping,
  removePageClientMapping,
  listPagesForClient,
  getPageRegistration,
  getClientIdForPage,
  getClientIdsForPages,
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
