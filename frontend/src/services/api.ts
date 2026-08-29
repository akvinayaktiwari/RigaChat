import type {
  ApiResponse,
  AppointmentRequest,
  BotConfig,
  CalComConnection,
  CalComEventType,
  ClientRecord,
  ConfirmKBUploadInput,
  ConfirmVoiceKBUploadInput,
  ConnectMetaWhatsAppInput,
  ConnectWhatsAppInput,
  CRMConnection,
  CreateBotInput,
  CreateFormInput,
  CreateKBEntryInput,
  CreateVoiceAgentInput,
  FormConfig,
  FormLead,
  AgentConfig,
  JourneyTemplate,
  IndexingJob,
  JourneyBundle,
  JourneyDefinition,
  KBFileType,
  KBUploadUrlResult,
  KnowledgeBaseEntry,
  Lead,
  LeadRef,
  LinkedDevice,
  NotificationPreferences,
  MetaDeletionRequestStatus,
  LeadState,
  LeadStatePatch,
  MetaConnection,
  MetaDirectWhatsAppConnection,
  MetaLead,
  PaymentRecord,
  ResyncResult,
  ScheduleCadence,
  ScheduledAction,
  ScheduledActionType,
  SetupBotResult,
  StartIndexingResult,
  SubmitContactMessageInput,
  SubmitContactMessageResult,
  SubscriptionSummary,
  UnifiedInboxPage,
  UnifiedLead,
  UnifiedLeadDetail,
  UpdateKBInput,
  UpdateVoiceAgentInput,
  VoiceAgent,
  VoiceKnowledgeBaseEntry,
  VoiceUsageSummary,
  WhatsAppConnection,
  BotWhatsAppStatus,
  LeadEvent,
} from '../types/index'
import { leadRefToQuery } from '../lib/lead-ref'
import type { JourneyPlan } from '../lib/journey-plan'

const BASE_URL = import.meta.env.VITE_API_URL

// Where OAuth *browser navigations* go, which is not always where `fetch` goes.
//
// An OAuth connect route sets a CSRF state cookie and the matching callback
// reads it back. That cookie is host-only -- setCookie in
// backend/src/routes/integration-routes.ts passes no `domain` -- so the browser
// returns it to the exact hostname that set it and nowhere else. **The connect
// route and the provider's configured redirect URI must therefore be the same
// origin**, or the callback sees no cookie and fails with invalid_state.
//
// They drifted apart for Meta: BASE_URL is the raw Lambda Function URL, while
// META_REDIRECT_URI is https://vyostra.com/... (the two are different
// registrable domains, so no cookie is shared). Every connect attempt died on
// "That connection link expired", which stayed invisible while Facebook Login
// was blocked upstream and nothing ever reached the callback.
//
// Deliberately NOT solved by pointing VITE_API_URL at vyostra.com: CloudFront's
// distribution-wide CustomErrorResponses map 403 and 404 onto /index.html with
// HTTP 200, which would turn every API error into an HTML success for `fetch`.
// Only the top-level navigations move; see TODOS.md for the proper fix.
//
// Falls back to BASE_URL when unset, which is correct for local dev (no
// CloudFront in front of the API) and for any provider whose redirect URI
// already points at the Lambda host -- Zoho's does, which is why it works and
// Meta's did not.
const OAUTH_BASE_URL = import.meta.env.VITE_OAUTH_BASE_URL || BASE_URL

let authToken: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

// Session recovery, registered by AuthProvider (hooks/useAuth.ts).
//
// Cognito issues a 60-minute ID token and a 5-day refresh token, but the
// refresh token was discarded at sign-in and the ID token was never renewed.
// useAuth only checks `exp` when restoring a session on page load, so a tab
// left open past the hour kept sending a dead token forever: every request
// 401'd, the user was never signed out or redirected, and the UI just showed
// unexplained failures. Observed live on 2026-08-22 with a token eight hours
// past expiry still in use.
//
// Kept as an injected handler rather than importing useAuth here, because
// useAuth already imports this module -- wiring it the other way would be a
// cycle.
type TokenRefresher = () => Promise<string | null>

let refreshHandler: TokenRefresher | null = null
let inFlightRefresh: Promise<string | null> | null = null

export function setTokenRefreshHandler(handler: TokenRefresher | null): void {
  refreshHandler = handler
}

