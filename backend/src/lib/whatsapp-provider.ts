export interface GupshupCredentials {
  provider: 'gupshup'
  apiKey: string
  appName: string
  sourceNumber: string
}

export interface MetaDirectCredentials {
  provider: 'meta_direct'
  phoneNumberId: string
  accessToken: string
}

export type WhatsAppCredentials = GupshupCredentials | MetaDirectCredentials

export interface WhatsAppSendResult {
  success: boolean
  messageId?: string
  error?: string
  retryable?: boolean
}

// A resolved, ready-to-send template: the approved template's name plus the
// values for its {{n}} placeholders, in order.
//
// languageCode must match the language the template was APPROVED under, not
// the lead's locale -- Meta compares the two exactly and fails with error
// 132001 on a mismatch. Callers should pass WHATSAPP_TEMPLATE_LANGUAGE from
// whatsapp-templates.ts rather than a literal, so create-side and send-side
// cannot drift apart.
export interface WhatsAppTemplateSend {
  templateName: string
  languageCode: string
  // One value per {{n}}, in order. Empty for a template with no placeholders
  // (hello_world). Count must match what was approved -- Meta rejects a
  // parameter count mismatch with error 132000.
  bodyParams: string[]
  // Fills the trailing {{1}} of a DYNAMIC URL button, and is the suffix alone,
  // not a whole URL -- the base lives in the approved template. Absent for
  // every template whose buttons are static or quick replies.
  //
  // Not part of bodyParams because it is a different component to Meta: a body
  // parameter count mismatch fails with 132000, so folding one into the other
  // breaks both templates that use it.
  urlButtonParam?: string
}

export interface WhatsAppProvider {
  getProviderName(): string
  // Free-form text. ONLY deliverable inside an open 24h session window --
  // outside it Meta rejects with error 131047 regardless of content. Callers
  // that cannot guarantee an open window must use sendTemplate instead.
  sendMessage(to: string, message: string, credentials: WhatsAppCredentials): Promise<WhatsAppSendResult>
  // The business-initiated path: deliverable with no open session window,
  // provided the template is approved on the sending WABA.
  sendTemplate(
    to: string,
    template: WhatsAppTemplateSend,
    credentials: WhatsAppCredentials
  ): Promise<WhatsAppSendResult>
}
