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

export type BotStatus = 'active' | 'processing' | 'crawl_failed' | 'kb_only'

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
  supportEmail?: string
  status?: BotStatus
  crawlError?: string
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
  name?: string
  phone?: string
  email?: string
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

export interface ClientRecord {
  clientId: string
  email: string
  name: string
  authProvider: 'google'
  plan: 'starter' | 'growth' | 'agency'
  createdAt: string
  updatedAt: string
}

export interface CreateBotInput {
  name: string
  websiteUrl?: string
  greetingMessage: string
  brandColor: string
  widgetTrigger: BotConfig['widgetTrigger']
  leadTriggerAfterMessages: number
  leadFormFields: LeadFormField[]
}

export interface SetupBotResult {
  bot: BotConfig
  pagesIndexed: number
  chunksIndexed: number
}

export interface ResyncResult {
  pagesIndexed: number
  chunksIndexed: number
}

export type IndexingStatus =
  | 'none'
  | 'pending'
  | 'queued'
  | 'processing'
  | 'complete'
  | 'failed'
  | 'confirmation_required'

export interface IndexingJob {
  jobId: string
  status: IndexingStatus
  websiteUrl: string
  totalPages: number
  selectedPages: number
  crawledPages: number
  totalChunks: number
  queuedAt: string
  startedAt?: string
  completedAt?: string
  error?: string

  // Finer-grained phase while status === 'processing'. status stays source of truth
  // for queued/complete/failed/pending/confirmation_required.
  // Mapping: queued→status 'queued', ready→'complete', failed→'failed';
  // crawling & indexing both live under status 'processing'.
  phase?: 'queued' | 'crawling' | 'indexing' | 'ready' | 'failed'

  // Incremental embedding-phase counter (denominator is existing totalChunks).
  // Distinct from totalChunks, which is written once at completion.
  chunksDone?: number

  // Last progress write; powers stall detection. Distinct from the outer
  // BotConfig/VoiceAgent record's own updatedAt.
  updatedAt?: string

  // Structured error for the new progress component. Leave existing `error?: string`
  // EXACTLY as-is (two live UI read sites depend on it); the worker writes both.
  errorDetail?: { message: string; retryable: boolean }

  // Populated on completion.
  summary?: { pages: number; passages: number }
}

export interface StartIndexingResult {
  status: 'confirmation_required' | 'queued'
  jobId: string
  totalPages: number
  message: string
  selectedPages?: number
}

export interface CreateKBEntryInput {
  botId: string
  title: string
  content: string
}

export interface UpdateKBInput {
  title: string
  content: string
}

export interface FormField {
  fieldId?: string
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
  name: string
  description?: string
  submitButtonText: string
  fields: FormField[]
}

export interface FormLead {
  leadId: string
  formId: string
  clientId: string
  source: 'form'
  customFields: string | Record<string, string>
  sourceUrl: string
  createdAt: string
  crmSynced?: boolean
  crmSyncedAt?: string
  crmExternalId?: string
  crmSyncError?: string
  crmSyncAttempts?: number
}

export interface CRMConnection {
  provider: 'zoho'
  connected: boolean
  connectedAt: string
  tokenExpiry: string
}

export interface WhatsAppConnection {
  provider: 'gupshup'
  connected: boolean
  appName: string
  sourceNumber: string
  notificationNumber: string
  connectedAt: string
}

export interface ConnectWhatsAppInput {
  apiKey: string
  appName: string
  sourceNumber: string
  notificationNumber: string
}

export interface Preferences {
  emailNotifications: boolean
  desktopAlerts: boolean
  weeklySummary: boolean
  leadAssignmentAlerts: boolean
}

export type VoiceAgentVoice = 'alloy' | 'echo' | 'shimmer' | 'nova' | 'onyx' | 'fable'

export interface VoiceAgent {
  agentId: string
  clientId: string
  name: string
  voice: VoiceAgentVoice
  greetingMessage: string
  systemPrompt?: string
  botId?: string
  websiteUrl?: string
  brandColor: string
  widgetPosition: 'bottom-left' | 'bottom-right' | 'bottom-center'
  maxSessionDuration: 5 | 10 | 15
  isEnabled: boolean
  isIndexed: boolean
  indexingJob?: IndexingJob
  createdAt: string
  updatedAt: string
}

export interface CreateVoiceAgentInput {
  name: string
  voice: VoiceAgentVoice
  greetingMessage: string
  websiteUrl?: string
  brandColor: string
  widgetPosition: 'bottom-left' | 'bottom-right' | 'bottom-center'
  maxSessionDuration: 5 | 10 | 15
}

export interface UpdateVoiceAgentInput {
  name?: string
  voice?: VoiceAgentVoice
  greetingMessage?: string
  systemPrompt?: string
  botId?: string
  brandColor?: string
  widgetPosition?: 'bottom-left' | 'bottom-right' | 'bottom-center'
  maxSessionDuration?: 5 | 10 | 15
  isEnabled?: boolean
}

export interface VoiceCallLog {
  agentId: string
  callId: string
  clientId: string
  startedAt: string
  endedAt: string
  durationSeconds: number
  inputTokens: number
  outputTokens: number
  audioTokens: number
  totalTokens: number
  status: 'completed' | 'dropped' | 'error'
}

export interface VoiceUsageSummary {
  totalCalls: number
  totalMinutes: number
  totalTokens: number
  recentCalls: VoiceCallLog[]
}

export interface VoiceKnowledgeBaseEntry {
  entryId: string
  agentId: string
  clientId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface VoiceAgentPublicConfig {
  agentId: string
  name: string
  voice: VoiceAgentVoice
  greetingMessage: string
  brandColor: string
  widgetPosition: 'bottom-left' | 'bottom-right' | 'bottom-center'
  isEnabled: boolean
}

export type PlanTier = 'free' | 'starter' | 'growth' | 'agency'

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'trial_expired' | 'cancelled'

export interface EntitlementFeatures {
  chat: { enabled: boolean; mode: 'full' | 'degraded' | null; limits: { conversations: number | null } }
  crm: { enabled: boolean; limits: { leads: number | null } }
  agents: { enabled: boolean; limits: { max: number | null } }
  voice: { enabled: boolean; limits: { minutes: number | null } }
}

export interface SubscriptionSummary {
  plan: PlanTier
  status: SubscriptionStatus
  trialEndsAt: string | null
  features: EntitlementFeatures
  usage: { chatConversations: number }
}
