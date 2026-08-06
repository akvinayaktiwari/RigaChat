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
  // Required even for file-upload rows, which write '' here until
  // extraction populates it -- see indexingStatus below for the source of
  // truth on whether content is actually populated yet. Mirrors
  // KnowledgeBaseEntry.
  content: string
  createdAt: string
  updatedAt: string

  // File-upload path only (see voice-service.ts's confirmVoiceKBUpload()) --
  // absent on rows created via the text-entry addVoiceKBEntry() path.
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

export interface MetaConnection {
  provider: 'meta'
  connected: boolean
  pageId: string
  pageName: string
  pageAccessTokenEncrypted: string
  connectedAt: string
}

export interface MetaDirectWhatsAppConnection {
  provider: 'meta_direct'
  connected: boolean
  wabaId: string
  phoneNumberId: string
  businessAccountId: string
  accessTokenEncrypted: string
  displayPhoneNumber: string
  notificationNumber: string
  connectedAt: string
}

export type WhatsAppActiveProvider = 'gupshup' | 'meta_direct'

export interface ForgotPasswordInput {
  email: string
}

export interface ForgotPasswordResponse {
  message: string
}

export interface ConfirmForgotPasswordInput {
  email: string
  code: string
  newPassword: string
}

export interface ConfirmSignupInput {
  email: string
  code: string
}

export interface ResendConfirmationCodeInput {
  email: string
}

export interface ResendConfirmationCodeResponse {
  message: string
}

export interface ClientRecord {
  clientId: string
  email: string
  name: string
  authProvider: 'google' | 'email'
  plan: 'starter' | 'growth' | 'agency'
  crmConnection?: CRMConnection
  whatsappConnection?: WhatsAppConnection
  metaDirectWhatsAppConnection?: MetaDirectWhatsAppConnection
  activeWhatsappProvider?: WhatsAppActiveProvider
  metaConnection?: MetaConnection
  calComConnection?: CalComConnection
  createdAt: string
  updatedAt: string
}

