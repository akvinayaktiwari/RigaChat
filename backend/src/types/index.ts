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

// -------------------------------------------------------------------------
// Lead events: the append-only record of everything that happened to a lead.
//
// Before this existed, a WhatsApp conversation was stored nowhere. Inbound text
// was passed to handleInboundLeadMessage as a Step Functions callback payload
// and dropped; outbound wamids lived only in Step Functions execution history
// (90 day retention, not queryable by lead); delivery statuses were a
// console.log. On 2026-08-16 a journey ran end to end in production and the
// dashboard could show none of it, because there was no data to show.
//
// An event log rather than a messages table, for two reasons. The client needs
// to see what the AGENT did (journey steps, tool calls, handoffs) interleaved
// with what was said, and a messages table cannot hold those. And a delivery
// status is an update to an earlier message, which append-only handles by
// adding a row rather than mutating one.
//
// No TTL. This is the audit record an enterprise buyer is actually buying.
// -------------------------------------------------------------------------

export type LeadEventType =
  | 'lead_captured'
  | 'journey_started'
  | 'journey_step'
  | 'message_out'
  | 'message_status'
  | 'message_in'
  // An alert to the CLIENT about this lead, not a message to the lead. Kept
  // out of message_out on purpose: it carries a wamid and needs delivery
  // tracking exactly like an outbound message, but it is not part of the
  // conversation, and anything that summarises a transcript (see
  // notification-service.ts summarizeRecentMessages) must not read it back as
  // something the agent said to the lead.
  | 'notification_out'
  | 'tool_call'
  | 'handoff'
  | 'journey_ended'
  | 'state_change'

export type LeadEventChannel = 'whatsapp' | 'web_widget'

export type MessageSendMode = 'template' | 'free_text'

export type MessageDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface LeadEvent {
  leadId: string
  // Sort key, `${isoTimestamp}#${uuid}`. The ISO prefix makes a Query return
  // rows in chronological order for free; the uuid suffix keeps two events in
  // the same millisecond from colliding on the key.
  ts: string
  clientId: string
  botId: string
  type: LeadEventType
  channel?: LeadEventChannel

  // message_out / message_status. On message_out this is the id Meta returned;
  // on message_status it is the id of the message being updated, which is what
  // makes the two correlatable. Also the partition key of the wamid GSI, so a
  // status webhook (which carries no leadId) can find the message it belongs to.
  wamid?: string
  mode?: MessageSendMode
  templateName?: string
  body?: string

  // message_status
  status?: MessageDeliveryStatus
  // Meta's own failure detail, kept verbatim: it is the entire diagnostic value
  // of a failed status, and summarising it is how a day gets lost.
  errorDetail?: string

  // journey_step / tool_call / handoff / journey_ended
  bundleId?: string
  stepId?: string
  toolName?: string
  reason?: string
  result?: Record<string, unknown>

  // journey_ended only. Without an outcome a terminal event says a journey
  // stopped and nothing about whether that was success -- which is the exact
  // ambiguity the event exists to remove, so it is REQUIRED on that type even
  // though the field is optional on the shared interface.
  outcome?: JourneyOutcome
  // The ARN of the Step Functions execution that produced this event, so an
  // operator can jump from the dashboard row straight to the real execution
  // history. Absent on events written outside a journey.
  executionArn?: string
}

// What resolve_condition merges into the execution state. Every value is a
// STRING because the compiled Choice uses StringEquals -- a boolean here would
// silently never match, which is worse than failing.
export interface ResolvedConditionFields {
  replied: string
  lead_score: string
  appointment_booked: string
}

// Deliberately only the three outcomes something actually WRITES.
//
// 'cancelled' and 'timed_out' were in the approved design and are omitted on
// purpose: a stopped execution runs no further states, so nothing inside the
// state machine can report it, and there is no whole-execution timeout to fire
// a 'timed_out'. Declaring them would repeat the exact defect this feature
// exists to fix -- journey_ended itself sat in LeadEventType for a month with
// zero call sites, which is why a finished journey and a dead one were
// indistinguishable. Add a value here when, and only when, a writer exists.
// One event inside a run, trimmed to what a drill-down renders. Deliberately
// not the whole LeadEvent: wamid, body and result are either noise here or
// carry message content that does not belong in a journey-level view.
export interface JourneyExecutionEvent {
  ts: string
  type: LeadEventType
  stepId?: string
  toolName?: string
  channel?: LeadEventChannel
  status?: MessageDeliveryStatus
  outcome?: JourneyOutcome
  errorDetail?: string
}

