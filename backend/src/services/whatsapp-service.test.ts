import { beforeEach, describe, expect, it, vi } from 'vitest'

// whatsapp-service.ts's import graph is wide (KMS, both WhatsApp providers,
// client-repository, the new Gupshup app-lookup repository, chat/form lead
// services). This test only exercises hasActiveWhatsAppSession, which
// touches none of that -- mocked at each boundary this test doesn't need,
// same pattern as webhook-service.test.ts.
const getLastInboundMessageAt = vi.fn()
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({ getLastInboundMessageAt }))
vi.mock('../providers/gupshup-provider.js', () => ({ gupshupProvider: {} }))
const subscribeWabaToApp = vi.fn()
const registerPhoneNumber = vi.fn()
vi.mock('../providers/meta-whatsapp-provider.js', () => ({
  metaWhatsAppProvider: { subscribeWabaToApp, registerPhoneNumber },
}))
const encrypt = vi.fn()
const decrypt = vi.fn()
vi.mock('../lib/kms.js', () => ({ decrypt, encrypt }))
vi.mock('../repositories/client-repository.js', () => ({
  clearActiveWhatsappProvider: vi.fn(),
  getClientById: vi.fn(),
  getConnectedWhatsAppClients: vi.fn(),
  removeClientMetaDirectWhatsAppConnection: vi.fn(),
  removeClientWhatsAppConnection: vi.fn(),
  updateClient: vi.fn(),
}))
vi.mock('../repositories/gupshup-app-lookup-repository.js', () => ({
  removeGupshupAppClientMapping: vi.fn(),
  setGupshupAppClientMapping: vi.fn(),
}))
vi.mock('./lead-service.js', () => ({ getLeadsForClient: vi.fn() }))
vi.mock('./form-lead-service.js', () => ({ getLeadsForClient: vi.fn() }))

const { hasActiveWhatsAppSession, storeMetaWhatsAppConnection } = await import('./whatsapp-service.js')
const { getClientById, updateClient } = await import('../repositories/client-repository.js')

beforeEach(() => {
  getLastInboundMessageAt.mockReset()
})

describe('hasActiveWhatsAppSession', () => {
  it('is false when the lead has no recorded inbound message at all', async () => {
    getLastInboundMessageAt.mockResolvedValueOnce(null)
    expect(await hasActiveWhatsAppSession('lead-1')).toBe(false)
  })

  it('is true within the 24h window', async () => {
    getLastInboundMessageAt.mockResolvedValueOnce(new Date(Date.now() - 60 * 60 * 1000).toISOString())
    expect(await hasActiveWhatsAppSession('lead-1')).toBe(true)
  })

  it('is false once the 24h window has passed', async () => {
    getLastInboundMessageAt.mockResolvedValueOnce(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString())
    expect(await hasActiveWhatsAppSession('lead-1')).toBe(false)
  })
})

describe('sendWhatsAppTestMessage', () => {
  it('sends the smoke-test template under the language its definition declares', async () => {
    const { WHATSAPP_SMOKE_TEST_TEMPLATE, templateLanguageOf, findTemplate } = await import(
      '../lib/whatsapp-templates.js'
    )

    // The definition must exist, or the dashboard test button sends a template
    // name that was never created on any WABA.
    expect(findTemplate(WHATSAPP_SMOKE_TEST_TEMPLATE)).toBeDefined()
    // en_US, not the en default -- a mismatch here fails at Meta with 132001.
    expect(templateLanguageOf(WHATSAPP_SMOKE_TEST_TEMPLATE)).toBe('en_US')
    // And it must take no parameters, since the test button supplies none.
    expect(findTemplate(WHATSAPP_SMOKE_TEST_TEMPLATE)?.bodyExample).toEqual([])
  })
})

