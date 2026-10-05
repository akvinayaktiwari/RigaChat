import { createHash, randomBytes, randomUUID } from 'crypto'
import {
  deleteApiKey,
  getApiKeyByHash,
  getApiKeysForClient,
  putApiKey,
  touchApiKeyLastUsed,
} from '../repositories/api-key-repository.js'
import { incrementApiKeyRate } from '../repositories/redis-repository.js'
import { EntitlementError, resolveApiAccess } from './entitlement-service.js'
import {
  API_KEY_LAST_USED_WRITE_INTERVAL_SECONDS,
  API_KEY_MAX_PER_ACCOUNT,
  API_RATE_LIMIT,
} from '../config/entitlements-config.js'
import type { ApiKeyRecord, ApiKeySummary, ApiPrincipal, ApiScope, CreatedApiKey } from '../types/index.js'

// The prefix is what lets a leaked key be recognised for what it is -- by a
// person reading a log, and by secret scanners matching on it.
export const API_KEY_PREFIX = 'vy_live_'

// Record rather than an array so adding a member to ApiScope without listing it
// here is a compile error.
const SCOPE_REGISTRY: Record<ApiScope, true> = {
  'leads:read': true,
  'bots:read': true,
  'forms:read': true,
  'voice_agents:read': true,
}
export const API_SCOPES = Object.keys(SCOPE_REGISTRY) as ApiScope[]

const MAX_NAME_LENGTH = 60

export class ApiKeyValidationError extends Error {}
export class ApiKeyLimitError extends Error {}
export class ApiKeyNotFoundError extends Error {}

export interface CreateApiKeyInput {
  name: string
  scopes: ApiScope[]
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

function toSummary({ keyHash: _keyHash, clientId: _clientId, ...summary }: ApiKeyRecord): ApiKeySummary {
  return summary
}

function parseScopes(raw: unknown): ApiScope[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiKeyValidationError('scopes must be a non-empty array')
  }
  const unknown = raw.filter((scope) => !API_SCOPES.includes(scope as ApiScope))
  if (unknown.length > 0) {
    throw new ApiKeyValidationError(`Unknown scope: ${unknown.map(String).join(', ')}`)
  }
  return [...new Set(raw as ApiScope[])]
}

export function parseCreateApiKeyInput(raw: unknown): CreateApiKeyInput {
  const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    throw new ApiKeyValidationError(`name is required and must be at most ${MAX_NAME_LENGTH} characters`)
  }
  return { name, scopes: parseScopes(body.scopes) }
}

export async function createApiKeyForClient(clientId: string, input: CreateApiKeyInput): Promise<CreatedApiKey> {
  if ((await resolveApiAccess(clientId)) === null) {
    throw new EntitlementError('FEATURE_DISABLED', 'api')
  }

  const existing = await getApiKeysForClient(clientId)
  if (existing.length >= API_KEY_MAX_PER_ACCOUNT) {
    throw new ApiKeyLimitError(
      `You already have ${API_KEY_MAX_PER_ACCOUNT} API keys. Revoke one you no longer use before creating another.`
    )
  }

  const key = `${API_KEY_PREFIX}${randomBytes(24).toString('hex')}`
  const record: ApiKeyRecord = {
    keyHash: hashApiKey(key),
    keyId: randomUUID(),
    clientId,
    name: input.name,
    last4: key.slice(-4),
    scopes: input.scopes,
    createdAt: new Date().toISOString(),
  }
  await putApiKey(record)

  return { ...toSummary(record), key }
}

export async function listApiKeysForClient(clientId: string): Promise<ApiKeySummary[]> {
  const records = await getApiKeysForClient(clientId)
  return records.map(toSummary)
}

export async function revokeApiKeyForClient(clientId: string, keyId: string): Promise<void> {
  const records = await getApiKeysForClient(clientId)
  const record = records.find((candidate) => candidate.keyId === keyId)
  // Missing and not-yours are the same answer, so a keyId cannot be probed.
  if (!record || !(await deleteApiKey(record.keyHash, clientId))) {
    throw new ApiKeyNotFoundError('API key not found')
  }
}

export type ApiKeyAuthResult =
  | { ok: true; principal: ApiPrincipal }
  | { ok: false; reason: 'invalid' | 'plan' }
  | { ok: false; reason: 'rate_limited'; retryAfterSeconds: number }

function isLastUsedStale(record: ApiKeyRecord, now: number): boolean {
  if (!record.lastUsedAt) return true
  return now - new Date(record.lastUsedAt).getTime() > API_KEY_LAST_USED_WRITE_INTERVAL_SECONDS * 1000
}

// Never fails the request: lastUsedAt is a convenience for the dashboard, and a
// write error there must not turn into a customer's integration going down.
async function recordUse(record: ApiKeyRecord, now: number): Promise<void> {
  if (!isLastUsedStale(record, now)) return
  try {
    await touchApiKeyLastUsed(record.keyHash, new Date(now).toISOString())
  } catch (error) {
    console.error(`[api-key] could not record use of key ${record.keyId}:`, error)
  }
}

// Order matters. The plan is checked on every request rather than only when a
// key is created, so a key outlives neither a downgrade nor a lapsed
// subscription. The rate limit comes last so an invalid key cannot be used to
// run up a counter.
export async function authenticateApiKey(key: string): Promise<ApiKeyAuthResult> {
  if (!key.startsWith(API_KEY_PREFIX)) return { ok: false, reason: 'invalid' }

  const record = await getApiKeyByHash(hashApiKey(key))
  if (!record) return { ok: false, reason: 'invalid' }

  if ((await resolveApiAccess(record.clientId)) === null) return { ok: false, reason: 'plan' }

  // null means Redis could not be read, which is allowed through -- see
  // lib/rate-limit.ts for why a cache outage must not become an API outage.
  const count = await incrementApiKeyRate(record.keyId, API_RATE_LIMIT.windowSeconds)
  if (count !== null && count > API_RATE_LIMIT.max) {
    console.warn(`[api-key] rate limit hit for key ${record.keyId} (${count} in ${API_RATE_LIMIT.windowSeconds}s)`)
    return { ok: false, reason: 'rate_limited', retryAfterSeconds: API_RATE_LIMIT.windowSeconds }
  }

  await recordUse(record, Date.now())
  return { ok: true, principal: { clientId: record.clientId, keyId: record.keyId, scopes: record.scopes } }
}
