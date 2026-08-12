import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetaMisconfiguredError, MetaTokenExchangeError } from '../lib/meta-connect-errors.js'
import { metaProvider } from './meta-provider.js'

// getOAuthUrl is the last thing that runs before we hand a client to Facebook.
// Anything wrong that it does not catch surfaces on Meta's domain, after the
// client has left the dashboard, with nothing in our logs.

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.META_APP_ID = '1620710049625709'
  process.env.META_REDIRECT_URI = 'https://api.example.com/api/integrations/meta/callback'
  delete process.env.NODE_ENV
  delete process.env.META_LOGIN_CONFIG_ID
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('getOAuthUrl', () => {
  it('builds a dialog URL carrying the app id, redirect, state and scopes', () => {
    const url = new URL(metaProvider.getOAuthUrl('client-1:abc123'))

    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth')
    expect(url.searchParams.get('client_id')).toBe('1620710049625709')
    expect(url.searchParams.get('state')).toBe('client-1:abc123')
    expect(url.searchParams.get('response_type')).toBe('code')
    // leads_retrieval is the scope App Review gates; losing it silently would
    // produce a connection that looks fine and returns no lead data.
    expect(url.searchParams.get('scope')).toContain('leads_retrieval')
    expect(url.searchParams.get('scope')).toContain('pages_show_list')
    // Meta rejects any App Review submission for leads_retrieval that does not
    // also request pages_manage_ads, however good the screencast is.
    expect(url.searchParams.get('scope')).toContain('pages_manage_ads')
  })

  // Facebook Login for Business drives the consent screen from a dashboard
  // configuration, not a scope string. Sending scopes to a config-driven app is
  // what produced Meta's "Facebook Login is currently unavailable for this app"
  // screen -- an error whose text names no cause, so the regression it guards
  // against would be invisible until a client hit it.
  it('sends config_id instead of scope when a login configuration is set', () => {
    process.env.META_LOGIN_CONFIG_ID = '000000000000001'

    const url = new URL(metaProvider.getOAuthUrl('client-1:abc123'))

    expect(url.searchParams.get('config_id')).toBe('000000000000001')
    expect(url.searchParams.get('scope')).toBeNull()
    // Without this, the dialog can return a token where we expect a `code`,
    // and exchangeCodeForPageCredentials has nothing to exchange.
    expect(url.searchParams.get('override_default_response_type')).toBe('true')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('client-1:abc123')
  })

  it('keeps the scope flow when no login configuration is set', () => {
    const url = new URL(metaProvider.getOAuthUrl('client-1:abc123'))

    expect(url.searchParams.get('config_id')).toBeNull()
    expect(url.searchParams.get('override_default_response_type')).toBeNull()
    expect(url.searchParams.get('scope')).toContain('leads_retrieval')
  })

  // The failure this guard exists for: Meta ACCEPTS a localhost redirect,
  // shows the consent screen, and only then answers "URL Blocked" -- on their
  // domain, after the client is gone. Caught before the redirect instead.
  it('refuses a localhost redirect URI in production', () => {
    process.env.NODE_ENV = 'production'
    process.env.META_REDIRECT_URI = 'http://localhost:3000/api/integrations/meta/callback'

    expect(() => metaProvider.getOAuthUrl('state')).toThrow(MetaMisconfiguredError)
    expect(() => metaProvider.getOAuthUrl('state')).toThrow(/localhost/)
  })

  it('refuses a 127.0.0.1 redirect URI in production too', () => {
    process.env.NODE_ENV = 'production'
    process.env.META_REDIRECT_URI = 'http://127.0.0.1:3000/api/integrations/meta/callback'

    expect(() => metaProvider.getOAuthUrl('state')).toThrow(MetaMisconfiguredError)
  })

  // Local development is the whole reason a localhost redirect exists.
  it('allows a localhost redirect outside production', () => {
    process.env.META_REDIRECT_URI = 'http://localhost:3000/api/integrations/meta/callback'

    expect(() => metaProvider.getOAuthUrl('state')).not.toThrow()
  })

  it('allows a real https redirect in production', () => {
    process.env.NODE_ENV = 'production'

    expect(() => metaProvider.getOAuthUrl('state')).not.toThrow()
  })

  it('reports a missing env var rather than building a broken URL', () => {
    delete process.env.META_APP_ID

    expect(() => metaProvider.getOAuthUrl('state')).toThrow(/META_APP_ID/)
  })
})

// A Page access token inherits the lifetime of the user token it was minted
// from. Minting it from the short-lived token yields a connection that works for
// about an hour and then fails every lead fetch -- with no error at connect time
// and nothing in the dashboard to distinguish it from Meta breaking. These tests
// exist because that failure is invisible until it is a production incident.
describe('exchangeCodeForPageCredentials', () => {
  function mockFetchSequence(responses: unknown[]): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn()
    for (const body of responses) {
      fetchMock.mockResolvedValueOnce({ json: async () => body } as unknown as Response)
    }
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  beforeEach(() => {
    process.env.META_APP_SECRET = 'app-secret'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exchanges the short-lived token for a long-lived one before reading Pages', async () => {
    const fetchMock = mockFetchSequence([
      { access_token: 'short-lived-token' },
      { access_token: 'long-lived-token' },
      { data: [{ id: '111', name: 'Test Page', access_token: 'page-token' }] },
    ])

    const creds = await metaProvider.exchangeCodeForPageCredentials('auth-code')

    expect(fetchMock).toHaveBeenCalledTimes(3)

    const exchangeUrl = String(fetchMock.mock.calls[1]?.[0])
    expect(exchangeUrl).toContain('grant_type=fb_exchange_token')
    expect(exchangeUrl).toContain('fb_exchange_token=short-lived-token')

    // The whole point: /me/accounts must be called with the LONG-lived token.
    // Called with the short-lived one, everything below still succeeds and the
    // stored Page token silently expires within the hour.
    const pagesUrl = String(fetchMock.mock.calls[2]?.[0])
    expect(pagesUrl).toContain('/me/accounts')
    expect(pagesUrl).toContain('access_token=long-lived-token')
    expect(pagesUrl).not.toContain('short-lived-token')

    expect(creds).toEqual({ pageId: '111', pageName: 'Test Page', pageAccessToken: 'page-token' })
  })

  it('fails the connect rather than falling back to the short-lived token', async () => {
    const fetchMock = mockFetchSequence([
      { access_token: 'short-lived-token' },
      { error: { message: 'Invalid OAuth access token' } },
    ])

    await expect(metaProvider.exchangeCodeForPageCredentials('auth-code')).rejects.toBeInstanceOf(
      MetaTokenExchangeError
    )

    // Stopped at the failed exchange -- it must not go on to mint a Page token
    // from a token it already knows is short-lived.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
