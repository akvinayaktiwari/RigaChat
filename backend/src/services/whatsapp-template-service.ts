import { decrypt } from '../lib/kms.js'
import {
  WHATSAPP_TEMPLATE_LANGUAGE,
  WHATSAPP_TEMPLATES,
  findTemplate,
  type WhatsAppTemplateDefinition,
} from '../lib/whatsapp-templates.js'
import { metaWhatsAppProvider, type ExistingTemplate } from '../providers/meta-whatsapp-provider.js'
import { getClientById } from '../repositories/client-repository.js'
import { WHATSAPP_TEMPLATE_NOT_CREATED, type WhatsAppTemplateOverview } from '../types/index.js'

// The client has no Meta Direct connection, so there is no WABA to read or
// write templates on. Its own class because the route answers it with 409, not
// 500: nothing is broken, the client simply has not connected yet.
export class WhatsAppNotConnectedError extends Error {
  constructor() {
    super('Connect WhatsApp through Meta before managing templates.')
    this.name = 'WhatsAppNotConnectedError'
  }
}

// Only templates from the library can be created. The name comes from the
// request body, so this is the guard that keeps the route from becoming a way
// to submit arbitrary template text on a client's WABA.
export class UnknownWhatsAppTemplateError extends Error {
  constructor(name: string) {
    super(`"${name}" is not a Vyostra AI template.`)
    this.name = 'UnknownWhatsAppTemplateError'
  }
}

// Meta refused the create. Carries Meta's own reason, which is the only useful
// thing to show: a duplicate name, a rejected body and a missing permission all
// need different fixes.
export class WhatsAppTemplateCreateError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'WhatsAppTemplateCreateError'
  }
}

interface TemplateAccess {
  wabaId: string
  accessToken: string
}

async function resolveTemplateAccess(clientId: string): Promise<TemplateAccess> {
  const client = await getClientById(clientId)
  const connection = client?.metaDirectWhatsAppConnection
  if (!connection?.connected) throw new WhatsAppNotConnectedError()

  return { wabaId: connection.wabaId, accessToken: await decrypt(connection.accessTokenEncrypted) }
}

function languageOf(definition: WhatsAppTemplateDefinition): string {
  return definition.language ?? WHATSAPP_TEMPLATE_LANGUAGE
}

// A template's identity on a WABA is name + language, not name alone, so both
// have to match before a library template counts as present.
function toOverview(definition: WhatsAppTemplateDefinition, existing: ExistingTemplate[]): WhatsAppTemplateOverview {
  const language = languageOf(definition)
  const onWaba = existing.find((template) => template.name === definition.name && template.language === language)

  return {
    name: definition.name,
    language,
    category: onWaba?.category ?? definition.category,
    body: definition.body,
    status: onWaba?.status ?? WHATSAPP_TEMPLATE_NOT_CREATED,
  }
}

// Read from Meta on every call rather than cached: a template's review status
// changes on Meta's clock, and a stored copy would show PENDING long after the
// template was approved.
export async function listWhatsAppTemplates(clientId: string): Promise<WhatsAppTemplateOverview[]> {
  const { wabaId, accessToken } = await resolveTemplateAccess(clientId)
  const existing = await metaWhatsAppProvider.listMessageTemplates(wabaId, accessToken)

  return WHATSAPP_TEMPLATES.map((definition) => toOverview(definition, existing))
}

export async function createWhatsAppTemplate(clientId: string, name: string): Promise<WhatsAppTemplateOverview> {
  const definition = findTemplate(name)
  if (!definition) throw new UnknownWhatsAppTemplateError(name)

  const { wabaId, accessToken } = await resolveTemplateAccess(clientId)
  const result = await metaWhatsAppProvider.createMessageTemplate(wabaId, accessToken, definition)
  if (!result.success) throw new WhatsAppTemplateCreateError(result.error)

  return {
    name: definition.name,
    language: languageOf(definition),
    category: result.category,
    body: definition.body,
    status: result.status,
  }
}
