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
  websiteUrl?: string
  greetingMessage: string
  brandColor: string
  leadTriggerAfterMessages: number
  leadFormFields: LeadFormField[]
  widgetTrigger: 'immediate' | 'delay_5s' | 'scroll_50' | 'exit_intent'
  supportEmail?: string
  suggestedQuestions?: SuggestedQuestion[]
  indexingJob?: IndexingJob
  status?: BotStatus
  crawlError?: string
  createdAt: string
  updatedAt: string
}

export interface IndexingJob {
  jobId: string
  status: 'pending' | 'queued' | 'processing' | 'complete' | 'failed' | 'confirmation_required'
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

export interface SuggestedQuestion {
  id: string
  question: string
  answer: string
  emoji: string
  category: 'pricing' | 'features' | 'support' | 'general' | 'contact'
  order: number
}

export interface PrewarmResult {
  generated: number
  prewarmSuccess: number
  prewarmFailed: number
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
  // Required even for file-upload rows, which write '' here until a future
  // module extracts real text -- see indexingStatus below for the source of
  // truth on whether content is actually populated yet.
  content: string
  createdAt: string
  updatedAt: string

  // File-upload path only (see kb-service.ts's confirmKBUpload()) -- absent
  // on rows created via the text-entry addKBEntry() path.
  sourceFileKey?: string
  fileType?: 'pdf' | 'docx' | 'text'
  fileSizeBytes?: number
  // Flat fields rather than a nested object (unlike bots/voice agents'
  // indexingJob) -- indexingJobId exists alongside indexingStatus so the
  // same atomic-claim-guard pattern (match on jobId AND status) still works
  // without introducing a nested shape here.
  indexingStatus?: 'queued' | 'processing' | 'complete' | 'failed'
  indexingJobId?: string
  indexingError?: string
}

export interface VoiceKnowledgeBaseEntry {
  entryId: string
  agentId: string
  clientId: string
  title: string
  // Required even for file-upload rows, which write '' here until a future
  // module extracts real text -- see indexingStatus below for the source of
  // truth on whether content is actually populated yet. Mirrors
  // KnowledgeBaseEntry. Fields below are unused by any code path on main
  // today (file upload for voice agents isn't wired up here yet) -- added
  // now, additively, so fix/kb-delete-cleanup's guard/S3-cleanup logic
  // type-checks and is ready the moment that upload path lands.
  content: string
  createdAt: string
  updatedAt: string

  sourceFileKey?: string
  fileType?: 'pdf' | 'docx' | 'text'
  fileSizeBytes?: number
  indexingStatus?: 'queued' | 'processing' | 'complete' | 'failed'
  indexingJobId?: string
  indexingError?: string
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

export interface WhatsAppConnection {
  provider: 'gupshup'
  connected: boolean
  apiKeyEncrypted: string
  appName: string
  sourceNumber: string
  notificationNumber: string
  connectedAt: string
}

export interface ClientRecord {
  clientId: string
  email: string
  name: string
  authProvider: 'google' | 'email'
  plan: 'starter' | 'growth' | 'agency'
  crmConnection?: CRMConnection
  whatsappConnection?: WhatsAppConnection
  createdAt: string
  updatedAt: string
}

export interface CacheQueryResult {
  hit: boolean
  data?: {
    answer: string
    similarity: number
  }
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

export type VoiceAgentVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar'

export type VoiceAgentStatus = 'processing' | 'kb_only'

export interface VoiceAgent {
  agentId: string
  clientId: string
  name: string
  voice: VoiceAgentVoice
  greetingMessage: string
  systemPrompt?: string
  // Optional link to an existing chatbot — when set, voice RAG search
  // also queries that bot's Pinecone namespace in addition to this
  // agent's own namespace.
  botId?: string
  websiteUrl?: string
  brandColor: string
  widgetPosition: 'bottom-left' | 'bottom-right' | 'bottom-center'
  maxSessionDuration: 5 | 10 | 15
  isEnabled: boolean
  // True once this agent's own websiteUrl has been crawled, chunked, and
  // embedded into its Pinecone namespace (see feat/voice-agent-rag) — or
  // immediately for a kb_only agent, which has no crawl to wait on.
  isIndexed: boolean
  indexingJob?: IndexingJob
  status?: VoiceAgentStatus
  createdAt: string
  updatedAt: string
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

export interface VoiceSession {
  sessionId: string
  agentId: string
  clientId: string
  connectionId: string
  status: 'connecting' | 'active' | 'ended'
  startedAt: string
  endedAt?: string
}

export interface VoiceConfig {
  agentId: string
  clientId: string
  voice: VoiceAgentVoice
  greetingMessage: string
  maxSessionDuration: number
  ragContext: string
}

export interface CreateVoiceAgentInput {
  clientId: string
  name: string
  voice: VoiceAgentVoice
  greetingMessage: string
  websiteUrl?: string
  brandColor: string
  widgetPosition: 'bottom-left' | 'bottom-right' | 'bottom-center'
  maxSessionDuration: 5 | 10 | 15
  status?: VoiceAgentStatus
}

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'trial_expired'
  | 'cancelled'
  | 'pending_activation'

export type PlanTier = 'free' | 'starter' | 'growth' | 'agency'

export interface SubscriptionAddons {
  voice?: { subscribed: boolean; subscribedAt: string }
}

export interface SubscriptionOverrides {
  chat?: { conversations?: number | null }
  leads?: { max?: number | null }
  agents?: { max?: number | null }
  voice?: { minutes?: number | null }
}

export interface Subscription {
  accountId: string
  status: SubscriptionStatus
  plan: PlanTier
  addons: SubscriptionAddons
  overrides: SubscriptionOverrides
  isInternal: boolean
  trialStartedAt: string | null
  trialEndsAt: string | null
  currentPeriodStart: string
  currentPeriodEnd: string | null
  paymentProvider: 'razorpay' | null
  providerSubscriptionId: string | null
  providerCustomerId: string | null
  createdAt: string
  updatedAt: string
}

export interface Entitlements {
  accountId: string
  status: SubscriptionStatus
  features: {
    chat: { enabled: boolean; mode: 'full' | 'degraded' | null; limits: { conversations: number | null } }
    crm: { enabled: boolean; limits: { leads: number | null } }
    agents: { enabled: boolean; limits: { max: number | null } }
    voice: { enabled: boolean; limits: { minutes: number | null } }
    // No per-account override support (unlike chat/agents/voice above) --
    // not requested for this feature, kept out to avoid unrequested scope.
    kbFileSize: { enabled: boolean; limits: { maxBytes: number | null } }
  }
}

export interface WebhookEvent {
  eventId: string
  provider: string
  eventType: string
  processedAt: string
  expiresAt: number
}

export interface PaymentRecord {
  accountId: string
  paidAt: string
  paymentId: string
  subscriptionId: string
  amount: number
  currency: string
  status: string
  createdAt: string
}

export type AuditAction = 'toggle_internal' | 'extend_trial' | 'change_plan' | 'set_overrides'

export interface AuditEntry {
  accountId: string
  timestamp: string
  auditId: string
  actorEmail: string
  action: AuditAction
  reason: string
  before: Record<string, unknown>
  after: Record<string, unknown>
}
