import { beforeEach, describe, expect, it, vi } from 'vitest'

const listMessageTemplates = vi.fn()
const createMessageTemplate = vi.fn()
vi.mock('../providers/meta-whatsapp-provider.js', () => ({
  metaWhatsAppProvider: { listMessageTemplates, createMessageTemplate },
}))
const decrypt = vi.fn()
vi.mock('../lib/kms.js', () => ({ decrypt }))
const getClientById = vi.fn()
vi.mock('../repositories/client-repository.js', () => ({ getClientById }))

const {
  createWhatsAppTemplate,
  listWhatsAppTemplates,
  UnknownWhatsAppTemplateError,
  WhatsAppNotConnectedError,
  WhatsAppTemplateCreateError,
} = await import('./whatsapp-template-service.js')
const { WHATSAPP_TEMPLATES } = await import('../lib/whatsapp-templates.js')

const CONNECTED_CLIENT = {
  clientId: 'client-1',
  metaDirectWhatsAppConnection: { connected: true, wabaId: 'waba-1', accessTokenEncrypted: 'cipher' },
}

beforeEach(() => {
  vi.clearAllMocks()
  getClientById.mockResolvedValue(CONNECTED_CLIENT)
  decrypt.mockResolvedValue('tok')
  listMessageTemplates.mockResolvedValue([])
})

describe('listWhatsAppTemplates', () => {
  it('reads the templates of the WABA this client connected, with their own token', async () => {
    await listWhatsAppTemplates('client-1')

    expect(getClientById).toHaveBeenCalledWith('client-1')
    expect(listMessageTemplates).toHaveBeenCalledWith('waba-1', 'tok')
  })

  // A freshly connected client has zero templates. The section still has to
  // show the whole library, or there is nothing to create from.
  it('lists every library template as not created on an empty WABA', async () => {
    const templates = await listWhatsAppTemplates('client-1')

    expect(templates).toHaveLength(WHATSAPP_TEMPLATES.length)
    expect(templates.every((template) => template.status === 'NOT_CREATED')).toBe(true)
  })

  it("reports Meta's status and Meta's category, not the requested one", async () => {
    listMessageTemplates.mockResolvedValue([
      { name: 'lead_notification_1', language: 'en', status: 'PENDING', category: 'MARKETING' },
    ])

    const templates = await listWhatsAppTemplates('client-1')
    const row = templates.find((template) => template.name === 'lead_notification_1')

    expect(row).toMatchObject({ status: 'PENDING', category: 'MARKETING', language: 'en' })
  })

  // name + language is the identity. connection_test_1 is defined as en_US, so
  // an `en` template of the same name is a different template.
  it('does not count a same-named template in another language as present', async () => {
    listMessageTemplates.mockResolvedValue([
      { name: 'connection_test_1', language: 'en', status: 'APPROVED', category: 'UTILITY' },
    ])

    const templates = await listWhatsAppTemplates('client-1')

    expect(templates.find((template) => template.name === 'connection_test_1')?.status).toBe('NOT_CREATED')
  })

  it('refuses a client with no Meta connection before calling Meta', async () => {
    getClientById.mockResolvedValue({ clientId: 'client-1' })

    await expect(listWhatsAppTemplates('client-1')).rejects.toBeInstanceOf(WhatsAppNotConnectedError)
    expect(listMessageTemplates).not.toHaveBeenCalled()
  })
})

describe('createWhatsAppTemplate', () => {
  it('creates the library definition on the client WABA and returns what Meta assigned', async () => {
    createMessageTemplate.mockResolvedValue({ success: true, id: 't-1', status: 'PENDING', category: 'UTILITY' })

    const created = await createWhatsAppTemplate('client-1', 'lead_notification_1')

    expect(createMessageTemplate).toHaveBeenCalledWith(
      'waba-1',
      'tok',
      expect.objectContaining({ name: 'lead_notification_1' })
    )
    expect(created).toMatchObject({ name: 'lead_notification_1', status: 'PENDING', category: 'UTILITY' })
  })

  // The name arrives in a request body. Anything outside the library must stop
  // here, before a token is decrypted or Meta is called.
  it('refuses a name that is not in the library', async () => {
    await expect(createWhatsAppTemplate('client-1', 'free_iphone')).rejects.toBeInstanceOf(
      UnknownWhatsAppTemplateError
    )
    expect(decrypt).not.toHaveBeenCalled()
    expect(createMessageTemplate).not.toHaveBeenCalled()
  })

  it("surfaces Meta's own reason when the create is refused", async () => {
    createMessageTemplate.mockResolvedValue({ success: false, error: 'Template name already exists' })

    const attempt = createWhatsAppTemplate('client-1', 'lead_notification_1')

    await expect(attempt).rejects.toBeInstanceOf(WhatsAppTemplateCreateError)
    await expect(attempt).rejects.toThrow(/already exists/)
  })
})
