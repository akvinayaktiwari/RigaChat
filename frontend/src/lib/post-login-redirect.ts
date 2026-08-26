// Carries "where were you going" across a login bounce.
//
// Deep links into the dashboard are only useful to someone already signed in
// unless this exists: ProtectedRoute sends an unauthenticated visitor to
// /login, and without a record of the attempted path they land on the dashboard
// home afterwards. The case that made it matter is the WhatsApp handoff alert's
// "Open this lead" button, which is read on a phone -- exactly where a client is
// least likely to have a live session.
//
// Two mechanisms, because the two sign-in paths lose state differently:
//
//   - the ?next= query param survives an in-SPA navigation to /login, and is
//     what the email/password form reads;
//   - sessionStorage survives the FEDERATED round trip, where useAuth.login()
//     sets window.location.href and leaves the app entirely. A query param
//     cannot: the redirect_uri Cognito returns to is fixed.
//
// Both are written, because which one gets used is the visitor's choice at the
// login screen, not ours.

const STORAGE_KEY = 'vyostra:post-login-path'

export const DEFAULT_POST_LOGIN_PATH = '/dashboard'

// Path-only and same-origin by construction. An open redirect here would be
// reachable by anyone who can get a client to open a link -- which, for a
// product whose alerts arrive over WhatsApp, is the whole threat model.
//
// '//evil.com' and '/\evil.com' are the two forms a browser reads as
// protocol-relative ABSOLUTE urls despite the leading slash, so a naive
// startsWith('/') check is not enough on its own.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

export function rememberPostLoginPath(path: string): void {
  const safe = safeNextPath(path)
  if (!safe) return
  try {
    sessionStorage.setItem(STORAGE_KEY, safe)
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Losing the
    // destination is a worse landing page, never a failed sign-in.
  }
}

// Reads AND clears: a destination is good for exactly one login. Leaving it
// behind would silently redirect the NEXT sign-in in this tab to a lead the
// person has long since dealt with.
export function takePostLoginPath(): string {
  try {
    const stored = safeNextPath(sessionStorage.getItem(STORAGE_KEY))
    sessionStorage.removeItem(STORAGE_KEY)
    return stored ?? DEFAULT_POST_LOGIN_PATH
  } catch {
    return DEFAULT_POST_LOGIN_PATH
  }
}
