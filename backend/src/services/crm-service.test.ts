import { beforeEach, describe, expect, it, vi } from 'vitest'

const getClientById = vi.fn()
const updateClient = vi.fn()
const encrypt = vi.fn(async (s: string) => `enc:${s}`)
const decrypt = vi.fn(async (s: string) => s.replace(/^enc:/, ''))
const syncLead = vi.fn()
const refreshAccessToken = vi.fn()
const exchangeCodeForTokens = vi.fn()

vi.mock('../repositories/client-repository.js', () => ({
  getClientById,
  updateClient,
  removeClientCRMConnection: vi.fn(),
}))
vi.mock('../repositories/form-repository.js', () => ({ getFormById: vi.fn() }))
vi.mock('../repositories/form-lead-repository.js', () => ({ updateFormLeadSyncStatus: vi.fn() }))
vi.mock('../lib/kms.js', () => ({ encrypt, decrypt }))
vi.mock('../providers/zoho-provider.js', () => ({
  zohoProvider: { syncLead, refreshAccessToken, exchangeCodeForTokens, mapLead: vi.fn(), getProviderName: () => 'zoho' },
}))

const { connectZohoCRM, encryptLegacyZohoTokens, getCRMStatus, syncLeadToCRMWithRetry } = await import('./crm-service.js')

const LATER = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const PAST = new Date(Date.now() - 60 * 1000).toISOString()

const encryptedConnection = {
  provider: 'zoho' as const,
  connected: true,
  accessTokenEncrypted: 'enc:access-1',
  refreshTokenEncrypted: 'enc:refresh-1',
  tokenExpiry: LATER,
  connectedAt: '2026-09-01T00:00:00Z',
}

// The shape every connection had before 2026-10-03.
const legacyConnection = {
  provider: 'zoho' as const,
  connected: true,
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  tokenExpiry: LATER,
  connectedAt: '2026-09-01T00:00:00Z',
}

const lead = { lastName: 'Sharma', leadSource: 'VyostraAI', description: '', sourceUrl: 'https://example.com/' }

function client(crmConnection: object | undefined) {
  return { clientId: 'client-1', crmConnection } as Parameters<typeof syncLeadToCRMWithRetry>[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  // Tests override these per case; clearAllMocks keeps an override, so reset them.
  updateClient.mockReset()
  refreshAccessToken.mockReset()
  syncLead.mockResolvedValue({ success: true, externalId: 'zoho-1' })
})

describe('connecting Zoho CRM', () => {
  it('stores the tokens encrypted and never in the clear', async () => {
    exchangeCodeForTokens.mockResolvedValue({ provider: 'zoho', accessToken: 'a', refreshToken: 'r', tokenExpiry: LATER })
    await connectZohoCRM('client-1', 'code')

    const stored = updateClient.mock.calls[0]?.[1].crmConnection
    expect(stored).toMatchObject({ accessTokenEncrypted: 'enc:a', refreshTokenEncrypted: 'enc:r', connected: true })
    expect(stored).not.toHaveProperty('accessToken')
    expect(stored).not.toHaveProperty('refreshToken')
  })
})

describe('the connection status the dashboard receives', () => {
  it.each([
    ['an encrypted connection', encryptedConnection],
    ['a legacy plaintext connection', legacyConnection],
  ])('carries no token for %s', async (_label, connection) => {
    getClientById.mockResolvedValue(client(connection))
    const status = await getCRMStatus('client-1')
    expect(status).toEqual({ provider: 'zoho', connected: true, tokenExpiry: LATER, connectedAt: '2026-09-01T00:00:00Z' })
  })
})