// One refresh at a time. A page typically fires several requests at once, so
// without this the first expiry would trigger a burst of parallel refreshes,
// each invalidating the last and most of them failing.
async function refreshOnce(): Promise<string | null> {
  if (!refreshHandler) return null

  if (!inFlightRefresh) {
    inFlightRefresh = refreshHandler().finally(() => {
      inFlightRefresh = null
    })
  }

  return await inFlightRefresh
}

export async function apiClient<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<ApiResponse<T>> {
  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  let response = await send(authToken)

  // A 401 on a request that carried a token means the token expired, not that
  // the caller is anonymous -- so try once to renew it and replay. Requests
  // sent without a token are genuinely unauthenticated and are left alone.
  // Retried at most once: if the replay also 401s, the refresh token is gone
  // too and refreshHandler signs the user out.
  if (response.status === 401 && authToken) {
    const renewed = await refreshOnce()
    if (renewed) {
      response = await send(renewed)
    }
  }

  // 204 No Content has no body to parse — response.json() throws on an
  // empty body, which would otherwise surface as a false-negative error
  // even though the request succeeded.
  if (response.status === 204) {
    return { success: true } as ApiResponse<T>
  }

  const parsed = (await response.json()) as ApiResponse<T>

  if (!response.ok && !parsed.error) {
    throw new Error(`API request to ${path} failed with status ${response.status}`)
  }

  return parsed
}

// Bot API

export function setupBot(data: CreateBotInput): Promise<ApiResponse<SetupBotResult>> {
  return apiClient<SetupBotResult>('/api/bots/setup', 'POST', data)
}

export function getMyBots(): Promise<ApiResponse<BotConfig[]>> {
  return apiClient<BotConfig[]>('/api/bots/my-bots')
}

export function getBotById(botId: string): Promise<ApiResponse<BotConfig>> {
  return apiClient<BotConfig>(`/api/bots/${botId}`)
}

// The WhatsApp channel for one chatbot. Bot-scoped, not agent-scoped: the
// Agent identity layer is deliberately not surfaced here (see the naming
// collision in TODOS.md).
export function getBotWhatsAppStatus(botId: string): Promise<ApiResponse<BotWhatsAppStatus>> {
  return apiClient<BotWhatsAppStatus>(`/api/bots/${botId}/whatsapp`)
}

export function enableBotWhatsApp(botId: string): Promise<ApiResponse<BotWhatsAppStatus>> {
  return apiClient<BotWhatsAppStatus>(`/api/bots/${botId}/whatsapp`, 'POST')
}

export function disableBotWhatsApp(botId: string): Promise<ApiResponse<BotWhatsAppStatus>> {
  return apiClient<BotWhatsAppStatus>(`/api/bots/${botId}/whatsapp`, 'DELETE')
}

export function updateBot(
  botId: string,
  updates: Partial<BotConfig>
): Promise<ApiResponse<BotConfig>> {
  return apiClient<BotConfig>(`/api/bots/${botId}`, 'PATCH', updates)
}

export function deleteBot(botId: string): Promise<ApiResponse<{ message: string }>> {
  return apiClient<{ message: string }>(`/api/bots/${botId}`, 'DELETE')
}

export function resyncBot(botId: string, websiteUrl: string): Promise<ApiResponse<ResyncResult>> {
  return apiClient<ResyncResult>(`/api/bots/${botId}/resync`, 'POST', { websiteUrl })
}

export function startBotIndexing(botId: string, url: string): Promise<ApiResponse<StartIndexingResult>> {
  return apiClient<StartIndexingResult>(`/api/bots/${botId}/index`, 'POST', { url })
}

export function confirmBotIndexing(
  botId: string,
  jobId: string
): Promise<ApiResponse<{ status: 'queued'; message: string }>> {
  return apiClient<{ status: 'queued'; message: string }>(`/api/bots/${botId}/confirm-index`, 'POST', { jobId })
}

export function getBotIndexingStatus(botId: string): Promise<ApiResponse<IndexingJob | { status: 'none' }>> {
  return apiClient<IndexingJob | { status: 'none' }>(`/api/bots/${botId}/index-status`)
}

// Lead API

export function getLeadsForBot(botId: string): Promise<ApiResponse<Lead[]>> {
  return apiClient<Lead[]>(`/api/leads/bot/${botId}`)
}

export function getAllLeads(): Promise<ApiResponse<Lead[]>> {
  return apiClient<Lead[]>('/api/leads/all')
}

export function getLeadById(botId: string, leadId: string): Promise<ApiResponse<Lead>> {
  return apiClient<Lead>(`/api/leads/${botId}/${leadId}`)
}

