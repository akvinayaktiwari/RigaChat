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

// ---------------------------------------------------------------------------
// Lead state + the unified inbox
//
// Mirrors backend/src/types/index.ts. A LeadRef names BOTH the table and the
// parent key, which is the only way to read a lead back without knowing its
// source up front -- the three lead tables have three different partition keys.
// ---------------------------------------------------------------------------

export type LeadSource = 'chat' | 'form' | 'meta'

export type LeadRef =
  | { source: 'chat'; botId: string; leadId: string }
  | { source: 'form'; formId: string; leadId: string }
  | { source: 'meta'; pageId: string; leadId: string }

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'closed'

export type LeadOutcome = 'won' | 'lost' | 'unreachable'

export interface LeadNote {
  noteId: string
  body: string
  authorId: string
  createdAt: string
}

export interface LeadState {
  leadId: string
  clientId: string
  status: LeadStatus
  outcome?: LeadOutcome
  ownerId?: string
  nextActionAt?: string
  lastTouchedAt?: string
  leadScore?: number
  replied?: boolean
  appointmentBooked?: boolean
  notes: LeadNote[]
  createdAt: string
  updatedAt: string
  // Set when an operator archives the lead: hidden from the inbox, nothing
  // else touched. Absent on every lead that has never been archived, so the
  // check is "has an archivedAt", never a boolean needing a backfill.
  archivedAt?: string
  archivedBy?: string
}

// Why a lead sits where it does in the urgency-ordered inbox. Server-computed
// and sent on the wire, so no client recomputes the rule.
export type UrgencyTier = 'overdue' | 'untouched' | 'scheduled' | 'in_progress' | 'closed'

// One page of the unified inbox. Pagination is OPT-IN: omit `limit` and this
// carries the whole inbox with no nextCursor, which is what the web does.
export interface UnifiedInboxPage {
  leads: UnifiedLead[]
  total: number
  nextCursor?: string
}

export interface UnifiedLead {
  leadId: string
  clientId: string
  source: LeadSource
  name?: string
  phone?: string
  email?: string
  propertyInterest?: string
  budgetRange?: string
  sourceUrl?: string
  leadRef: LeadRef
  createdAt: string
  // null means nobody has touched this lead yet -- there is no state row, which
  // the UI reads as 'new' rather than writing one on capture just to say so.
  state: LeadState | null
  // Stamped by the same code that decides the order, so what a client renders
  // is provably the value that produced the row's position.
  urgencyTier: UrgencyTier
}

// One lead, opened. Mirrors backend UnifiedLeadDetail: everything the list row
// carries, plus the raw material a human reads before deciding what to say —
// the conversation for a chat lead, the submitted answers for form/Meta.
export interface UnifiedLeadDetail extends UnifiedLead {
  chatTranscript?: string
  customFields?: Record<string, string>
}

// Only the fields an operator may set. replied/appointmentBooked are written by
// the journey executor and are deliberately absent here.
export interface LeadStatePatch {
  status?: LeadStatus
  outcome?: LeadOutcome | null
  ownerId?: string | null
  nextActionAt?: string | null
  leadScore?: number | null
}

export type KBFileType = 'pdf' | 'docx' | 'text'

// indexingStatus is undefined for text-only entries (added via the plain
// title+content form) — only file-upload entries carry these fields, mirrors
// backend/src/types/index.ts's KnowledgeBaseEntry exactly.
export interface KnowledgeBaseEntry {
  entryId: string
  botId: string
  clientId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  sourceFileKey?: string
  fileType?: KBFileType
  fileSizeBytes?: number
  indexingStatus?: 'queued' | 'processing' | 'complete' | 'failed'
  indexingJobId?: string
  indexingError?: string
}

export interface KBUploadUrlResult {
  uploadUrl: string
  key: string
  entryId: string
}

export interface ConfirmKBUploadInput {
  botId: string
  entryId: string
  filename: string
  fileType: KBFileType
  fileSizeBytes: number
  s3Key: string
}

export interface ConfirmVoiceKBUploadInput {
  agentId: string
  entryId: string
  filename: string
  fileType: KBFileType
  fileSizeBytes: number
  s3Key: string
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
  notificationPreferences?: NotificationPreferences
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
  active: boolean
}

export interface ConnectWhatsAppInput {
  apiKey: string
  appName: string
  sourceNumber: string
  notificationNumber: string
}

export interface MetaDirectWhatsAppConnection {
  provider: 'meta_direct'
  connected: boolean
  wabaId: string
  phoneNumberId: string
  businessAccountId: string
  displayPhoneNumber: string
  notificationNumber: string
  connectedAt: string
  active: boolean
}

