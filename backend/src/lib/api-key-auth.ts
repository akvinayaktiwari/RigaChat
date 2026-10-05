// API-key authentication for the /v1 developer API.
//
// Lives in lib/ next to cognito.ts for the same reason rate-limit.ts does: it
// decides whether a request reaches a route at all. The decision itself is the
// service's -- this only reads the header and maps the result to a status.
//
// Deliberately NOT accepted on /api/*. Those routes are shaped for the
// dashboard and change with it; several of them (billing, account deletion,
// OAuth connections, key management itself) must never be reachable with a
// credential that sits in someone's server config.

import { createMiddleware } from 'hono/factory'
import type { Context } from 'hono'
import { authenticateApiKey, type ApiKeyAuthResult } from '../services/api-key-service.js'
import type { ApiPrincipal, ApiScope, PublicApiError } from '../types/index.js'

declare module 'hono' {
  interface ContextVariableMap {
    apiPrincipal: ApiPrincipal
  }
}

type Rejection = Extract<ApiKeyAuthResult, { ok: false }>

function reject(c: Context, rejection: Rejection): Response {
  if (rejection.reason === 'rate_limited') {
    return c.json<PublicApiError>(
      { error: { code: 'rate_limited', message: 'Too many requests. Retry after the interval in Retry-After.' } },
      429,
      { 'Retry-After': String(rejection.retryAfterSeconds) }
    )
  }
  if (rejection.reason === 'plan') {
    return c.json<PublicApiError>(
      { error: { code: 'api_access_disabled', message: 'API access is not included in this account\'s current plan.' } },
      403
    )
  }
  return c.json<PublicApiError>({ error: { code: 'invalid_api_key', message: 'Invalid or revoked API key.' } }, 401)
}

function bearerToken(c: Context): string | null {
  const header = c.req.header('Authorization')
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null
}

export function requireApiKey(scope: ApiScope) {
  return createMiddleware(async (c, next) => {
    const key = bearerToken(c)
    if (!key) {
      return c.json<PublicApiError>(
        { error: { code: 'missing_api_key', message: 'Send your API key as "Authorization: Bearer <key>".' } },
        401
      )
    }

    const result = await authenticateApiKey(key)
    if (!result.ok) return reject(c, result)

    if (!result.principal.scopes.includes(scope)) {
      return c.json<PublicApiError>(
        { error: { code: 'insufficient_scope', message: `This API key does not have the ${scope} scope.` } },
        403
      )
    }

    c.set('apiPrincipal', result.principal)
    await next()
  })
}