describe('storeMetaWhatsAppConnection webhook subscription', () => {
  const input = {
    wabaId: 'waba-1',
    phoneNumberId: 'phone-1',
    notificationNumber: '919999999999',
    accessToken: 'tok',
    displayPhoneNumber: '+91 70070 28001',
  }

  beforeEach(() => {
    subscribeWabaToApp.mockReset().mockResolvedValue(undefined)
    registerPhoneNumber.mockReset().mockResolvedValue(undefined)
    decrypt.mockReset()
    encrypt.mockReset().mockResolvedValue('cipher')
    vi.mocked(getClientById).mockReset().mockResolvedValue(null)
    vi.mocked(updateClient).mockReset().mockResolvedValue(undefined as never)
  })

  it('subscribes the WABA and records it on the connection', async () => {
    subscribeWabaToApp.mockResolvedValue(undefined)

    await storeMetaWhatsAppConnection('client-1', input)

    expect(subscribeWabaToApp).toHaveBeenCalledWith('waba-1', 'tok')
    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { webhookSubscribed: true },
    })
  })

  // The whole point of the flag. Before it existed a failed subscribe left a
  // connection that could send and never receive, with nothing recording that
  // -- which is exactly how inbound stayed dead unnoticed.
  it('still stores the connection when subscribing fails, flagged as unsubscribed', async () => {
    subscribeWabaToApp.mockRejectedValue(new Error('(#200) Permissions error'))

    await expect(storeMetaWhatsAppConnection('client-1', input)).resolves.toBeUndefined()

    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { connected: true, webhookSubscribed: false },
    })
  })

  it('registers the phone number with a 6-digit pin and records it', async () => {
    await storeMetaWhatsAppConnection('client-1', input)

    expect(registerPhoneNumber).toHaveBeenCalledWith('phone-1', expect.stringMatching(/^\d{6}$/), 'tok')
    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { registered: true, twoStepPinEncrypted: 'cipher' },
    })
  })

  // Same contract as the subscribe failure above: a number that cannot send is
  // degraded, not worthless, so the connection is still stored -- but the flag
  // has to say so, or the first failed send is the only signal anyone gets.
  it('still stores the connection when registration fails, flagged as unregistered', async () => {
    registerPhoneNumber.mockRejectedValue(new Error('Phone number needs to be verified'))

    await expect(storeMetaWhatsAppConnection('client-1', input)).resolves.toBeUndefined()

    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { connected: true, registered: false },
    })
  })

  // The PIN must survive a failed registration: Meta binds it on the first
  // register that succeeds, so a retry has to present the same value.
  it('stores the pin even when registration fails', async () => {
    registerPhoneNumber.mockRejectedValue(new Error('nope'))

    await storeMetaWhatsAppConnection('client-1', input)

    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { twoStepPinEncrypted: 'cipher' },
    })
  })

  it('prefers the Embedded Signup business id over the wabaId fallback', async () => {
    await storeMetaWhatsAppConnection('client-1', { ...input, businessId: 'biz-9' })

    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { businessAccountId: 'biz-9' },
    })
  })

  it('falls back to wabaId when no business id was reported', async () => {
    await storeMetaWhatsAppConnection('client-1', input)

    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { businessAccountId: 'waba-1' },
    })
  })

  // REGRESSION: a reconnect used to mint a FRESH pin and write it over the
  // stored one. Meta binds the pin on the first successful registration and
  // rejects any later register presenting a different one, so that both failed
  // against Meta and destroyed the only value that could ever register the
  // number -- leaving it permanently unregisterable.
  it('reuses the stored pin on reconnect instead of minting a new one', async () => {
    decrypt.mockResolvedValue('424242')
    vi.mocked(getClientById).mockResolvedValue({
      clientId: 'client-1',
      metaDirectWhatsAppConnection: { phoneNumberId: 'phone-1', twoStepPinEncrypted: 'existing-cipher' },
    } as never)

    await storeMetaWhatsAppConnection('client-1', input)

    expect(decrypt).toHaveBeenCalledWith('existing-cipher')
    expect(registerPhoneNumber).toHaveBeenCalledWith('phone-1', '424242', 'tok')
    // The stored ciphertext is carried over verbatim, never re-encrypted into
    // a different value.
    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { twoStepPinEncrypted: 'existing-cipher' },
    })
  })

  it('mints a pin only when the client has none stored', async () => {
    await storeMetaWhatsAppConnection('client-1', input)

    expect(decrypt).not.toHaveBeenCalled()
    expect(registerPhoneNumber).toHaveBeenCalledWith('phone-1', expect.stringMatching(/^\d{6}$/), 'tok')
  })

  // The dangerous case: a number that may already be live under a PIN nobody
  // holds. Registering it with a fresh PIN cannot succeed, and repeated
  // failures count against Meta's two-step attempt limit and can lock the
  // number out. Doing nothing is strictly safer.
  it('skips registration entirely when reconnecting a number with no stored pin', async () => {
    vi.mocked(getClientById).mockResolvedValue({
      clientId: 'client-1',
      metaDirectWhatsAppConnection: { phoneNumberId: 'phone-1', registered: true },
    } as never)

    await storeMetaWhatsAppConnection('client-1', input)

    expect(registerPhoneNumber).not.toHaveBeenCalled()
    // The prior registration state is preserved, not downgraded to false.
    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { registered: true },
    })
  })

  // The PIN belongs to a NUMBER, not a client. Replaying the old number's PIN
  // at a new one would fail against Meta for no reason.
  it('mints a fresh pin when the client switches to a different number', async () => {
    vi.mocked(getClientById).mockResolvedValue({
      clientId: 'client-1',
      metaDirectWhatsAppConnection: { phoneNumberId: 'phone-OLD', twoStepPinEncrypted: 'old-cipher' },
    } as never)

    await storeMetaWhatsAppConnection('client-1', input)

    expect(decrypt).not.toHaveBeenCalled()
    expect(registerPhoneNumber).toHaveBeenCalledWith('phone-1', expect.stringMatching(/^\d{6}$/), 'tok')
  })

  it('records the token expiry when the exchange reported one', async () => {
    await storeMetaWhatsAppConnection('client-1', { ...input, tokenExpiresAt: '2026-10-29T00:00:00.000Z' })

    expect(vi.mocked(updateClient).mock.calls[0]?.[1]).toMatchObject({
      metaDirectWhatsAppConnection: { tokenExpiresAt: '2026-10-29T00:00:00.000Z' },
    })
  })

  // Absent rather than undefined: DynamoDB rejects an explicit undefined, and
  // the redirect path genuinely has no expiry to report.
  it('omits tokenExpiresAt entirely when none was reported', async () => {
    await storeMetaWhatsAppConnection('client-1', input)

    const stored = vi.mocked(updateClient).mock.calls[0]?.[1] as {
      metaDirectWhatsAppConnection?: Record<string, unknown>
    }
    expect(stored.metaDirectWhatsAppConnection).not.toHaveProperty('tokenExpiresAt')
  })
})