export interface ConnectMetaWhatsAppInput {
  code: string
  wabaId: string
  phoneNumberId: string
  notificationNumber: string
  // Embedded Signup reports the owning business alongside the WABA. Optional
  // because older payloads and the redirect path do not carry one.
  businessId?: string
}

export interface MetaPageSummary {
  pageId: string
  clientId: string
  pageName: string
  connectedAt: string
  lastVerifiedAt: string
}

/** One Page as offered in the picker, with what we already know about it. */
export interface MetaSelectablePage {
  pageId: string
  pageName: string
  /** Already connected to this client -- shown checked and disabled. */
  connected: boolean
  /** Connected to a different client -- shown disabled, with the reason, before submit. */
  unavailable: boolean
}

export interface MetaPageSkipped {
  pageId: string
  pageName: string
  /**
   * `batch_budget_exceeded` is not a failure: the Page was never attempted,
   * because the batch ran out of Lambda time first. Pressing Connect again
   * picks it up. It exists so running out of time is a reported outcome rather
   * than a process kill that strands a half-written batch.
   */
  reason: 'already_connected_to_another_account' | 'subscribe_failed' | 'batch_budget_exceeded'
}

/** A multi-connect can partially succeed: one taken Page must not block the rest. */
// maxPerBatch comes from the server so the picker's cap cannot drift from the
// cap the server actually enforces.
export interface MetaSelectablePagesResult {
  pages: MetaSelectablePage[]
  maxPerBatch: number
}

/** Result of a webhook-subscription reconciliation pass over the client's Pages. */
export interface MetaSubscriptionReport {
  checked: number
  repaired: string[]
  unrepairable: string[]
}

export interface MetaConnectPagesResult {
  connected: MetaPageSummary[]
  skipped: MetaPageSkipped[]
}

export interface MetaConnection {
  provider: 'meta'
  connected: boolean
  pageId: string
  pageName: string
  connectedAt: string
}

export interface MetaLead {
  leadId: string
  pageId: string
  clientId: string
  source: 'meta'
  name?: string
  phone?: string
  email?: string
  propertyInterest?: string
  budgetRange?: string
  customFields: string | Record<string, string>
  sourceUrl: string
  createdAt: string
  crmSynced?: boolean
  crmSyncedAt?: string
  crmExternalId?: string
  crmSyncError?: string
  crmSyncAttempts?: number
}

// Which channels fire when a lead arrives. Absent, or partially absent, means
// on -- every client predates this field.
//
// REPLACED the old `Preferences` interface on 2026-08-27. That one had four
// toggles (emailNotifications, desktopAlerts, weeklySummary,
// leadAssignmentAlerts) held in sessionStorage and read by nothing: a grep of
// backend/src returned zero hits for all four. Persisting them server-side
// would have made three placebo switches durable instead of removing them, so
// the three that gate a real send replaced the four that gated nothing.
export interface NotificationPreferences {
  push: boolean
  whatsapp: boolean
  email: boolean
}

