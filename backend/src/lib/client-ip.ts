// The caller's IP, across both runtimes this backend runs in.
//
// Extracted because auth-routes.ts and contact-routes.ts each carried their own
// copy of this, and abuse controls on /api/chat would have made a third. Three
// copies of a security-relevant helper is how one of them quietly drifts.
//
// This app runs under two different runtimes sharing the same Hono `app`
// (index.ts): hono/aws-lambda's handle() in the real deployed Lambda (Function
// URL event, API Gateway v2 shape -- c.env.requestContext is populated) and
// @hono/node-server's serve() for local dev (c.env is the raw Node req/res, no
// requestContext at all). hono/aws-lambda's getConnInfo reads
// c.env.requestContext directly and throws if it's absent, so it can't be
// called unconditionally -- this picks whichever adapter matches the runtime
// actually in use for this request.

import { getConnInfo as getLambdaConnInfo } from 'hono/aws-lambda'
import { getConnInfo as getNodeConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

export function getClientIp(c: Context): string {
  const hasLambdaEvent = Boolean((c.env as { requestContext?: unknown } | undefined)?.requestContext)
  const address = hasLambdaEvent ? getLambdaConnInfo(c).remote.address : getNodeConnInfo(c).remote.address
  // 'unknown' is a real bucket, not a bypass: everything the platform cannot
  // attribute shares one limit rather than escaping the limiter entirely.
  return address ?? 'unknown'
}