// One lead's run through one journey, reconstructed from its events. Not a
// stored record: it is derived on read, which is why it can be rebuilt for
// executions that predate the terminal event without backfilling anything.
export interface JourneyExecutionSummary {
  leadId: string
  bundleId: string
  // 'running' is an inference, not a fact: it means events exist and none of
  // them is terminal. An execution that died before the terminal event was
  // introduced looks identical, which is why the UI must never present this as
  // proof the journey is alive — see startedAt for how stale it might be.
  status: 'running' | JourneyOutcome
  startedAt: string
  lastEventAt: string
  // The step the run is sitting on, or the step it ended at.
  lastStepId?: string
  lastEventType: LeadEventType
  eventCount: number
  // Every event in this run, oldest first. Returned rather than discarded
  // because the read already had to fetch them to derive the summary — sending
  // only the summary meant a drill-down would re-query for data the caller
  // already paid to read.
  events: JourneyExecutionEvent[]
  // Failure path only, the flattened Step Functions error.
  errorDetail?: string
  executionArn?: string
}

export type JourneyOutcome =
  // Ran off the end of the step list.
  | 'completed'
  // A state threw and the catch-all routed here. The execution still fails
  // afterwards, so Step Functions' own status stays honest.
  | 'failed'
  // Reached a human_handoff step. Terminal, but not the same thing as running
  // to the end -- an operator reading a feed needs to tell those apart.
  | 'handed_off'

export interface AppendLeadEventInput extends Omit<LeadEvent, 'ts'> {
  // Optional so callers normally let the repository stamp it; injectable so a
  // test can assert ordering without sleeping.
  occurredAt?: string
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

/**
 * One connected Facebook Page, keyed by pageId in `meta_page_lookup`.
 *
 * The Page's access token lives HERE and not on ClientRecord, and that is the
 * whole point: a client can connect many Pages, and the token that signs for a
 * lead has to be reachable from the pageId the webhook delivered. Hanging the
 * token off the client instead made "which token signs for this Page?"
 * unanswerable past the first one -- an array on ClientRecord would not have
 * fixed it, only moved it.
 */
export interface MetaPageRegistration {
  pageId: string
  clientId: string
  /**
   * Optional because rows written before the registry existed carry only
   * pageId/clientId/connectedAt, and the backfill deliberately SKIPS any row
   * whose source connection had no name or token rather than inventing one.
   * Typing these as required made the repository's cast a lie and let
   * `undefined` reach the dashboard where a string was promised.
   */
  pageName?: string
  pageAccessTokenEncrypted?: string
  connectedAt: string
  /**
   * Last time we confirmed with Meta that this Page is still granted to the
   * app. Meta holds Page grants against the Meta USER, not against our
   * clientId, so one admin connecting several of our clients can silently
   * overwrite an earlier grant -- our row survives while the leads stop.
   * Nothing reconciles that yet (M5); this field ships now so M5 needs no
   * migration.
   */
  lastVerifiedAt?: string
}

/** A registration without its token, safe to return over the API. */
export type MetaPageSummary = Omit<MetaPageRegistration, 'pageAccessTokenEncrypted'>

/** One Page as offered to the client in the picker. */
export interface MetaSelectablePage {
  pageId: string
  pageName: string
  /** Already connected to THIS client -- shown checked and disabled. */
  connected: boolean
  /**
   * Connected to a DIFFERENT client. Shown disabled with a reason, before the
   * client submits, because a conflict explained up front costs nothing and a
   * conflict explained in an error costs a support round trip.
   */
  unavailable: boolean
}

/** Why a Page in a multi-connect request did not connect. */
export interface MetaPageSkipped {
  pageId: string
  pageName: string
  reason: 'already_connected_to_another_account' | 'subscribe_failed'
}

/**
 * A multi-connect can partially succeed, deliberately. One Page owned by
 * another account must not block the other 24 -- failing the batch would
 * punish the client for something they cannot see or fix.
 */
/**
 * The picker's payload. `maxPerBatch` travels with the Pages so the client cap
 * cannot drift from the server's: the server rejects anything over it, and a
 * client hard-coding a larger number would let someone compose a selection that
 * is refused only after they hit Connect.
 */
export interface MetaSelectablePagesResult {
  pages: MetaSelectablePage[]
  maxPerBatch: number
}

export interface MetaConnectPagesResult {
  connected: MetaPageSummary[]
  skipped: MetaPageSkipped[]
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
  // Whether POST /{wabaId}/subscribed_apps succeeded for this connection.
  //
  // Load-bearing, not diagnostic. Storing credentials makes a connection able
  // to SEND; only this subscription makes it able to RECEIVE. Without it Meta
  // delivers nothing -- no inbound messages, no delivery statuses -- so every
  // await_reply step times out at 24h and the 24h session window never opens.
  // That failure is completely invisible from the sending side, which is how
  // it survived until the first live journey run on 2026-08-16.
  //
  // Optional because connections written before the subscribe call existed
  // have no value here; treat `undefined` as "unknown, probably not subscribed"
  // and repair with scripts/subscribe-whatsapp-webhooks.ts.
  webhookSubscribed?: boolean

