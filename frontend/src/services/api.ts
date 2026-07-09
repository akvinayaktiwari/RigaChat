import type {
  ApiResponse,
  BotConfig,
  ClientRecord,
  CreateBotInput,
  CreateFormInput,
  CreateKBEntryInput,
  FormConfig,
  FormLead,
  KnowledgeBaseEntry,
  Lead,
  ResyncResult,
  SetupBotResult,
  UpdateKBInput,
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
