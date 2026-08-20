// Per-IP rate limiting for endpoints that cannot require auth.
//
// Lives in lib/ next to cognito.ts for the same reason: it is middleware that
// decides whether a request is allowed to reach a route at all, not business
// logic a route is performing. Routes still call services only.
//
// FAILS OPEN, DELIBERATELY.
//   If Redis is unreachable the request is allowed through. The asymmetry is
//   the same one contact-service.ts documents: this limiter guards against
//   scripted abuse, and the cost of letting abuse through during a cache
//   outage is a bill. The cost of failing closed is that every client's chat
//   widget stops answering visitors the moment Upstash has a bad minute --
//   turning a cache dependency into an availability dependency for the
//   product's main surface. A silent outage that only removes a guard is the
//   better failure.
//
//   That trade is only defensible because it is NOT the only control: message
//   spend inside a conversation is separately bounded by
//   MESSAGE_CEILING_PER_CONVERSATION, which is enforced from DynamoDB and does
//   not depend on Redis at all.

import { createMiddleware } from 'hono/factory'
import { getClientIp } from './client-ip.js'
import { incrementChatRate } from '../repositories/redis-repository.js'
import type { ApiResponse } from '../types/index.js'

export interface RateLimitOptions {
  bucket: 'start' | 'message'
  max: number
  windowSeconds: number
  // Shown to a real person who has been caught by a limit meant for scripts,
  // so it says what to do rather than naming the rule.
  message: string
}

export function rateLimit({ bucket, max, windowSeconds, message }: RateLimitOptions) {
  return createMiddleware(async (c, next) => {
    const ip = getClientIp(c)
    const count = await incrementChatRate(bucket, ip, windowSeconds)

    // null means the counter could not be read. See the header comment.
    if (count !== null && count > max) {
      // Logged because a limit firing is either an attack or a limit set too
      // low, and both need to be visible. The IP is the only way to tell which.
      console.warn(`[rate-limit] ${bucket} blocked for ip ${ip} (${count} in ${windowSeconds}s)`)
      return c.json<ApiResponse<null>>({ success: false, error: message }, 429, {
        'Retry-After': String(windowSeconds),
      })
    }

    await next()
  })
}
