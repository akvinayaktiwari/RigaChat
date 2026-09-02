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

class MetaPageConflictError extends Error {}

vi.mock('../repositories/meta-lead-repository.js', () => ({
  setPageClientMapping,
  removePageClientMapping,
  listPagesForClient,
  getPageRegistration,
  getClientIdForPage,
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
  disconnectMetaPage,
  disconnectAllMetaPages,
} = await import('./meta-lead-service.js')
const { MetaTooManyPagesError, MetaUserTokenExpiredError } = await import('../lib/meta-connect-errors.js')

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
    getClientIdForPage.mockImplementation(async (pageId: string) =>
      pageId === 'page-3' ? 'someone-else' : null
    )

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
