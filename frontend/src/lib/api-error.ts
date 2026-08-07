// Server error strings are written for us, not for customers. The lead inbox
// was rendering "Failed to get lead states for client f163ed8a-d0a1-70bd-...:
// Requested resource not found" straight into the page: it named an internal
// operation, an internal identifier, and an AWS failure mode, none of which a
// client can act on.
//
// The detail is still worth having, so it goes to the console rather than
// nowhere -- a support call can ask someone to open devtools, and it keeps the
// diagnostic value that made this text useful during development.

// Messages the server sends that ARE meant for a person, mapped to the wording
// we want them to see. Anything not listed is treated as internal.
const USER_FACING: Record<string, string> = {
  'Lead not found': 'This lead no longer exists, or you no longer have access to it.',
  'CRM not connected': 'No CRM is connected to this account yet.',
}

/**
 * Logs the raw server error and returns something safe to render.
 *
 * Deliberately does both: every call site that shows a message also wants the
 * detail logged, and splitting them just means one of the two gets forgotten.
 */
export function describeApiError(context: string, raw: string | undefined, fallback: string): string {
  if (raw) {
    console.error(`[${context}]`, raw)
    const known = USER_FACING[raw]
    if (known) return known
  }
  return fallback
}