// Unified inbox: chat + form + Meta leads in one list, already ordered by
// urgency server-side (overdue follow-ups first, then untouched oldest-first).
// Do not re-sort by date on the client -- that ordering is the product.
// Returns a PAGE. The web deliberately sends no `limit`, which asks for the
// whole inbox and matches this endpoint's behaviour before it was paginated --
// a default page size would silently truncate the dashboard. Pagination is for
// the mobile app, where the payload over mobile data is what hurts.
export function getLeadInbox(): Promise<ApiResponse<UnifiedInboxPage>> {
  return apiClient<UnifiedInboxPage>('/api/leads/inbox')
}

// The whole LeadRef travels in the query string because this is a GET reached
// by opening a link — see lib/lead-ref.ts for the URL shape.
// The lead's timeline. Same LeadRef-in-query-params shape as the detail call --
// leadRefToQuery, NOT leadRefToSearch, which omits leadId for the detail path.
export function getLeadEvents(leadRef: LeadRef): Promise<ApiResponse<LeadEvent[]>> {
  return apiClient<LeadEvent[]>(`/api/leads/events?${leadRefToQuery(leadRef)}`)
}

export function getUnifiedLeadDetail(leadRef: LeadRef): Promise<ApiResponse<UnifiedLeadDetail>> {
  return apiClient<UnifiedLeadDetail>(`/api/leads/detail?${leadRefToQuery(leadRef)}`)
}

// The leadRef goes in the body because it names the source table AND its parent
// key; a bare leadId is not addressable across three tables.
export function updateLeadState(
  leadRef: LeadRef,
  patch: LeadStatePatch
): Promise<ApiResponse<LeadState>> {
  return apiClient<LeadState>('/api/leads/state', 'PATCH', { leadRef, ...patch })
}

export function addLeadNote(leadRef: LeadRef, body: string): Promise<ApiResponse<LeadState>> {
  return apiClient<LeadState>('/api/leads/notes', 'POST', { leadRef, body })
}

// KB API

export function getKBEntries(botId: string): Promise<ApiResponse<KnowledgeBaseEntry[]>> {
  return apiClient<KnowledgeBaseEntry[]>(`/api/kb/${botId}`)
}

export function addKBEntry(data: CreateKBEntryInput): Promise<ApiResponse<KnowledgeBaseEntry>> {
  return apiClient<KnowledgeBaseEntry>('/api/kb', 'POST', data)
}

export function updateKBEntry(
  botId: string,
  entryId: string,
  data: UpdateKBInput
): Promise<ApiResponse<KnowledgeBaseEntry>> {
  return apiClient<KnowledgeBaseEntry>(`/api/kb/${botId}/${entryId}`, 'PATCH', data)
}

export function deleteKBEntry(
  botId: string,
  entryId: string
): Promise<ApiResponse<{ message: string }>> {
  return apiClient<{ message: string }>(`/api/kb/${botId}/${entryId}`, 'DELETE')
}

export interface GetKBUploadUrlInput {
  botId: string
  filename: string
  fileType: KBFileType
  fileSizeBytes: number
}

export function getKBUploadUrl(data: GetKBUploadUrlInput): Promise<ApiResponse<KBUploadUrlResult>> {
  return apiClient<KBUploadUrlResult>('/api/kb/upload-url', 'POST', data)
}

export function confirmKBUpload(data: ConfirmKBUploadInput): Promise<ApiResponse<KnowledgeBaseEntry>> {
  return apiClient<KnowledgeBaseEntry>('/api/kb/confirm-upload', 'POST', data)
}

// Client API

export function syncMe(): Promise<ApiResponse<ClientRecord>> {
  return apiClient<ClientRecord>('/api/clients/me', 'POST')
}

export function getMe(): Promise<ApiResponse<ClientRecord>> {
  return apiClient<ClientRecord>('/api/clients/me')
}

export function updateProfile(name: string): Promise<ApiResponse<ClientRecord>> {
  return apiClient<ClientRecord>('/api/clients/me', 'PATCH', { name })
}

// Partial on purpose: the UI toggles one channel at a time, so a stale tab
// cannot revert a change made elsewhere by echoing back a whole object.
export function updateNotificationPreferences(
  patch: Partial<NotificationPreferences>
): Promise<ApiResponse<ClientRecord>> {
  return apiClient<ClientRecord>('/api/clients/me/notification-preferences', 'PATCH', patch)
}