// One registered mobile install. expoPushToken is never sent to the browser --
// it is a send credential of no use to a human.
export interface LinkedDevice {
  clientId: string
  deviceId: string
  platform: 'android' | 'ios'
  appVersion: string
  registeredAt: string
  lastSeenAt: string
  failureCount: number
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

// indexingStatus is undefined for text-only entries (added via the plain
// title+content form) — only file-upload entries carry these fields, mirrors
// KnowledgeBaseEntry above and backend/src/types/index.ts's
// VoiceKnowledgeBaseEntry exactly.
export interface VoiceKnowledgeBaseEntry {
  entryId: string
  agentId: string
  clientId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  sourceFileKey?: string
  fileType?: KBFileType
  fileSizeBytes?: number
  indexingStatus?: 'queued' | 'processing' | 'complete' | 'failed'
  indexingJobId?: string
  indexingError?: string
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
  kbFileSize: { enabled: boolean; limits: { maxBytes: number | null } }
}

export interface SubscriptionSummary {
  plan: PlanTier
  status: SubscriptionStatus
  trialEndsAt: string | null
  features: EntitlementFeatures
  // Optional because the sessionStorage cache deliberately does not store it --
  // see subscription-cache.ts. Entitlements are stable enough to cache for an
  // hour; a usage counter is not, and a stale "47 of 100 conversations" is
  // worse than no number. A cache hit therefore has no usage until the
  // revalidation lands. Read it as "absent means not loaded yet", never as zero.
  usage?: { chatConversations: number }
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
  invoiceUrl?: string | null
}

export type ScheduledActionType = 'weekly_report' | 'lead_reminder'

export type ScheduleCadence = { type: 'interval_days'; intervalDays: number } | { type: 'one_off'; at: string }

export interface ScheduledAction {
  scheduleId: string
  clientId: string
  actionType: ScheduledActionType
  cadence: ScheduleCadence
  enabled: boolean
  leadId?: string
  botId?: string
  createdAt: string
  updatedAt: string
}

export interface AppointmentRequest {
  requestId: string
  botId: string
  clientId: string
  leadId: string
  requestedAt: string
  notes?: string
  status: 'requested' | 'confirmed' | 'failed'
  calComBookingUid?: string
  createdAt: string
}

export type JourneyChannel = 'web_widget' | 'whatsapp'

export type JourneyTriggerType = 'lead_captured' | 'manual_score' | 'site_visit_done'

interface JourneyStepBase {
  stepId: string
  name: string
}

export interface SendMessageStep extends JourneyStepBase {
  type: 'send_message'
  messageHint?: string
  // The approved WhatsApp template used when the 24h session window is CLOSED,
  // which is the normal case for any step firing on a schedule rather than
  // straight after a reply. Mirrors the backend SendMessageStep; without it a
  // greet or nudge step cannot send at all outside the window.
  //
  // These were absent here while present on the wire, so anything that rebuilt
  // a step from this type silently dropped them.
  whatsappTemplateName?: string
  whatsappTemplateParams?: string[]
  next?: string
}

export interface WaitStep extends JourneyStepBase {
  type: 'wait'
  waitDays: number
  next?: string
}

export interface WaitAndRecheckStep extends JourneyStepBase {
  type: 'wait_and_recheck'
  waitDays: number
  maxIterations: number
  recheckField: 'replied' | 'lead_score' | 'appointment_booked'
  onSatisfied: string
  onExhausted: string
}

export interface ConditionStep extends JourneyStepBase {
  type: 'condition'
  field: 'replied' | 'lead_score' | 'appointment_booked'
  operator: 'equals' | 'not_equals'
  value: string
  onTrue: string
  onFalse: string
}

// Mirrors the backend's McpCapability union (backend/src/types/index.ts). The
// backend rejects anything outside this set with a 400, so keeping the two in
// sync is what stops the builder from constructing a payload that can only
// fail on save.
export type McpCapability = 'booking' | 'reminder' | 'quotation' | 'brochure'

export interface ToolCallStep extends JourneyStepBase {
  type: 'tool_call'
  // `''` is the builder's "no tool chosen yet" draft state and is deliberately
  // part of the type rather than cast away -- a freshly added tool_call step
  // genuinely has no tool. validateSteps() blocks saving while it's empty, so
  // `''` can never reach the API.
  toolName: McpCapability | ''
  toolInput?: Record<string, unknown>
  next?: string
}

export interface HumanHandoffStep extends JourneyStepBase {
  type: 'human_handoff'
  reason?: string
}

// Mirrors the backend AwaitReplyStep. The step that makes a journey wait on the
// lead rather than a clock: the execution pauses until they reply, or until the
// 24h WhatsApp window closes and it takes onNoReply.
export interface AwaitReplyStep extends JourneyStepBase {
  type: 'await_reply'
  promptHint?: string
  next: string
  onNoReply: string
}

export type JourneyStep =
  | SendMessageStep
  | WaitStep
  | WaitAndRecheckStep
  | ConditionStep
  | ToolCallStep
  | HumanHandoffStep
  | AwaitReplyStep

export interface JourneyDefinition {
  journeyId: string
  botId: string
  clientId: string
  name: string
  triggerType: JourneyTriggerType
  startStepId: string
  steps: JourneyStep[]
}

export interface AgentChannelConfig {
  messageTemplateName?: string
  messageTemplateParams?: string[]
}

export interface AgentConfig {
  // The journey persona's own id (client-minted). Named personaId, not agentId,
  // to avoid colliding with the top-level cross-channel Agent entity's agentId.
  personaId: string
  name: string
  systemPrompt: string
  toneDescription?: string
  mcpToolbox: McpCapability[]
  channelConfig: Partial<Record<JourneyChannel, AgentChannelConfig>>
}

// A prebuilt agent we author and ship in the codebase. Not a JourneyBundle:
// templates are the same for every client and nobody can edit them from the
// product. Cloning one produces a bundle the client owns.
export interface JourneyTemplate {
  templateId: string
  name: string
  description: string
  vertical: 'real_estate'
  journey: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent: AgentConfig
}

// 'paused' is a published bundle whose trigger claim has been released: it
// still holds its compiled state machine (so resuming is a republish, not a
// rebuild) but no new lead ignites into it. Every consumer gates on
// `status === 'published'`, so paused reads as not-live everywhere without
// any of them needing to know the value exists.
// Mirrors the backend. Only the three outcomes something actually writes:
// 'cancelled'/'timed_out' are deliberately absent until a writer exists, so the
// UI never renders a status the data cannot produce.
export type JourneyOutcome = 'completed' | 'failed' | 'handed_off'

// What an erasure destroyed. Surfaced to the operator so an irreversible action
// reports what it actually did rather than a bare success.
export interface LeadErasureReport {
  leadId: string
  source: LeadRef['source']
  eventsDeleted: number
  executionsStopped: number
}

// One event inside a run, as the drill-down renders it.
export interface JourneyExecutionEvent {
  ts: string
  type: string
  stepId?: string
  toolName?: string
  channel?: string
  status?: string
  outcome?: JourneyOutcome
  errorDetail?: string
}

// One lead's run through one journey, derived on read from lead_events.
export interface JourneyExecutionSummary {
  leadId: string
  bundleId: string
  // 'running' means no terminal event exists — which for a run that started
  // before terminal events shipped may really mean "died silently". The UI must
  // not present it as proof the journey is alive.
  status: 'running' | JourneyOutcome
  startedAt: string
  lastEventAt: string
  lastStepId?: string
  lastEventType: string
  eventCount: number
  errorDetail?: string
  executionArn?: string
  // Already fetched to build the summary, so the drill-down costs no extra call.
  events: JourneyExecutionEvent[]
}

export type JourneyBundleStatus = 'draft' | 'published' | 'paused'

export interface JourneyBundle {
  bundleId: string
  botId: string
  clientId: string
  name: string
  description?: string
  isPrebuiltTemplate: boolean
  sourceTemplateId?: string
  journey: JourneyDefinition
  agent: AgentConfig
  // The sales plan this was generated from. Optional and additive: a bundle
  // authored before the plan builder simply has none, and the builder infers
  // one from the steps instead. Typed as unknown here and narrowed by
  // lib/journey-plan.ts, which owns the shape -- a second copy of that
  // interface would drift from the compiler that actually uses it.
  plan?: unknown
  status: JourneyBundleStatus
  compiledStateMachineArn?: string
  createdAt: string
  updatedAt: string
}

export interface CalComConnection {
  provider: 'cal_com'
  connected: boolean
  tokenExpiresAt: string
  calComUserId?: string
  defaultEventTypeId?: number
  connectedAt: string
}

export interface CalComEventType {
  id: number
  title: string
  slug: string
  lengthInMinutes: number
}
// Marketing-site "Get in touch" form (POST /api/contact, public, no auth).
export interface SubmitContactMessageInput {
  name: string
  email: string
  subject: string
  message: string
  // Honeypot — hidden from real users, so a filled value means a bot. Always
  // sent (empty for humans) so its absence can't be used to bypass the check.
  company: string
}

export interface SubmitContactMessageResult {
  messageId: string
  createdAt: string
}

// Mirrors the backend's MetaDeletionRequestStatus. Deliberately omits the
// Meta app-scoped user id the stored record carries — the confirmation code
// travels in a URL and may be shared or logged.
export interface MetaDeletionRequestStatus {
  confirmationCode: string
  status: 'received' | 'completed'
  requestedAt: string
}

// Mirrors backend BotWhatsAppStatus. `displayPhoneNumber` is the human-dialable
// number; the backend never sends phoneNumberId here because Meta's internal
// resource id cannot form a wa.me link.
export interface BotWhatsAppStatus {
  connectionAvailable: boolean
  enabled: boolean
  displayPhoneNumber?: string
  blockedReason?: string
}

// Mirrors backend LeadEvent. The append-only record of everything that happened
// to a lead: messages both directions, delivery statuses, journey steps, tool
// calls, handoffs.
export type LeadEventType =
  | 'lead_captured'
  | 'journey_started'
  | 'journey_step'
  | 'message_out'
  | 'message_status'
  | 'message_in'
  // An alert to the CLIENT about this lead, not a message to the lead. Renders
  // as a system row, never as part of the conversation.
  | 'notification_out'
  | 'tool_call'
  | 'handoff'
  | 'journey_ended'
  | 'state_change'

export type MessageDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface LeadEvent {
  leadId: string
  ts: string
  clientId: string
  botId: string
  type: LeadEventType
  channel?: 'whatsapp' | 'web_widget'
  wamid?: string
  mode?: 'template' | 'free_text'
  templateName?: string
  body?: string
  status?: MessageDeliveryStatus
  errorDetail?: string
  bundleId?: string
  stepId?: string
  toolName?: string
  reason?: string
  // journey_ended only. Named `outcome` like the backend field; note this is a
  // JourneyOutcome (how a journey ENDED) and is unrelated to LeadOutcome, which
  // is the CRM disposition of the lead itself.
  outcome?: JourneyOutcome
  executionArn?: string
}