// Tokens KMS-encrypted (lib/kms.ts), matching WhatsApp/Meta's connection
// pattern -- not CRMConnection's (Zoho) unencrypted accessToken/refreshToken,
// a pre-existing weaker pattern this deliberately doesn't propagate into new
// code. defaultEventTypeId is required before booking-mcp-server.ts's
// bookAppointment() can create a real booking (Cal.com's POST /v2/bookings
// needs an eventTypeId) -- connected without one means "OAuth done, not yet
// configured," a real intermediate state, not an error.
export interface CalComConnection {
  provider: 'cal_com'
  connected: boolean
  accessTokenEncrypted: string
  refreshTokenEncrypted: string
  // Cal.com access tokens expire in 30 minutes (short-lived compared to
  // Zoho/Meta) -- refreshed proactively by cal-com-service.ts's
  // getValidAccessToken() before any API call, not reactively on a 401.
  tokenExpiresAt: string
  calComUserId?: string
  defaultEventTypeId?: number
  connectedAt: string
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

// Meta Lead Ads submission. Unlike FormLead (tied to a formId the client
// built with the form builder's FormField[] definitions), Meta forms are
// authored inside Meta's own Ads Manager -- we never see field types up
// front, only whatever question labels the client's Instant Form happens to
// use. name/phone/email/propertyInterest/budgetRange are populated via
// best-effort label matching in meta-lead-service.ts; anything unmatched
// stays in customFields, same fallback FormLead already uses for its blob.
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
  // Razorpay-hosted invoice page (short_url from their Invoices API), only
  // present when the account's Razorpay settings have GST/invoicing
  // configured. null when Razorpay didn't generate an invoice for this
  // charge, or the lookup failed - never blocks payment recording.
  invoiceUrl?: string | null
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

// --- Agent Scheduler & Journey Flow ---
// Resolves Open Question #7 of the approved agents-schedulers-journeys design
// (2026-07-26): the client-authored Journey builder was never scoped as its
// own deliverable. See the 2026-07-29 design addendum
// (~/.gstack/projects/akvinayaktiwari-RigaChat/akvinayaktiwari-agents-schedulers-journeys-builder-ux-design-*.md)
// for the full architecture discussion behind the shapes below.

export type JourneyChannel = 'web_widget' | 'whatsapp'

export type JourneyTriggerType = 'lead_captured' | 'manual_score' | 'site_visit_done'

interface JourneyStepBase {
  stepId: string
  name: string
}

export interface SendMessageStep extends JourneyStepBase {
  type: 'send_message'
  // Agent composes the actual message from its systemPrompt/KB context; this
  // is an optional steer, not a hard template (WhatsApp's hard template
  // requirement lives on AgentChannelConfig, not here).
  messageHint?: string
  next?: string
}

export interface WaitStep extends JourneyStepBase {
  type: 'wait'
  // Whole days only, deliberately -- not seconds/minutes. This is the first
  // half of the polling-loop guardrail from the design addendum: a client
  // physically cannot express "check every 5 minutes" through this step,
  // because the unit itself forecloses it. See WaitAndRecheckStep below for
  // the one legitimate bounded-repeat primitive.
  waitDays: number
  next?: string
}

// The one sanctioned way to express "try again if not satisfied" in this
// step-list model. A general graph cycle (any step pointing back to an
// earlier step) is deliberately NOT supported anywhere in JourneyStep --
// journey-compiler-service.ts enforces steps as strictly forward-referencing
// (a DAG by construction, validated via array position, not graph traversal)
// specifically so the "step-list, not graph canvas" UX decision (2026-07-29)
// holds at the data-model level too, not just in the UI. This step is the
// deliberate escape hatch: bounded by both waitDays (>= MIN_WAIT_DAYS) and
// maxIterations (<= MAX_WAIT_AND_RECHECK_ITERATIONS), both enforced by the
// compiler before ASL generation.
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

export interface ToolCallStep extends JourneyStepBase {
  type: 'tool_call'
  // Must be present in the owning JourneyBundle's AgentConfig.mcpToolbox --
  // validated by journey-service.ts before persisting, not by the type
  // system (the toolbox is per-bundle, not known at this type's definition).
  toolName: string
  toolInput?: Record<string, unknown>
  next?: string
}

export interface HumanHandoffStep extends JourneyStepBase {
  type: 'human_handoff'
  reason?: string
}

export type JourneyStep =
  | SendMessageStep
  | WaitStep
  | WaitAndRecheckStep
  | ConditionStep
  | ToolCallStep
  | HumanHandoffStep

export interface JourneyDefinition {
  journeyId: string
  botId: string
  clientId: string
  name: string
  triggerType: JourneyTriggerType
  startStepId: string
  // Ordered array is load-bearing, not cosmetic: journey-compiler-service.ts
  // validates that every step reference (next/onTrue/onFalse/onSatisfied/
  // onExhausted) points to a step at a LATER array index than the referring
  // step, which is what makes this a DAG by construction. Reordering this
  // array without updating references would silently change that
  // validation's outcome.
  steps: JourneyStep[]
}

// Channel-specific fields only -- e.g. WhatsApp's pre-approved
// message-template requirement outside a 24h session window (per the
// WhatsApp Meta Direct design's Premise 9), which doesn't apply to the web
// widget. Kept separate from AgentConfig's channel-agnostic fields so
// "add a channel later" means adding one of these blocks, not restructuring
// the fused bundle -- see JourneyBundle below and Decision #2's caveat in
// the design addendum.
export interface AgentChannelConfig {
  messageTemplateName?: string
  messageTemplateParams?: string[]
}

// -------------------------------------------------------------------------
// Top-level cross-channel Agent entity (additive umbrella over botId /
// voice agentId). One Agent is what a client owns; it has optional channel
// bindings that resolve to the existing per-channel implementation records
// (web -> a chatbot's botId, voice -> a voice agent's agentId). botId-scoped
// Pinecone namespaces are never touched -- the Agent is an identity layer on
// top, not a re-key. See the 2026-07-29 design + plan-eng-review.
//
// NOT the same thing as AgentConfig below: AgentConfig is a journey's
// qualification persona (its id is AgentConfig.personaId). This Agent is the
// durable, channel-spanning identity a Journey/Scheduler targets.
// -------------------------------------------------------------------------

// Which underlying channel implementation an Agent binding points at. Distinct
// from JourneyChannel (journey *delivery* channels) -- this axis is "which
// implementation record is wired in", including voice, which journeys don't
// deliver to yet.
export type AgentChannel = 'web' | 'whatsapp' | 'voice'

export interface AgentChannelBinding {
  // The implementation record this channel resolves to: a botId for 'web', a
  // voice agentId for 'voice'. Absent for 'whatsapp', whose connection lives on
  // the client record (no per-agent WhatsApp resource id exists today), so a
  // whatsapp binding is a marker with no claimable resourceId.
  resourceId?: string
}

export interface Agent {
  agentId: string
  clientId: string
  name: string
  // Optional per-channel bindings. An Agent may have one, two, or three; a
  // channel is present only once wired in.
  channels: Partial<Record<AgentChannel, AgentChannelBinding>>
  createdAt: string
  updatedAt: string
}

// Row in the agent_binding_lookup table: reverse index from a bound resource
// (botId / voiceAgentId) to its owning Agent, written via an atomic claim so a
// resource belongs to at most one Agent. Mirrors gupshup_app_lookup.
export interface AgentBindingLookup {
  resourceId: string
  agentId: string
  clientId: string
  boundAt: string
}

// Channel-agnostic: tone, bounded tool palette, qualification logic. Reused
// across whichever channels this agent is wired into.
export interface AgentConfig {
  // The journey persona's own id (client-minted). Named personaId, not agentId,
  // to avoid colliding with the top-level cross-channel Agent entity's agentId.
  personaId: string
  name: string
  systemPrompt: string
  toneDescription?: string
  // Bounded MCP tool palette per the approved design -- NOT full autonomy.
  mcpToolbox: string[]
  channelConfig: Partial<Record<JourneyChannel, AgentChannelConfig>>
}

export type JourneyBundleStatus = 'draft' | 'published'

// Fused Journey + Agent + toolbox, per the 2026-07-29 architecture session's
// Decision #2: a prebuilt "agent" (lead-qualification, appointment-booking,
// etc.) is one editable unit, not a decoupled Journey/Agent composition.
// This is what gets stored, listed, and cloned when a client picks a
// template from the prebuilt library.
export interface JourneyBundle {
  bundleId: string
  botId: string
  // The owning cross-channel Agent, resolved from botId's binding at create
  // time. Optional/additive: a bundle whose bot isn't wrapped in an Agent yet
  // (or was created before the Agent umbrella) simply has none. botId stays the
  // partition key -- this is the logical owner, not a re-key.
  agentId?: string
  clientId: string
  name: string
  description?: string
  isPrebuiltTemplate: boolean
  // Set when cloned from a prebuilt template, so template updates can
  // eventually be tracked against clones -- that tracking mechanism itself
  // is not built in this pass.
  sourceTemplateId?: string
  journey: JourneyDefinition
  agent: AgentConfig
  status: JourneyBundleStatus
  // Set once status transitions to 'published' and journey-compiler-service
  // successfully compiles+deploys the state machine. Absent for drafts.
  compiledStateMachineArn?: string
  createdAt: string
  updatedAt: string
}

// Minimal typed subset of AWS Step Functions' Amazon States Language --
// only the states this compiler actually emits (Wait, Task, Choice,
// Succeed), not the full ASL spec.
export interface AslWaitState {
  Type: 'Wait'
  Seconds: number
  Next?: string
  End?: boolean
}

export interface AslTaskState {
  Type: 'Task'
  Resource: string
  Parameters?: Record<string, unknown>
  ResultPath?: string
  Next?: string
  End?: boolean
  Retry?: { ErrorEquals: string[]; MaxAttempts: number; IntervalSeconds: number; BackoffRate?: number }[]
}

export interface AslChoiceRule {
  Variable: string
  StringEquals?: string
  BooleanEquals?: boolean
  Next: string
}

export interface AslChoiceState {
  Type: 'Choice'
  Choices: AslChoiceRule[]
  Default: string
}

export interface AslSucceedState {
  Type: 'Succeed'
}

export type AslState = AslWaitState | AslTaskState | AslChoiceState | AslSucceedState

export interface AslStateMachine {
  Comment?: string
  StartAt: string
  States: Record<string, AslState>
}

// --- Scheduler (EventBridge Scheduler) ---
// The "wait" half of the approved architecture that isn't a Journey's own
// per-lead timeline: client-configured recurring or one-off wall-clock-time
// actions (e.g. "send my report every N days"), created as a real
// EventBridge Scheduler schedule object per client via a runtime API call --
// not a hardcoded cron entry in code. Replaces the single global EventBridge
// rule that currently fires sendWeeklyReportsForAllClients() for every
// connected client on the same fixed cadence (backend/index.ts's
// 'whatsapp-weekly-report' branch) with a per-client, per-action primitive.
// The existing hardcoded rule is left running -- see TODOS.md for the
// migration/cutover, which is a deploy-time decision, not a code one.

// 'weekly_report' folds the hardcoded feature into this general primitive,
// per the approved design. 'lead_reminder' is the MCP reminder tool's
// wall-clock trigger (backend/src/mcp/reminder-mcp-server.ts) -- a Journey
// step that needs to fire at a specific future moment for a specific lead,
// as opposed to a Journey's own relative (wait N days) timeline.
export type ScheduledActionType = 'weekly_report' | 'lead_reminder'

export type ScheduleCadence =
  | { type: 'interval_days'; intervalDays: number }
  // ISO 8601 datetime -- EventBridge Scheduler deletes/disables a one-off
  // schedule after it fires once (see lib/eventbridge-scheduler.ts).
  | { type: 'one_off'; at: string }

export interface ScheduledAction {
  scheduleId: string
  clientId: string
  actionType: ScheduledActionType
  cadence: ScheduleCadence
  enabled: boolean
  // Present only for lead-scoped actions (lead_reminder); absent for
  // account-level ones (weekly_report). Threaded through to the EventBridge
  // Scheduler target's Input (lib/eventbridge-scheduler.ts) so
  // executeScheduledAction() knows which lead/bot a lead-scoped action fired
  // for.
  leadId?: string
  botId?: string
  // The owning cross-channel Agent, resolved from botId's binding at create
  // time when a botId is present. Optional/additive; clientId stays the
  // partition key.
  agentId?: string
  createdAt: string
  updatedAt: string
}

// --- Journey Executor ---
// journey-executor-service.ts's runtime counterpart to the compile-time
// guardrails in journey-compiler-service.ts. A wait_and_recheck step's
// iteration count is tracked here (keyed by leadId+stepId, stable across
// every loop iteration for that specific lead on that specific step)
// rather than threaded through Step Functions' own JSON state -- see
// journey-compiler-service.ts's compileWaitAndRecheckStep() for why the
// JSONPath-threaded version didn't actually work.
export interface WaitAndRecheckIteration {
  leadId: string
  stepId: string
  iterationCount: number
  updatedAt: string
}

export type JourneyExecutorOperation = 'send_message' | 'tool_call' | 'wait_and_recheck_check' | 'human_handoff'

// The shape every compiled Task state's Parameters produces (see
// CONTEXT_PASSTHROUGH_PARAMETERS in journey-compiler-service.ts), and what
// backend/index.ts's Lambda handler receives when Step Functions invokes it
// directly for a Task state. Fields beyond the shared context are
// operation-specific -- present depending on `operation`, not all at once.
export interface JourneyExecutorEvent {
  operation: JourneyExecutorOperation
  botId: string
  bundleId: string
  clientId: string
  leadId: string
  channel: JourneyChannel
  stepId?: string
  messageHint?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  recheckField?: 'replied' | 'lead_score' | 'appointment_booked'
  maxIterations?: number
  reason?: string
}

export interface WaitAndRecheckResult {
  satisfied: boolean
  exhausted: boolean
}

// --- MCP Toolbox ---
// Real record backing the booking MCP tool (backend/src/mcp/booking-mcp-server.ts).
// 'requested' is the fallback for a client with no Cal.com connection (or no
// default event type set yet) -- a real request with no calendar behind it,
// same as this record's original (pre-Cal.com) design. 'confirmed' means
// booking-mcp-server.ts successfully created a real Cal.com booking
// (calComBookingUid is set). 'failed' means a connected client's booking
// attempt errored (notes carries the error) -- surfaced to the client rather
// than silently falling back to 'requested', since that would hide a real
// booking failure as if it were merely unconfirmed.
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

// --- Marketing-site contact form ---
// Submitted by an anonymous visitor on the public /contact page, so there is
// no clientId or botId on this record — it is a message to VyostraAI itself,
// not a lead for one of our clients' bots. Kept in its own table for that
// reason rather than reusing `leads`.
export interface ContactMessage {
  messageId: string
  name: string
  email: string
  subject: string
  message: string
  // Constant discriminator, only ever 'contact_message'. Exists solely as the
  // partition key of the recordType-createdAt-index GSI so the ops console can
  // list submissions newest-first without a table Scan. Safe as a single hot
  // partition here: this is one landing page's contact form, not bot traffic.
  recordType: 'contact_message'
  // Best-effort provenance for abuse triage; 'unknown' when the runtime does
  // not expose a remote address (same fallback as auth-routes' getClientIp).
  sourceIp: string
  // false when the notification email could not be sent (or SES is not
  // configured) — the message is still stored, so nothing is lost, but this
  // flags rows a human never got pinged about.
  notified: boolean
  createdAt: string
}

export interface SubmitContactMessageInput {
  name: string
  email: string
  subject: string
  message: string
  // Honeypot: a field hidden from real users via CSS. Bots that fill every
  // input submit a non-empty value here, which the service silently drops.
  company?: string
}

export interface SubmitContactMessageResult {
  messageId: string
  createdAt: string
}
