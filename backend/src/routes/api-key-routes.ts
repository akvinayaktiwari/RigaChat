// Key management for the developer API. Mounted at /api/api-keys.
//
// Cognito-authenticated and dashboard-only: a key can never create, list, edit
// or revoke keys, so a leaked key cannot mint a replacement for itself or widen
// what it is allowed to do.

import { Hono } from 'hono'
import { requireAuth } from '../lib/cognito.js'
import {
  ApiKeyLimitError,
  ApiKeyNotFoundError,
  ApiKeyValidationError,
  createApiKeyForClient,
  listApiKeysForClient,
  parseCreateApiKeyInput,
  revokeApiKeyForClient,
  updateApiKeyScopesForClient,
} from '../services/api-key-service.js'
import { EntitlementError } from '../services/entitlement-service.js'
import type { ApiKeySummary, ApiResponse, CreatedApiKey } from '../types/index.js'

export const apiKeyRoutes = new Hono()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// The one response that carries the secret. It is not stored and cannot be
// shown again.
apiKeyRoutes.post('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const input = parseCreateApiKeyInput(await c.req.json().catch(() => null))
    const created = await createApiKeyForClient(clientId, input)
    return c.json<ApiResponse<CreatedApiKey>>({ success: true, data: created }, 201)
  } catch (error) {
    // Rethrown so app.onError maps it to the same 403 body as every other
    // plan gate.
    if (error instanceof EntitlementError) throw error
    if (error instanceof ApiKeyValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    if (error instanceof ApiKeyLimitError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 409)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

apiKeyRoutes.get('/', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const keys = await listApiKeysForClient(clientId)
    return c.json<ApiResponse<ApiKeySummary[]>>({ success: true, data: keys }, 200)
  } catch (error) {
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

// Changes what an existing key may do. The secret is untouched, so whatever is
// using the key keeps working and simply gains or loses the scope.
apiKeyRoutes.patch('/:keyId', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    const body: unknown = await c.req.json().catch(() => null)
    const updated = await updateApiKeyScopesForClient(clientId, c.req.param('keyId'), body)
    return c.json<ApiResponse<ApiKeySummary>>({ success: true, data: updated }, 200)
  } catch (error) {
    if (error instanceof EntitlementError) throw error
    if (error instanceof ApiKeyValidationError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 400)
    }
    if (error instanceof ApiKeyNotFoundError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})

apiKeyRoutes.delete('/:keyId', requireAuth, async (c) => {
  const clientId = c.get('user').sub

  try {
    await revokeApiKeyForClient(clientId, c.req.param('keyId'))
    return c.json<ApiResponse<null>>({ success: true, data: null }, 200)
  } catch (error) {
    if (error instanceof ApiKeyNotFoundError) {
      return c.json<ApiResponse<null>>({ success: false, error: error.message }, 404)
    }
    return c.json<ApiResponse<null>>({ success: false, error: errorMessage(error) }, 500)
  }
})