export function getLinkedDevices(): Promise<ApiResponse<LinkedDevice[]>> {
  return apiClient<LinkedDevice[]>('/api/devices')
}

// Revoking from the web is the answer to a lost phone. The app's own sign-out
// calls the same route.
export function revokeDevice(deviceId: string): Promise<ApiResponse<null>> {
  return apiClient<null>(`/api/devices/${encodeURIComponent(deviceId)}`, 'DELETE')
}

export function getMySubscription(): Promise<ApiResponse<SubscriptionSummary>> {
  return apiClient<SubscriptionSummary>('/api/clients/me/subscription')
}

export interface SubscribeResult {
  subscriptionId: string
  razorpayKeyId: string
}

export type BillingErrorCode =
  | 'INTERNAL_ACCOUNT_NO_BILLING'
  | 'ALREADY_SUBSCRIBED'
  | 'NO_SUBSCRIPTION_RECORD'
  | 'CONFIG_ERROR'
  | 'PROVIDER_ERROR'

// billing-routes.ts (backend) sends an extra `code` field on BillingError
// responses that apiClient<T>()'s generic ApiResponse<T> doesn't model —
// mirrors the same pattern apiClient() itself uses internally (`as ApiResponse<T>`
// over the parsed JSON) rather than widening the shared ApiResponse<T> type
// for every other call site just for this one route's error shape.
export interface SubscribeResponse extends ApiResponse<SubscribeResult> {
  code?: BillingErrorCode
  // Only populated for ALREADY_SUBSCRIBED — mirrors billing-service.ts's
  // BillingError.details. providerSubscriptionId/razorpayKeyId are present
  // when the existing subscription is pending_activation (resumable);
  // absent for an active (hard-blocked, non-resumable) duplicate.
  details?: { status?: string; providerSubscriptionId?: string | null; razorpayKeyId?: string | null }
}

export function subscribeToTier(tier: 'starter' | 'growth' | 'agency'): Promise<SubscribeResponse> {
  return apiClient<SubscribeResult>('/api/billing/subscribe', 'POST', { tier }) as Promise<SubscribeResponse>
}

export function getPaymentHistory(): Promise<ApiResponse<PaymentRecord[]>> {
  return apiClient<PaymentRecord[]>('/api/billing/payments')
}

// Auth API

export type ConfirmSignupErrorCode = 'INVALID_CODE' | 'CODE_EXPIRED' | 'ALREADY_CONFIRMED' | 'PROVIDER_ERROR'

// Mirrors ConfirmForgotPasswordResponse's pattern below -- auth-routes.ts
// sends the same extra `code` field on ConfirmSignupError responses.
export interface ConfirmSignupResponse extends ApiResponse<null> {
  code?: ConfirmSignupErrorCode
}

export function confirmSignup(email: string, code: string): Promise<ConfirmSignupResponse> {
  return apiClient<null>('/api/auth/confirm-signup', 'POST', { email, code }) as Promise<ConfirmSignupResponse>
}

export interface ResendConfirmationCodeResult {
  message: string
  rateLimited: boolean
}

