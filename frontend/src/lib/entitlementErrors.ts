// Shape of the JSON body toEntitlementErrorResponse() (backend) returns on a
// 402/403 — distinct from ApiResponse<T>, which apiClient() types responses
// as by default; this doesn't declare `success`/`data` because the raw
// response doesn't include them. Any ApiResponse<T> is still assignable
// here (its declared fields are a subset), so call sites can pass the same
// `res` they already have from apiClient() without extra casting.
export interface EntitlementErrorBody {
  error?: string
  feature?: string
  limit?: number
  current?: number
}

// Returns null when `body` isn't an entitlement-error shape at all (a
// normal validation error, network failure, etc.) — callers should fall
// back to `res.error` themselves in that case, same as every other API
// error today, so a message that's already human-readable is never
// second-guessed by this helper.
export function translateEntitlementError(body: EntitlementErrorBody): string | null {
  if (body.error !== 'FEATURE_DISABLED' && body.error !== 'LIMIT_EXCEEDED') {
    return null
  }

  if (body.error === 'LIMIT_EXCEEDED' && body.feature === 'agents') {
    const limit = body.limit ?? 0
    return `You've reached your plan's limit of ${limit} chatbot${limit === 1 ? '' : 's'}. Upgrade to add more.`
  }

  if (body.error === 'LIMIT_EXCEEDED' && body.feature === 'chat') {
    return `You've used all ${body.limit ?? 0} conversations for this period. Upgrade for a higher limit.`
  }

  if (body.error === 'FEATURE_DISABLED' && body.feature === 'voice') {
    return 'Voice Agents are an add-on not included in your current plan.'
  }

  if (body.error === 'LIMIT_EXCEEDED' && body.feature === 'kbFileSize') {
    const limitMB = body.limit ? Math.round(body.limit / (1024 * 1024)) : 0
    return `This file is larger than your plan's ${limitMB}MB limit. Upgrade for a higher limit.`
  }

  return "You've reached a plan limit. Contact us to upgrade."
}