  // Whether POST /{phoneNumberId}/register succeeded. Third member of the same
  // family as `webhookSubscribed`: stored credentials make a connection able to
  // SEND, subscribed_apps makes it able to RECEIVE, and this makes the number
  // live for Cloud API at all. All three fail independently, and this is the
  // one that fails while a real client is watching.
  //
  // Optional for the same reason webhookSubscribed is: connections written
  // before the register call existed have no value. Treat `undefined` as
  // "unknown, probably not registered".
  registered?: boolean

  // The two-step verification PIN passed to /register, encrypted. Persisted
  // because Meta binds it on first registration and rejects a later register
  // that presents a different one -- a re-register with a freshly generated PIN
  // can never succeed, so the original has to survive.
  twoStepPinEncrypted?: string

  // When the business token dies. Embedded Signup configs built from the
  // "60 Expiration Token" template issue ~60-day tokens, NOT permanent ones, so
  // every client connection silently stops working two months after it is made
  // unless something refreshes it.
  //
  // Recorded from the exchange even though no refresh path exists yet: a
  // connection stored without it cannot be told apart from one that expires
  // tomorrow, and there is no way to backfill it short of making every client
  // reconnect. Same lesson as webhookSubscribed above, bought earlier.
  tokenExpiresAt?: string
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
  /**
   * Long-lived Meta USER token, encrypted. Distinct from a Page token: this one
   * lists which Pages the person administers, which is what makes adding a Page
   * weeks after the initial connect an ordinary authenticated call instead of
   * another trip through Facebook (decision D8).
   *
   * Meta expires these around 60 days. That expiry is a first-class UI state --
   * it must never render as "you have no Pages", which reads as data loss.
   *
   * Deleted on disconnect-all: holding a live credential for a customer who
   * believes they disconnected is not defensible.
   */
  metaUserTokenEncrypted?: string
  calComConnection?: CalComConnection
  notificationPreferences?: NotificationPreferences
  createdAt: string
  updatedAt: string
}

// Which channels fire when a lead arrives or a conversation is handed off.
//
// WHY THIS EXISTS
//   Before push, a lead produced one alert. With push it produces two, and a
//   handoff produces up to three (WhatsApp + email fallback + push). Alert
//   fatigue is the standard reason people mute an app, and a muted app is a
//   dead app -- so the client gets a switch instead of a heuristic.
//
// OPTIONAL, AND ABSENT MEANS ALL ON. Every existing client predates this field.
// Defaulting to "on" means the rollout changes nobody's behaviour on the day it
// deploys, and a client who never opens Settings keeps exactly what they have.
export interface NotificationPreferences {
  // Push to registered mobile devices.
  push: boolean
  // The WhatsApp template to the client's notificationNumber.
  whatsapp: boolean
  // The email fallback. Turning this off means a failed WhatsApp send reaches
  // NOBODY unless push is on, which the UI has to say out loud.
  email: boolean
}

// Absent, or partially absent, means on. Written as a function rather than a
// spread default so a stored `{push:false}` cannot accidentally re-enable push
// through an object spread ordering mistake.
export function resolveNotificationPreferences(
  stored: NotificationPreferences | undefined
): NotificationPreferences {
  return {
    push: stored?.push ?? true,
    whatsapp: stored?.whatsapp ?? true,
    email: stored?.email ?? true,
  }
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

// One question on a Meta Lead Ads form, as Meta itself describes it.
//
// `type` is the authoritative answer to "what is this question asking for" --
// EMAIL, PHONE, FULL_NAME and so on -- and it is what makes mapping a Meta lead
// a lookup rather than a guess. Verified against the live Graph API on
// 2026-08-26: GET /{form_id}?fields=questions{key,label,type}.
//
// `label` is the human text the client typed in Ads Manager ("WhatsApp Number"),
// which the webhook payload does NOT carry -- it gives only the slugified key.
// That makes the label the better input for the keyword fallback.
export interface MetaFormQuestion {
  key: string
  label?: string
  type?: string
}

export interface WebhookEvent {
  eventId: string
  provider: string
  eventType: string
  processedAt: string
  expiresAt: number
  // Present only on the bounded-retry COUNTER rows written by
  // countWebhookAttempt, which live under their own key namespace. A row with
  // this field is a "still being retried" marker, never a "processed" one.
  attempts?: number
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
  // is an optional steer, not a hard template.
  messageHint?: string
  // The approved WhatsApp template to fall back to when the 24h session window
  // is CLOSED, which is the normal case for any step that fires on a schedule
  // rather than straight after a reply. Free text is still preferred while the
  // window is open: it is free, and it reads like a person rather than a form.
  //
  // Per-step rather than only on AgentChannelConfig because one journey
  // legitimately needs different templates at different points -- a greeting,
  // a nudge and a booking confirmation are three different approved templates.
  // AgentChannelConfig.messageTemplateName remains the agent-wide default for
  // steps that do not name one.
  whatsappTemplateName?: string
  // Values for the template's {{n}} placeholders, in order. A value may be a
  // literal, or a `{{lead.field}}` reference resolved against the lead at send
  // time -- see resolveTemplateParams in journey-executor-service.ts.
  whatsappTemplateParams?: string[]
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
  // Constrained to the platform-wide capability palette by the type, and to
  // this bundle's own subset of it by journey-service.ts's
  // validateToolboxCoverage() -- the type can't express the second check
  // because the toolbox is per-bundle, not known at this type's definition.
  toolName: McpCapability
  toolInput?: Record<string, unknown>
  next?: string
}

export interface HumanHandoffStep extends JourneyStepBase {
  type: 'human_handoff'
  reason?: string
}

// The step that makes a journey a conversation rather than a drip campaign.
// Every other step type is outbound or a timer: send, sleep, poll, branch, call
// a tool. None of them can consume an inbound reply, so before this existed the
// engine could talk AT a lead but never WITH one.
//
// Compiles to Step Functions' task-token callback pattern: the execution pauses
// (costing nothing while idle) until the inbound WhatsApp handler resolves the
// waiting token and calls SendTaskSuccess with what the lead actually said.
export interface AwaitReplyStep extends JourneyStepBase {
  type: 'await_reply'
  // Optional steer for the message that solicits the reply. Not the message
  // itself -- use a send_message step before this one for that.
  promptHint?: string
  // Where to go once the lead replies. The reply text is available downstream
  // at $.lastResult.message.
  next: string
  // Where to go when they don't.
  //
  // The timeout is the WhatsApp 24h session window, not a tuned number, because
  // that is the boundary where the agent's OPTIONS change: past it, free-text
  // sending stops being permitted and only a pre-approved template can reach
  // them. Any other duration would be arbitrary; this one is the real
  // constraint, so the branch always has a concrete reason to exist. Once
  // template sending is approved, onNoReply gains "send a re-engagement
  // template", and a reply to that reopens the window -- an addition to this
  // branch rather than a change to the policy.
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

// A journey execution parked on an await_reply step, keyed by the lead so the
// inbound message handler -- which knows only who messaged -- can find it.
//
// One pending reply per lead. Phase 1 permits exactly one active bundle per
// (Agent, trigger) and only the lead_captured trigger, so a lead cannot be
// awaiting two journeys at once; the claim is conditional rather than an
// overwrite so that if that ever changes it surfaces as a conflict instead of
// silently stranding the first journey until its timeout.
export interface PendingJourneyReply {
  leadId: string
  // Opaque Step Functions callback token. Possession of it is what allows an
  // execution to be resumed, which is why resumption is bound to a token we
  // stored ourselves rather than to anything the caller supplies.
  taskToken: string
  bundleId: string
  stepId: string
  botId: string
  clientId: string
  createdAt: string
  // Unix seconds, for DynamoDB TTL. Set past the Step Functions timeout so the
  // row outlives the execution it belongs to and cleanup is automatic -- a
  // timed-out execution has no callback to tell us to delete it.
  expiresAt: number
}

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
  // The kill switch for composed replies: true puts this Agent back to the
  // scripted behaviour it had before it could answer questions. Its journeys
  // still run and still send their authored messageHint lines; what stops is
  // the model writing words of its own.
  //
  // Optional and defaulting to OFF (i.e. composition on), because every Agent
  // that exists today composes and a required field would have flipped them
  // all to scripted on deploy.
  //
  // This exists so a client whose agent says something wrong can be stopped in
  // seconds from the dashboard. The alternative is a code deploy, which is not
  // a rollback plan when a live agent is talking to real leads.
  scriptedOnly?: boolean
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

// The bounded MCP capability palette. Engineering-controlled: clients pick
// FROM this set, they never extend it (the approved design's "bounded
// toolbox, NOT full autonomy"). A union rather than `string` so a bad
// capability name fails at compile time in the template seeds, and at the
// route boundary for untrusted client input -- previously `string[]` let
// `mcpToolbox: ['banana']` plus a step calling `banana` pass every check,
// publish cleanly, and only fail mid-journey on a live lead at
// journey-executor-service.ts's dispatch default.
//
// lib/mcp-capabilities.ts derives the runtime array from this union via an
// exhaustiveness-checked Record, so adding a member here without adding it
// there is a compile error. Keep that the only runtime list.
export type McpCapability = 'booking' | 'reminder' | 'quotation' | 'brochure'

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
  mcpToolbox: McpCapability[]
  channelConfig: Partial<Record<JourneyChannel, AgentChannelConfig>>
}

// Row in journey_trigger_claims: which bundle currently owns a given trigger
// for a given Agent. Exactly one bundle may hold a trigger, claimed atomically
// at publish -- without it, two published bundles on 'lead_captured' would BOTH
// ignite, and a real buyer would get two copies of every message from two
// copies of the agent, possibly booking two site visits.
export interface JourneyTriggerClaim {
  // `agent:<agentId>#<triggerType>`, or `bot:<botId>#<triggerType>` for a bot
  // not yet wrapped in an Agent. Prefixed so the two id namespaces can never be
  // confused for one another.
  claimKey: string
  bundleId: string
  botId: string
  clientId: string
  claimedAt: string
}

// 'paused' is a published bundle whose trigger claim has been released: it
// still holds its compiled state machine (so resuming is a republish, not a
// rebuild) but no new lead ignites into it. Every consumer gates on
// `status === 'published'`, so paused reads as not-live everywhere without
// any of them needing to know the value exists.
export type JourneyBundleStatus = 'draft' | 'published' | 'paused'

// Fused Journey + Agent + toolbox, per the 2026-07-29 architecture session's
// Decision #2: a prebuilt "agent" (lead-qualification, appointment-booking,
// etc.) is one editable unit, not a decoupled Journey/Agent composition.
// This is what gets stored, listed, and cloned when a client picks a
// template from the prebuilt library.
// The sales plan an operator authored, from which `journey` and `agent` were
// generated. Stored, not executed.
//
// WHY IT HAS TO BE STORED
//   Most of a plan round-trips through the generated steps -- timings, retry
//   budgets, message copy can all be read back off the journey. Four fields
//   cannot, because they leave no trace in the steps at all: goal, learn, never
//   and escalateWhen are folded into the agent's systemPrompt as prose and
//   cannot be parsed back out of it without guessing.
//
//   Before this field existed those four silently reset to defaults on every
//   load. That is not merely lost typing: `never` IS the agent's guardrail
//   list, so opening a journey and saving it would quietly rewrite a client's
//   safety rules back to ours.
//
// AUTHORING STATE, NOT TRUTH
//   `journey` and `agent` remain what actually executes. This is the input they
//   were compiled from. They can drift if a bundle is written by anything other
//   than the plan builder, which is why the builder falls back to inferring a
//   plan from the steps when this is absent, and refuses when the shape cannot
//   be represented.
export interface JourneyPlan {
  version: 1
  goal: string
  agentName: string
  tone?: string
  learn: string[]
  never: string[]
  escalateWhen: string[]
  messages: {
    greet: string
    offer: string
    confirm: string
  }
  followUp: {
    waitDays: number
    maxNudges: number
    nudgeMessage: string
  }
  booking: {
    enabled: boolean
    recheckDays: number
    maxRechecks: number
  }
  handoff: {
    enabled: boolean
    reason: string
  }
}

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
  // Optional and additive, like agentId above: a bundle authored before the
  // plan builder, or by any other path, simply has none and the builder infers
  // one from the steps instead.
  plan?: JourneyPlan
  status: JourneyBundleStatus
  // The mutable state machine, created on first publish and updated on every
  // republish. Absent until a bundle has been published at least once.
  compiledStateMachineArn?: string
  // The IMMUTABLE published version, and what ignition must start executions
  // against. Starting against compiledStateMachineArn instead would make the
  // version below a lie: state machine updates are eventually consistent, so an
  // execution begun moments after a republish can still run the previous
  // definition while our record labels it as the new one.
  compiledStateMachineVersionArn?: string
  // Increments on every successful publish. Threaded into the execution input
  // so the lead timeline can say "this lead is running v3, you are editing v4"
  // -- without it, correct Step Functions behaviour (in-flight executions keep
  // the definition they started with) is indistinguishable to a client from
  // their edit being ignored for weeks.
  publishedVersion?: number
  createdAt: string
  updatedAt: string
}

// -------------------------------------------------------------------------
// Lead identity for the journey layer.
//
// Three lead tables exist with three different parent keys, and none of the
// non-chat ones carry a botId:
//
//   leads       partition botId    sort createdAt   (+ leadId-index GSI)
//   form_leads  partition formId   sort leadId
//   meta_leads  partition pageId   sort leadId
//
// The journey machinery is botId-addressed throughout (JourneyBundle, the
// executor event, AppointmentRequest, Pinecone scoping), so before this type
// existed a Meta lead resolved to null through every journey step: the
// journey ran to completion and did nothing, silently.
//
// LeadRef is what makes a lead readable regardless of source, and it is
// deliberately NOT interchangeable with botId. Two different ideas got
// conflated before:
//   - leadRef  : WHERE the lead record lives (its table and parent key)
//   - botId    : which bot the Agent operates as -- Pinecone namespace,
//                bot config, AppointmentRequest partition
// A Meta lead has a pageId for the first and an Agent-derived botId for the
// second. Collapsing them is what made "just stamp a botId on MetaLead"
// look reasonable and would have mis-scoped RAG retrieval (rule #5).
// -------------------------------------------------------------------------

export type LeadSource = 'chat' | 'form' | 'meta'

// Why a lead sits where it does in the urgency-ordered inbox. Server-computed
// and sent on the wire so a client can explain the queue without recomputing
// the rule -- an urgency-ordered list with no visible reason reads as broken.
export type UrgencyTier = 'overdue' | 'untouched' | 'scheduled' | 'in_progress' | 'closed'

// One page of the unified inbox. See lead-inbox-service.ts for what pagination
// here does and does not fix.
export interface UnifiedInboxPage {
  leads: UnifiedLead[]
  total: number
  // Absent on the last page.
  nextCursor?: string
}

export type LeadRef =
  | { source: 'chat'; botId: string; leadId: string }
  | { source: 'form'; formId: string; leadId: string }
  | { source: 'meta'; pageId: string; leadId: string }

// ---------------------------------------------------------------------------
// Mobile app: device registry and readiness. Added 2026-08-26.
// ---------------------------------------------------------------------------

export type DevicePlatform = 'android' | 'ios'

// One row per install, in the device_tokens table (PK clientId, SK deviceId).
// No GSI: the only access pattern is "every device belonging to this client",
// which is a Query on the partition key. Same reasoning as
// meta_deletion_requests -- there is no second access pattern to serve.
export interface DeviceToken {
  clientId: string
  // App-generated UUID, stable for the life of an install. NOT the Expo token:
  // that rotates, and a rotating value cannot be a sort key without orphaning
  // the old row on every rotation.
  deviceId: string
  expoPushToken: string
  platform: DevicePlatform
  appVersion: string
  registeredAt: string
  // Refreshed on every app foreground. Used to tell a live install from one
  // that was uninstalled without ever calling DELETE /api/devices/:deviceId.
  lastSeenAt: string
  // Incremented when Expo reports the token dead. The row is deleted at 1, so
  // in practice this is only ever 0 -- it exists so a future soft-retry policy
  // has somewhere to count, without a migration.
  failureCount: number
}

// What the mobile app is allowed to do, as declared by the server.
//
// THIS IS THE RUNTIME HALF OF THE WEB/MOBILE CONTRACT. An app build cannot be
// force-updated -- a release leaves old builds running on real phones for
// months -- so the app must not hardcode its own feature list. It renders its
// action bar FROM this array, which means a build that does not recognise a
// capability simply shows no control for it instead of calling an endpoint it
// cannot handle. That is what lets a new server-side feature ship without
// waiting for every install to update.
//
// A union rather than string[] on purpose: a typo here should be a compile
// error, not a button that silently never appears.
//
// See vyostra-mobile docs/designs/web-mobile-contract.md.
export type Capability =
  | 'lead.read'      // GET /api/leads/inbox, GET /api/leads/detail
  | 'lead.state'     // PATCH /api/leads/state
  | 'lead.note'      // POST /api/leads/notes
  | 'lead.timeline'  // GET /api/leads/events   (phase 2)

// Everything the app needs on launch, in one call: whether to show the inbox or
// the "finish setting up on the web" gate, and what it may do once inside.
//
// Readiness is deliberately not derived client-side from an empty lead list: the
// app must be able to tell "you have not set up a bot yet" from "you are set up
// and no leads have arrived", and those look identical from the inbox alone.
//
// Named bootstrap rather than readiness because it answers two questions.
export interface AppBootstrap {
  ready: boolean
  reason?: 'no_bot'
  // Empty when ready is false: an app that has not finished setup can do
  // nothing, and sending a capability list it cannot act on invites a UI that
  // renders buttons behind the gate.
  capabilities: Capability[]
}

// Normalized read view across the three tables. Only the fields the journey
// layer actually acts on -- delivery needs phone, Cal.com needs name/email,
// the qualification prompt uses the property fields. Deliberately not a union
// of the three record types: callers should not branch on source to read a
// phone number.
export interface JourneyLead {
  leadId: string
  clientId: string
  source: LeadSource
  name?: string
  phone?: string
  email?: string
  propertyInterest?: string
  budgetRange?: string
  sourceUrl?: string
}

// ---------------------------------------------------------------------------
// Lead state (CRM)
//
// The three lead tables have three different partition keys (leads/botId,
// form_leads/formId, meta_leads/pageId), so per-lead working state cannot be
// added as attributes on the records themselves without a different write path
// per source. It lives in its own leadId-keyed table instead -- the same shape
// whatsapp_inbound_activity and journey_pending_replies already use for
// exactly this reason.
//
// This is also what JourneyStep.recheckField ('replied' | 'lead_score' |
// 'appointment_booked') has been branching on: those facts had nowhere to live
// before this table, so a recheck could never observe them.
// ---------------------------------------------------------------------------

// Four statuses on purpose. A longer pipeline is a different product with a
// different buyer. `closed` carries an outcome.
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'closed'

// Archiving is a marker on lead_state, NOT a fifth LeadStatus. The four
// statuses are a queue position ("where is this lead in my process"), and
// "I never want to see this" is not a position in that queue -- folding it in
// would make every status filter carry an implicit "and not archived", which is
// how a lead silently vanishes from a count someone is trusting.
//
// Reversible by construction: clearing the timestamp restores the lead exactly,
// because nothing else was touched. That is the whole difference between this
// and eraseLead, which is not reversible at all.
export interface LeadArchiveMarker {
  archivedAt?: string
  archivedBy?: string
}

export type LeadOutcome = 'won' | 'lost' | 'unreachable'

export interface LeadNote {
  noteId: string
  body: string
  // Cognito sub of whoever wrote it. Kept even for single-operator accounts so
  // team assignment later does not need a backfill.
  authorId: string
  createdAt: string
}

export interface LeadState {
  leadId: string
  clientId: string
  status: LeadStatus
  // Only meaningful when status is 'closed'; cleared when a lead is reopened.
  outcome?: LeadOutcome
  ownerId?: string
  // Drives the queue ordering. Overdue first, which is the whole point of the
  // inbox being a queue rather than a recency-sorted table.
  nextActionAt?: string
  lastTouchedAt?: string
  // 0-100. Written by the qualification prompt, read by JourneyStep recheck.
  leadScore?: number
  replied?: boolean
  appointmentBooked?: boolean
  notes: LeadNote[]
  createdAt: string
  updatedAt: string
  // Set when an operator archives the lead: hidden from the inbox, everything
  // else untouched. Absent on every lead that has never been archived, so the
  // filter is "has no archivedAt", never a boolean that needs backfilling.
  archivedAt?: string
  archivedBy?: string
}

// What the unified inbox returns: the normalized cross-source lead fields
// (JourneyLead) plus where the record lives, when it arrived, and its working
// state. State is optional because a lead that has never been touched has no
// lead_state row yet -- absence means 'new', and we do not write a row on
// capture just to say so.
export interface UnifiedLead extends JourneyLead {
  leadRef: LeadRef
  createdAt: string
  state: LeadState | null
  // Why this lead sits where it does. Computed by the same code that decides
  // the order (lead-inbox-service.ts) and stamped after the sort, so what a
  // client renders is provably the value that produced the position.
  urgencyTier: UrgencyTier
}

// One lead, opened. Everything UnifiedLead carries plus the raw material a
// human needs to decide what to say next: the conversation for a chat lead, the
// submitted answers for a form or Meta lead. Kept separate from UnifiedLead so
// the inbox list does not ship every transcript it will never render.
export interface UnifiedLeadDetail extends UnifiedLead {
  chatTranscript?: string
  // Already parsed. The three sources store this differently (a JSON string on
  // FormLead and MetaLead, nothing at all on Lead) and the UI should not care.
  customFields?: Record<string, string>
}

// Everything a journey execution needs to act on a lead, resolved once at
// ignition and then carried through the execution rather than re-derived per
// step.
export interface LeadAgentContext {
  leadRef: LeadRef
  leadId: string
  clientId: string
  agentId: string
  // The Agent's web-channel binding. Pinecone scoping, bot config lookups and
  // AppointmentRequest partitioning all use this -- never leadRef's parent key.
  botId: string
}

// Why a lead could not be attached to an Agent. Every value is a real,
// expected state rather than an error: a client who hasn't created an Agent
// yet, or has two and hasn't said which handles this source, is misconfigured,
// not broken. Ignition records the reason on the lead so the miss is visible
// instead of silent -- an unfollowed-up lead is the exact failure this product
// exists to prevent.
export type LeadResolutionFailureReason =
  | 'lead_not_found'
  | 'no_agent'
  | 'ambiguous_agent'
  | 'agent_has_no_web_binding'

export type LeadResolution =
  | { resolved: true; context: LeadAgentContext }
  | { resolved: false; reason: LeadResolutionFailureReason }

// A prebuilt agent, authored by us and shipped in the repo (see
// lib/journey-templates/). Deliberately NOT a stored JourneyBundle: templates
// live in code so "admin-authored only" is enforced by who can commit and
// deploy rather than by an auth check, and so every template's ASL is compiled
// and validated in CI instead of failing at a client's first publish. Cloning
// one produces an ordinary client-owned bundle carrying sourceTemplateId.
export interface JourneyTemplate {
  templateId: string
  name: string
  description: string
  // Which vertical this was written for. Real estate is the only one today;
  // the field exists so the picker can group templates once there are more,
  // not as speculative generality -- the library is the product surface.
  vertical: 'real_estate'
  // Same shapes a client-authored bundle uses, minus the ownership fields
  // (botId/clientId), which are stamped at clone time.
  journey: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent: AgentConfig
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
  // await_reply only: the ceiling on how long an execution may sit paused
  // waiting for the lead. See AwaitReplyStep for why it is the WhatsApp session
  // window rather than a tuned number.
  TimeoutSeconds?: number
  // Catch needs its own ResultPath for the same reason every Task does: without
  // one, the caught error REPLACES the execution context and the recovery
  // branch's own Parameters resolve against the error object.
  Catch?: { ErrorEquals: string[]; Next: string; ResultPath?: string }[]
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

// Terminates the execution as FAILED. Reached only after the terminal-event
// Task has recorded the failure, so the audit row exists and Step Functions'
// own execution status still reports failure rather than a misleading success.
export interface AslFailState {
  Type: 'Fail'
  Error?: string
  Cause?: string
}

export type AslState = AslWaitState | AslTaskState | AslChoiceState | AslSucceedState | AslFailState

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
  // Which table the lead lives in. botId alone cannot say: it identifies the
  // BOT, and a form or Meta lead is keyed by formId/pageId in a different
  // table entirely. Without these, executeScheduledAction could only ever
  // reconstruct a chat LeadRef, so a reminder on a form or Meta lead resolved
  // to nothing and nobody was told.
  //
  // Optional, and read through toLeadRef, whose chat fallback is what keeps
  // rows written before this field resolving exactly as they did.
  leadSource?: LeadSource
  leadParentId?: string
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

export type JourneyExecutorOperation =
  | 'send_message'
  | 'tool_call'
  | 'wait_and_recheck_check'
  | 'human_handoff'
  | 'await_reply'
  // Synthetic: emitted by the compiler's terminal states, never authored as a
  // JourneyStep. Its only job is to write the journey_ended event.
  | 'journey_ended'
  // Synthetic: emitted ahead of every condition step's Choice state. Resolves
  // the lead's replied / lead_score / appointment_booked into the execution
  // state so the Choice reads a path that is guaranteed to exist.
  | 'resolve_condition'

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
  // Which table the lead lives in, and its parent key there. Needed because
  // botId only locates a chat lead -- a Meta lead is keyed by pageId and a form
  // lead by formId. Optional so an execution started before these were added to
  // the passthrough still deserializes; callers fall back to treating the lead
  // as a chat lead under botId.
  leadSource?: LeadSource
  leadParentId?: string
  // The published bundle version this execution was started against.
  journeyVersion?: number
  // await_reply only. Step Functions' callback token for this task attempt,
  // supplied via $$.Task.Token. Whoever holds it can resume the execution, so
  // it is stored against the lead and never echoed back to a caller.
  taskToken?: string
  promptHint?: string
  stepId?: string
  messageHint?: string
  // journey_ended only. Static in the compiled Parameters, one terminal state
  // per outcome, so the executor never has to infer why the journey stopped.
  outcome?: JourneyOutcome
  // journey_ended on the failure path. The WHOLE caught error object, never a
  // JSONPath into it: a path to a missing Cause throws States.Runtime, which
  // would turn a failing journey into a journey that fails while trying to
  // record that it failed.
  journeyError?: Record<string, unknown>
  // journey_ended only, from $$.Execution.Id. Lets a dashboard row link to the
  // real Step Functions execution instead of making an operator hunt for it.
  executionArn?: string
  // The previous Task's result, merged in at $.lastResult by the compiler. After
  // an await_reply resume this carries what the lead said and, when an agent turn
  // ran, its grounded answer. Passed as a whole object because a JSONPath into a
  // key that may not exist throws States.Runtime at runtime.
  lastResult?: {
    replied?: boolean
    message?: string
    repliedAt?: string
    // The agent's grounded answer to the message that resumed this execution.
    // Takes precedence over messageHint on a free-text send. Absent when no
    // agent turn ran (the Gupshup path, or a step reached without an inbound
    // reply).
    composedReply?: string
  }
  // Carried through from SendMessageStep by the compiler so the executor can
  // fall back to a template when the session window is shut.
  whatsappTemplateName?: string
  whatsappTemplateParams?: string[]
  // Typed, but this event arrives from Step Functions rather than from our own
  // call site, so journey-executor-service.ts still keeps a runtime default
  // branch -- the type describes what a correctly compiled Journey sends, not
  // what the runtime is guaranteed to receive.
  toolName?: McpCapability
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

// A data deletion request that arrived on Meta's mandated callback.
//
// Deliberately NOT a record of a deletion that happened. Meta's signed request
// carries only an app-scoped user_id, and nothing we store from Lead Ads
// (field_data is name/email/phone) carries that id -- so there is no key to
// correlate the request to a lead, and no automated purge is possible. See
// TODOS.md, "Meta data deletion callback fabricates success". This row exists
// so the request is durable and a human can act on it inside the 30 days the
// status page promises, instead of the old behaviour: a confirmation code
// invented from Date.now() and thrown away.
export interface MetaDeletionRequest {
  // Also the confirmation code handed back to Meta and shown to the user.
  // Random, not sequential -- it is the only credential on the public status
  // lookup, so it must not be guessable from another code or from a timestamp.
  confirmationCode: string
  // App-scoped user id from the signed request. Useless for correlation today,
  // stored because it is the only identifier Meta gives us and a future
  // correlation design would need it.
  metaUserId: string
  status: 'received' | 'completed'
  requestedAt: string
  // false when the ops notification email could not be sent (or SES is not
  // configured). Same signal as ContactMessage.notified: the request is stored
  // either way, but this flags rows nobody was pinged about.
  notified: boolean
}

// What the public status endpoint returns. Deliberately narrower than the
// stored record: no metaUserId, since the confirmation code travels in a URL
// and may be shared or logged.
export interface MetaDeletionRequestStatus {
  confirmationCode: string
  status: MetaDeletionRequest['status']
  requestedAt: string
}
