export interface MessageChannel {
  receiveMessage(payload: unknown): ChannelMessage
  sendResponse(response: string, context: ChannelContext): Promise<void>
}

export interface ChannelMessage {
  botId: string
  conversationId: string
  text: string
  metadata?: Record<string, unknown>
}

export interface ChannelContext {
  botId: string
  conversationId: string
  channel: 'web_widget'
}

export interface BotConfig {
  botId: string
  clientId: string
  name: string
  websiteUrl: string
  greetingMessage: string
  brandColor: string
  leadTriggerAfterMessages: number
  leadFormFields: LeadFormField[]
  widgetTrigger: 'immediate' | 'delay_5s' | 'scroll_50' | 'exit_intent'
  createdAt: string
  updatedAt: string
}

export interface LeadFormField {
  fieldId: string
  label: string
  type: 'text' | 'email' | 'phone' | 'select'
  required: boolean
  options?: string[]
}

export interface Lead {
  leadId: string
  botId: string
  clientId: string
  name: string
  phone: string
  email: string
  propertyInterest?: string
  budgetRange?: string
  chatTranscript: string
  sourceUrl: string
  createdAt: string
}

export interface KnowledgeBaseEntry {
  entryId: string
  botId: string
  clientId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface Chunk {
  chunkId: string
  botId: string
  text: string
  sourceUrl: string
  createdAt: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface CRMConnection {
  provider: 'zoho'
  connected: boolean
  accessToken: string
  refreshToken: string
  tokenExpiry: string
  connectedAt: string
}

export interface ClientRecord {
  clientId: string
  email: string
  name: string
  authProvider: 'google'
  plan: 'starter' | 'growth' | 'agency'
  crmConnection?: CRMConnection
  createdAt: string
  updatedAt: string
}

export interface ConversationRecord {
  botId: string
  conversationId: string
  messages: ConversationMessage[]
  leadCaptured: boolean
  sourceUrl: string
  createdAt: string
  updatedAt: string
}

export interface SimilarityResult {
  chunkId: string
  text: string
  sourceUrl: string
  score: number
}

export interface FormField {
  fieldId: string
  label: string
  type: 'text' | 'number' | 'email' | 'phone' | 'options'
  required: boolean
  placeholder?: string
  options?: string[]
}

export interface FormConfig {
  formId: string
  clientId: string
  name: string
  description?: string
  submitButtonText: string
  fields: FormField[]
  createdAt: string
  updatedAt: string
}

export interface CreateFormInput {
  clientId: string
  name: string
  description?: string
  submitButtonText: string
  fields: Omit<FormField, 'fieldId'>[]
}

export interface FormLead {
  leadId: string
  formId: string
  clientId: string
  source: 'form'
  customFields: string
  sourceUrl: string
  createdAt: string
  updatedAt?: string
  crmSynced?: boolean
  crmSyncedAt?: string
  crmExternalId?: string
  crmSyncError?: string
  crmSyncAttempts?: number
}

export interface CreateFormLeadInput {
  formId: string
  clientId: string
  customFields: Record<string, string>
  sourceUrl: string
}