// resend-confirmation-code's backend contract is a flat { message } on
// 200/429, exactly like forgot-password below -- same reasoning applies for
// bypassing apiClient<T>() here.
export async function resendConfirmationCode(email: string): Promise<ResendConfirmationCodeResult> {
  const response = await fetch(`${BASE_URL}/api/auth/resend-confirmation-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const parsed = (await response.json()) as { message?: string; error?: string }

  if (response.status === 429) {
    return { message: parsed.message ?? 'Too many requests. Please wait a moment and try again.', rateLimited: true }
  }
  if (!response.ok) {
    throw new Error(parsed.error ?? 'Something went wrong. Please try again.')
  }
  return {
    message: parsed.message ?? 'If that email is registered and unverified, a new code has been sent.',
    rateLimited: false,
  }
}

export interface QuickSignupResult {
  token: string
  user: { clientId: string; email: string; name: string; plan: string }
}

export type QuickSignupErrorCode = 'EMAIL_EXISTS' | 'RATE_LIMITED' | 'INVALID_PASSWORD' | 'PROVIDER_ERROR'

// Mirrors SubscribeResponse's pattern above — auth-routes.ts sends the same
// extra `code` field on QuickSignupError responses.
export interface QuickSignupResponse extends ApiResponse<QuickSignupResult> {
  code?: QuickSignupErrorCode
}

export function quickSignup(email: string, password: string): Promise<QuickSignupResponse> {
  return apiClient<QuickSignupResult>('/api/auth/quick-signup', 'POST', { email, password }) as Promise<QuickSignupResponse>
}

export interface ForgotPasswordResult {
  message: string
  rateLimited: boolean
}

// forgot-password's backend contract is a flat { message } on 200/429, not the
// { success, data, error } shape apiClient<T>() assumes -- routing this
// through that helper would either lose the 429 message (its !response.ok
// branch only reads parsed.error) or misreport the success payload's shape.
export async function forgotPassword(email: string): Promise<ForgotPasswordResult> {
  const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  const parsed = (await response.json()) as { message?: string; error?: string }

  if (response.status === 429) {
    return { message: parsed.message ?? 'Too many requests. Please wait a moment and try again.', rateLimited: true }
  }
  if (!response.ok) {
    throw new Error(parsed.error ?? 'Something went wrong. Please try again.')
  }
  return { message: parsed.message ?? 'If that email is registered, a code has been sent.', rateLimited: false }
}

export type ConfirmForgotPasswordErrorCode = 'INVALID_CODE' | 'CODE_EXPIRED' | 'INVALID_PASSWORD' | 'PROVIDER_ERROR'

// Mirrors QuickSignupResponse's pattern above -- auth-routes.ts sends the same
// extra `code` field on ConfirmForgotPasswordError responses.
export interface ConfirmForgotPasswordResponse extends ApiResponse<null> {
  code?: ConfirmForgotPasswordErrorCode
}

export function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<ConfirmForgotPasswordResponse> {
  return apiClient<null>('/api/auth/confirm-forgot-password', 'POST', { email, code, newPassword }) as Promise<ConfirmForgotPasswordResponse>
}

// Form API

export function createForm(data: CreateFormInput): Promise<ApiResponse<FormConfig>> {
  return apiClient<FormConfig>('/api/forms', 'POST', data)
}

export function getMyForms(): Promise<ApiResponse<FormConfig[]>> {
  return apiClient<FormConfig[]>('/api/forms')
}

export function getFormById(formId: string): Promise<ApiResponse<FormConfig>> {
  return apiClient<FormConfig>(`/api/forms/${formId}`)
}

export function updateForm(
  formId: string,
  updates: Partial<FormConfig>
): Promise<ApiResponse<FormConfig>> {
  return apiClient<FormConfig>(`/api/forms/${formId}`, 'PATCH', updates)
}

export function deleteForm(formId: string): Promise<ApiResponse<{ message: string }>> {
  return apiClient<{ message: string }>(`/api/forms/${formId}`, 'DELETE')
}

// Form Leads API

export function getFormLeads(formId: string): Promise<ApiResponse<FormLead[]>> {
  return apiClient<FormLead[]>(`/api/forms/leads/form/${formId}`)
}

export function getAllFormLeads(): Promise<ApiResponse<FormLead[]>> {
  return apiClient<FormLead[]>('/api/forms/leads/all')
}

// CRM Integration API

export function getIntegrationStatus(): Promise<ApiResponse<CRMConnection | null>> {
  return apiClient<CRMConnection | null>('/api/integrations/status')
}

export function disconnectCRM(): Promise<ApiResponse<{ success: boolean }>> {
  return apiClient<{ success: boolean }>('/api/integrations/disconnect', 'DELETE')
}

// GET /zoho/connect is a top-level browser redirect (not a fetch call), so the
// auth token can't travel as an Authorization header — it's passed as a query
// param instead, verified server-side by requireAuthFromQuery.
export function connectZoho(): void {
  if (!authToken) return
  // Stays on BASE_URL deliberately: ZOHO_REDIRECT_URI points at the Lambda
  // host, so connect and callback already share an origin. Moving this would
  // break a working integration -- the rule is that the two must match, not
  // that either one has to be vyostra.com.
  window.location.href = `${BASE_URL}/api/integrations/zoho/connect?token=${encodeURIComponent(authToken)}`
}

// Cal.com Integration API

export function getCalComStatus(): Promise<ApiResponse<CalComConnection | null>> {
  return apiClient<CalComConnection | null>('/api/integrations/cal-com/status')
}

// Same reasoning as connectZoho above -- GET /cal-com/connect is a top-level
// browser redirect (Cal.com's own consent screen), not a fetch call, so the
// auth token can't travel as an Authorization header.
export function connectCalCom(): void {
  if (!authToken) return
  window.location.href = `${BASE_URL}/api/integrations/cal-com/connect?token=${encodeURIComponent(authToken)}`
}

export function disconnectCalCom(): Promise<ApiResponse<{ message: string }>> {
  return apiClient<{ message: string }>('/api/integrations/cal-com/disconnect', 'DELETE')
}

export function getCalComEventTypes(): Promise<ApiResponse<CalComEventType[]>> {
  return apiClient<CalComEventType[]>('/api/integrations/cal-com/event-types')
}

export function setCalComDefaultEventType(eventTypeId: number): Promise<ApiResponse<{ message: string }>> {
  return apiClient<{ message: string }>('/api/integrations/cal-com/default-event-type', 'POST', { eventTypeId })
}

// WhatsApp Integration API

export function getWhatsAppStatus(): Promise<ApiResponse<WhatsAppConnection | null>> {
  return apiClient<WhatsAppConnection | null>('/api/integrations/whatsapp/status')
}

export function connectWhatsApp(data: ConnectWhatsAppInput): Promise<ApiResponse<{ success: boolean }>> {
  return apiClient<{ success: boolean }>('/api/integrations/whatsapp/connect', 'POST', data)
}

export function disconnectWhatsApp(): Promise<ApiResponse<{ success: boolean }>> {
  return apiClient<{ success: boolean }>('/api/integrations/whatsapp/disconnect', 'DELETE')
}

// Meta Direct WhatsApp Integration API

export function getMetaWhatsAppStatus(): Promise<ApiResponse<MetaDirectWhatsAppConnection | null>> {
  return apiClient<MetaDirectWhatsAppConnection | null>('/api/integrations/meta-whatsapp/status')
}

export function connectMetaWhatsApp(data: ConnectMetaWhatsAppInput): Promise<ApiResponse<{ success: boolean }>> {
  return apiClient<{ success: boolean }>('/api/integrations/meta-whatsapp/callback', 'POST', data)
}

// Top-level browser navigation, not a fetch — same pattern and same
// OAUTH_BASE_URL reasoning as connectMeta below: this must leave from the host
// the callback returns to, or the host-only state cookie never comes back.
export function connectMetaWhatsAppOAuth(notificationNumber: string): void {
  if (!authToken) return
  const params = new URLSearchParams({ token: authToken, notificationNumber })
  window.location.href = `${OAUTH_BASE_URL}/api/integrations/meta-whatsapp/connect?${params.toString()}`
}

export function sendMetaWhatsAppTestMessage(toNumber: string): Promise<ApiResponse<{ messageId?: string }>> {
  return apiClient<{ messageId?: string }>('/api/integrations/meta-whatsapp/test-message', 'POST', { toNumber })
}

export function disconnectMetaWhatsApp(): Promise<ApiResponse<{ success: boolean }>> {
  return apiClient<{ success: boolean }>('/api/integrations/meta-whatsapp/disconnect', 'DELETE')
}

// Meta Lead Ads Integration API

export function getMetaStatus(): Promise<ApiResponse<MetaConnection | null>> {
  return apiClient<MetaConnection | null>('/api/integrations/meta/status')
}

// GET /meta/connect is a top-level browser redirect (not a fetch call), same
// reasoning as connectZoho above — the auth token travels as a query param,
// verified server-side by requireAuthFromQuery.
export function connectMeta(): void {
  if (!authToken) return
  // OAUTH_BASE_URL, not BASE_URL: this must originate from the same host as
  // META_REDIRECT_URI or the state cookie never comes back. See the constant.
  window.location.href = `${OAUTH_BASE_URL}/api/integrations/meta/connect?token=${encodeURIComponent(authToken)}`
}

export function disconnectMeta(): Promise<ApiResponse<{ success: boolean }>> {
  return apiClient<{ success: boolean }>('/api/integrations/meta/disconnect', 'DELETE')
}

export function getMetaLeads(): Promise<ApiResponse<MetaLead[]>> {
  return apiClient<MetaLead[]>('/api/integrations/meta/leads')
}

// Voice Agents

export function getVoiceAgents(): Promise<ApiResponse<VoiceAgent[]>> {
  return apiClient<VoiceAgent[]>('/api/voice-agents')
}

export function getVoiceAgent(agentId: string): Promise<ApiResponse<VoiceAgent>> {
  return apiClient<VoiceAgent>(`/api/voice-agents/${agentId}`)
}

export function createVoiceAgent(input: CreateVoiceAgentInput): Promise<ApiResponse<VoiceAgent>> {
  return apiClient<VoiceAgent>('/api/voice-agents', 'POST', input)
}

export function updateVoiceAgent(
  agentId: string,
  input: UpdateVoiceAgentInput
): Promise<ApiResponse<VoiceAgent>> {
  return apiClient<VoiceAgent>(`/api/voice-agents/${agentId}`, 'PATCH', input)
}

export function deleteVoiceAgent(agentId: string): Promise<ApiResponse<null>> {
  return apiClient<null>(`/api/voice-agents/${agentId}`, 'DELETE')
}

export function setupVoiceAgent(agentId: string): Promise<ApiResponse<VoiceAgent>> {
  return apiClient<VoiceAgent>(`/api/voice-agents/${agentId}/setup`, 'POST')
}

export function getVoiceAgentUsage(agentId: string): Promise<ApiResponse<VoiceUsageSummary>> {
  return apiClient<VoiceUsageSummary>(`/api/voice-agents/${agentId}/usage`)
}

export function addVoiceKBEntry(
  agentId: string,
  title: string,
  content: string
): Promise<ApiResponse<VoiceKnowledgeBaseEntry>> {
  return apiClient<VoiceKnowledgeBaseEntry>(`/api/voice-agents/${agentId}/kb`, 'POST', { title, content })
}

export function getVoiceKBEntries(agentId: string): Promise<ApiResponse<VoiceKnowledgeBaseEntry[]>> {
  return apiClient<VoiceKnowledgeBaseEntry[]>(`/api/voice-agents/${agentId}/kb`)
}

export function updateVoiceKBEntry(
  agentId: string,
  entryId: string,
  title: string,
  content: string
): Promise<ApiResponse<VoiceKnowledgeBaseEntry>> {
  return apiClient<VoiceKnowledgeBaseEntry>(`/api/voice-agents/${agentId}/kb/${entryId}`, 'PATCH', {
    title,
    content,
  })
}

export function removeVoiceKBEntry(agentId: string, entryId: string): Promise<ApiResponse<null>> {
  return apiClient<null>(`/api/voice-agents/${agentId}/kb/${entryId}`, 'DELETE')
}

export interface GetVoiceKBUploadUrlInput {
  agentId: string
  filename: string
  fileType: KBFileType
  fileSizeBytes: number
}

export function getVoiceKBUploadUrl(data: GetVoiceKBUploadUrlInput): Promise<ApiResponse<KBUploadUrlResult>> {
  return apiClient<KBUploadUrlResult>(`/api/voice-agents/${data.agentId}/kb/upload-url`, 'POST', data)
}

export function confirmVoiceKBUpload(data: ConfirmVoiceKBUploadInput): Promise<ApiResponse<VoiceKnowledgeBaseEntry>> {
  return apiClient<VoiceKnowledgeBaseEntry>(`/api/voice-agents/${data.agentId}/kb/confirm-upload`, 'POST', data)
}

export function getScheduledActions(): Promise<ApiResponse<ScheduledAction[]>> {
  return apiClient<ScheduledAction[]>('/api/scheduler')
}

export interface CreateScheduledActionInput {
  actionType: ScheduledActionType
  cadence: ScheduleCadence
}

export function createScheduledAction(data: CreateScheduledActionInput): Promise<ApiResponse<ScheduledAction>> {
  return apiClient<ScheduledAction>('/api/scheduler', 'POST', data)
}

export function updateScheduledActionCadence(
  scheduleId: string,
  cadence: ScheduleCadence
): Promise<ApiResponse<ScheduledAction>> {
  return apiClient<ScheduledAction>(`/api/scheduler/${scheduleId}`, 'PATCH', { cadence })
}

export function deleteScheduledAction(scheduleId: string): Promise<ApiResponse<{ message: string }>> {
  return apiClient<{ message: string }>(`/api/scheduler/${scheduleId}`, 'DELETE')
}

export function getAppointmentRequests(botId: string): Promise<ApiResponse<AppointmentRequest[]>> {
  return apiClient<AppointmentRequest[]>(`/api/appointments/${botId}`)
}

// Journey API

export function getJourneyBundles(botId: string): Promise<ApiResponse<JourneyBundle[]>> {
  return apiClient<JourneyBundle[]>(`/api/journeys/${botId}`)
}

export function getJourneyBundle(botId: string, bundleId: string): Promise<ApiResponse<JourneyBundle>> {
  return apiClient<JourneyBundle>(`/api/journeys/${botId}/${bundleId}`)
}

// The prebuilt agent library. Read-only and identical for every client --
// templates are code we author, not per-client rows, so there is nothing to
// scope and nothing a client can edit here. Cloning one produces an ordinary
// bundle they own outright.
export function getJourneyTemplates(): Promise<ApiResponse<JourneyTemplate[]>> {
  return apiClient<JourneyTemplate[]>('/api/journeys/templates')
}

export function createJourneyBundleFromTemplate(
  templateId: string,
  data: { botId: string; name?: string }
): Promise<ApiResponse<JourneyBundle>> {
  return apiClient<JourneyBundle>(`/api/journeys/from-template/${templateId}`, 'POST', data)
}

// No isPrebuiltTemplate: the server owns that flag and always stores false for
// a client-created bundle. Prebuilt agents are code-defined seeds we author;
// sending the field here would imply a client can set it, which it cannot.
export interface CreateJourneyBundleInput {
  botId: string
  name: string
  description?: string
  journey: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent: AgentConfig
  // What the operator authored, which `journey` and `agent` were generated
  // from. Sent so it can be reopened; the server still validates and compiles
  // the journey, so a plan is never trusted to describe what runs.
  plan?: JourneyPlan
}

export function createJourneyBundle(data: CreateJourneyBundleInput): Promise<ApiResponse<JourneyBundle>> {
  return apiClient<JourneyBundle>('/api/journeys', 'POST', data)
}

export interface UpdateJourneyBundleInput {
  name?: string
  description?: string
  journey?: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent?: AgentConfig
  plan?: JourneyPlan
}

export function updateJourneyBundle(
  botId: string,
  bundleId: string,
  data: UpdateJourneyBundleInput
): Promise<ApiResponse<JourneyBundle>> {
  return apiClient<JourneyBundle>(`/api/journeys/${botId}/${bundleId}`, 'PATCH', data)
}

export function deleteJourneyBundle(botId: string, bundleId: string): Promise<ApiResponse<{ message: string }>> {
  return apiClient<{ message: string }>(`/api/journeys/${botId}/${bundleId}`, 'DELETE')
}

export function publishJourneyBundle(botId: string, bundleId: string): Promise<ApiResponse<JourneyBundle>> {
  return apiClient<JourneyBundle>(`/api/journeys/${botId}/${bundleId}/publish`, 'POST')
}

// Takes a live journey off the air: new leads stop entering it, anyone already
// mid-journey finishes. Resuming is publishJourneyBundle again.
export function pauseJourneyBundle(botId: string, bundleId: string): Promise<ApiResponse<JourneyBundle>> {
  return apiClient<JourneyBundle>(`/api/journeys/${botId}/${bundleId}/pause`, 'POST')
}

// Contact API

// Public endpoint — no auth token needed, but apiClient attaches one if the
// visitor happens to already be signed in, which the backend simply ignores.
export function submitContactMessage(
  data: SubmitContactMessageInput
): Promise<ApiResponse<SubmitContactMessageResult>> {
  return apiClient<SubmitContactMessageResult>('/api/contact', 'POST', data)
}

// Public: the person following Meta's deletion link has no Vyostra account.
// The confirmation code in the path is the only credential.
//
// Deliberately NOT apiClient. apiClient resolves a non-ok response to
// { success: false } instead of throwing, which collapses "no such code" (404)
// and "the backend is down" (500) into one indistinguishable value -- and this
// is the one screen where that difference matters, because reporting a real
// deletion request as nonexistent is the worst answer it can give. Reading the
// status code is the only way to tell them apart, so this reads it.
export type MetaDeletionLookup =
  | { outcome: 'found'; request: MetaDeletionRequestStatus }
  | { outcome: 'not_found' }

export async function getMetaDeletionRequestStatus(
  confirmationCode: string
): Promise<MetaDeletionLookup> {
  const response = await fetch(
    `${BASE_URL}/api/webhooks/meta/data-deletion/${encodeURIComponent(confirmationCode)}`,
    { headers: { 'Content-Type': 'application/json' } }
  )

  if (response.status === 404) {
    return { outcome: 'not_found' }
  }

  // Anything else that is not a clean 200 is a failure to LOOK UP, not a
  // verdict on the request. Throwing routes it to the page's error state.
  if (!response.ok) {
    throw new Error(`Deletion status lookup failed with status ${response.status}`)
  }

  const parsed = (await response.json()) as ApiResponse<MetaDeletionRequestStatus>

  if (!parsed.success || !parsed.data) {
    throw new Error(parsed.error || 'Deletion status lookup returned no data')
  }

  return { outcome: 'found', request: parsed.data }
}
