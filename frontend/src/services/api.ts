import type {
  ApiResponse,
  BotConfig,
  ClientRecord,
  ConnectWhatsAppInput,
  CRMConnection,
  CreateBotInput,
  CreateFormInput,
  CreateKBEntryInput,
  CreateVoiceAgentInput,
  FormConfig,
  FormLead,
  IndexingJob,
  KnowledgeBaseEntry,
  Lead,
  ResyncResult,
  SetupBotResult,
  StartIndexingResult,
  SubscriptionSummary,
  UpdateKBInput,
  UpdateVoiceAgentInput,
  VoiceAgent,
  VoiceKnowledgeBaseEntry,
  VoiceUsageSummary,
  WhatsAppConnection,
} from '../types/index'

const BASE_URL = import.meta.env.VITE_API_URL

let authToken: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

export async function apiClient<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

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
}

export function subscribeToTier(tier: 'starter' | 'growth' | 'agency'): Promise<SubscribeResponse> {
  return apiClient<SubscribeResult>('/api/billing/subscribe', 'POST', { tier }) as Promise<SubscribeResponse>
}

// Auth API

export function confirmSignup(username: string): Promise<ApiResponse<null>> {
  return apiClient<null>('/api/auth/confirm', 'POST', { username })
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
  window.location.href = `${BASE_URL}/api/integrations/zoho/connect?token=${encodeURIComponent(authToken)}`
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
