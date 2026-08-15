import { beforeEach, describe, expect, it, vi } from 'vitest'

// whatsapp-service.ts's import graph is wide (KMS, both WhatsApp providers,
// client-repository, the new Gupshup app-lookup repository, chat/form lead
// services). This test only exercises hasActiveWhatsAppSession, which
// touches none of that -- mocked at each boundary this test doesn't need,
// same pattern as webhook-service.test.ts.
const getLastInboundMessageAt = vi.fn()
vi.mock('../repositories/whatsapp-inbound-activity-repository.js', () => ({ getLastInboundMessageAt }))
vi.mock('../providers/gupshup-provider.js', () => ({ gupshupProvider: {} }))
vi.mock('../providers/meta-whatsapp-provider.js', () => ({ metaWhatsAppProvider: {} }))
vi.mock('../lib/kms.js', () => ({ decrypt: vi.fn(), encrypt: vi.fn() }))
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

const { hasActiveWhatsAppSession } = await import('./whatsapp-service.js')

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
