// Why the Meta Ads connect flow failed, in a form the dashboard can act on.
//
// Every failure used to collapse into reason=auth_failed, which the UI rendered
// as "Failed to connect Meta Ads. Please try again." The worst case was a
// client with no Facebook Page: meta-provider.ts already produced the exactly
// right sentence -- "No Facebook Pages found for this account. Connect a Page
// you manage and try again." -- and the route threw it away, so the client
// retried an action that could never succeed.
//
// Lives in lib/ rather than in the service because both the provider (which
// detects most of these) and the service throw them, and a provider importing
// from a service would invert the layering CLAUDE.md sets out.

// Kept in sync with the frontend's META_ERROR_MESSAGES map. Adding a reason
// here without adding a message there falls back to the generic string, which
// is safe but wastes the whole point of this file.
export type MetaConnectFailureReason =
  | 'invalid_state'
  | 'no_pages'
  | 'page_already_connected'
  | 'token_exchange_failed'
  | 'pages_lookup_failed'
  | 'permission_declined'
  | 'misconfigured'
  | 'auth_failed'
  | 'user_token_expired'
  | 'too_many_pages'

export class MetaConnectError extends Error {
  readonly reason: MetaConnectFailureReason

  constructor(reason: MetaConnectFailureReason, message: string) {
    super(message)
    this.name = 'MetaConnectError'
    this.reason = reason
  }
}

// The client completed Facebook login but manages no Page. Not retryable, and
// the only failure here a client can fix without our help.
export class MetaNoPagesError extends MetaConnectError {
  constructor() {
    super('no_pages', 'No Facebook Pages found for this account. Connect a Page you manage and try again.')
    this.name = 'MetaNoPagesError'
  }
}

// Meta rejected the code-for-token exchange. Usually a redirect_uri that does
// not match the app's configured OAuth redirect, or an expired code.
export class MetaTokenExchangeError extends MetaConnectError {
  constructor(detail: string) {
    super('token_exchange_failed', `Meta token exchange failed: ${detail}`)
    this.name = 'MetaTokenExchangeError'
  }
}

export class MetaPagesLookupError extends MetaConnectError {
  constructor(detail: string) {
    super('pages_lookup_failed', `Meta Pages lookup failed: ${detail}`)
    this.name = 'MetaPagesLookupError'
  }
}

// Two clients cannot own the same Facebook Page: whoever claimed it first
// keeps it, and the second is told where to look rather than being left to
// guess. Lives here with its siblings so every connect failure is defined in
// one file -- it used to sit in meta-lead-service.ts, which meant anything
// wanting to catch it had to import the whole service graph.
export class MetaPageAlreadyConnectedError extends MetaConnectError {
  constructor() {
    super('page_already_connected', 'This Facebook Page is already connected to another account.')
    this.name = 'MetaPageAlreadyConnectedError'
  }
}

// The client hit "Cancel" on Meta's consent screen, or unticked a scope. Meta
// sends this back on the redirect rather than as an exception, so it is
// detected in the callback, not thrown by the provider.
export class MetaPermissionDeclinedError extends MetaConnectError {
  constructor() {
    super('permission_declined', 'Permission was not granted on the Meta consent screen.')
    this.name = 'MetaPermissionDeclinedError'
  }
}

// The integration is not set up on OUR side -- a missing META_APP_ID, or a
// redirect URI still pointing at localhost in production, which Meta answers
// with "URL Blocked" after the client has already left the dashboard. Ours to
// fix, never the client's, so the dashboard says so plainly instead of telling
// them to try again.
export class MetaMisconfiguredError extends MetaConnectError {
  constructor(detail: string) {
    super('misconfigured', `Meta integration is misconfigured: ${detail}`)
    this.name = 'MetaMisconfiguredError'
  }
}

// Anything that reaches the callback without a recognisable cause. Distinct
// from the classes above precisely so the generic bucket stays small.
export function failureReasonOf(error: unknown): MetaConnectFailureReason {
  return error instanceof MetaConnectError ? error.reason : 'auth_failed'
}

/**
 * The stored long-lived user token has expired (~60 days) or been revoked.
 *
 * Its own error type because the UI must distinguish it from "this account has
 * no Pages". Rendering an expired token as an empty list tells the client their
 * Pages are gone, when in fact every connected Page is still receiving leads --
 * only Page *management* needs the user token.
 */
export class MetaUserTokenExpiredError extends MetaConnectError {
  constructor() {
    super('user_token_expired', 'Your Facebook connection expired. Reconnect to manage Pages.')
    this.name = 'MetaUserTokenExpiredError'
  }
}

/**
 * More Pages selected in one request than we will process at once.
 *
 * A batch size, not a product limit: a client with 60 Pages connects them in
 * three passes. The cap exists because each Page costs a webhook subscription
 * call and the Lambda has a 60-second budget.
 */
export class MetaTooManyPagesError extends MetaConnectError {
  constructor(requested: number, max: number) {
    super('too_many_pages', `Selected ${requested} Pages; ${max} is the maximum per batch.`)
    this.name = 'MetaTooManyPagesError'
  }
}