describe('syncing a lead', () => {
  it('decrypts the stored tokens for Zoho', async () => {
    const outcome = await syncLeadToCRMWithRetry(client(encryptedConnection), lead)
    expect(outcome.success).toBe(true)
    expect(syncLead.mock.calls[0]?.[1]).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' })
  })

  it('still syncs a legacy plaintext connection that has not been migrated', async () => {
    const outcome = await syncLeadToCRMWithRetry(client(legacyConnection), lead)
    expect(outcome.success).toBe(true)
    expect(syncLead.mock.calls[0]?.[1]).toMatchObject({ accessToken: 'access-1' })
  })

  it('rewrites a legacy connection encrypted when it refreshes the token', async () => {
    refreshAccessToken.mockResolvedValue({ provider: 'zoho', accessToken: 'access-2', refreshToken: 'refresh-1', tokenExpiry: LATER })
    await syncLeadToCRMWithRetry(client({ ...legacyConnection, tokenExpiry: PAST }), lead)

    const stored = updateClient.mock.calls[0]?.[1].crmConnection
    expect(stored).toMatchObject({ accessTokenEncrypted: 'enc:access-2', refreshTokenEncrypted: 'enc:refresh-1' })
    expect(stored).not.toHaveProperty('accessToken')
    expect(stored).not.toHaveProperty('refreshToken')
  })

  // Thrown, these skipped the Meta path's status write, so a lapsed Zoho
  // connection showed no failure on any Meta lead.
  it('returns a failed sync, not an exception, when the token cannot be decrypted', async () => {
    decrypt.mockRejectedValueOnce(new Error('KMS unavailable'))
    const outcome = await syncLeadToCRMWithRetry(client(encryptedConnection), lead)
    expect(outcome).toEqual({ success: false, attempts: 0, error: 'KMS unavailable' })
    expect(syncLead).not.toHaveBeenCalled()
  })

  it('returns a failed sync when the token cannot be renewed', async () => {
    refreshAccessToken.mockRejectedValue(new Error('Zoho token refresh failed: invalid_code'))
    const outcome = await syncLeadToCRMWithRetry(client({ ...encryptedConnection, tokenExpiry: PAST }), lead)
    expect(outcome).toMatchObject({ success: false, attempts: 0, error: 'Zoho token refresh failed: invalid_code' })
  })

  it('still reports a synced lead when storing the refreshed token fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    refreshAccessToken.mockResolvedValue({ provider: 'zoho', accessToken: 'access-2', refreshToken: 'refresh-1', tokenExpiry: LATER })
    updateClient.mockRejectedValue(new Error('DynamoDB throttled'))
    const outcome = await syncLeadToCRMWithRetry(client({ ...encryptedConnection, tokenExpiry: PAST }), lead)
    expect(outcome).toMatchObject({ success: true, externalId: 'zoho-1' })
  })
})

describe('the plaintext-token backfill', () => {
  it('encrypts a legacy connection and drops the plaintext', async () => {
    expect(await encryptLegacyZohoTokens(client(legacyConnection), false)).toBe('encrypted')
    const stored = updateClient.mock.calls[0]?.[1].crmConnection
    expect(stored).toMatchObject({ accessTokenEncrypted: 'enc:access-1', refreshTokenEncrypted: 'enc:refresh-1' })
    expect(stored).not.toHaveProperty('accessToken')
  })

  it('writes nothing on a dry run', async () => {
    expect(await encryptLegacyZohoTokens(client(legacyConnection), true)).toBe('encrypted')
    expect(updateClient).not.toHaveBeenCalled()
  })

  it('skips a connection that is already encrypted, so a rerun is a no-op', async () => {
    expect(await encryptLegacyZohoTokens(client(encryptedConnection), false)).toBe('already-encrypted')
    expect(updateClient).not.toHaveBeenCalled()
  })

  it('leaves a client with no Zoho connection alone', async () => {
    expect(await encryptLegacyZohoTokens(client(undefined), false)).toBe('no-connection')
  })

  it('reports a connection with no tokens rather than writing one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { accessToken: _a, refreshToken: _r, ...tokenless } = legacyConnection
    expect(await encryptLegacyZohoTokens(client(tokenless), false)).toBe('no-tokens')
    expect(updateClient).not.toHaveBeenCalled()
  })
})
