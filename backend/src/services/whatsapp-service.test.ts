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
vi.mock('../providers/meta-whatsapp-provider.js', () => ({
  metaWhatsAppProvider: { subscribeWabaToApp },
}))
const encrypt = vi.fn()
vi.mock('../lib/kms.js', () => ({ decrypt: vi.fn(), encrypt }))
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
    subscribeWabaToApp.mockReset()
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
})
