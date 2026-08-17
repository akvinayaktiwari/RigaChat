// Puts the browser into an authenticated dashboard session.
//
// There is no programmatic sign-in for this account: it is a Google-federated
// Cognito user, so USER_PASSWORD_AUTH cannot mint a token for it and the
// hosted-UI flow needs a real Google consent screen. An operator-supplied ID
// token is not a shortcut around auth, it is the only door -- which is why
// E2E_ID_TOKEN is a required input for the dashboard half rather than an
// optional convenience.

import { expect, type Page } from '@playwright/test'

interface IdTokenClaims {
  sub: string
  email?: string
  name?: string
  exp?: number
}

export function decodeIdToken(idToken: string): IdTokenClaims {
  const [, payloadSegment] = idToken.split('.')
  if (!payloadSegment) throw new Error('E2E_ID_TOKEN is not a JWT (no payload segment)')
  const json = Buffer.from(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  return JSON.parse(json) as IdTokenClaims
}

// Checked before the browser opens. An expired token rehydrates as a signed-out
// session and bounces to /login, which reads as "the dashboard is broken"
// rather than "your token aged out" -- and these tokens are short-lived, so
// this is the single most likely way a run fails.
export function assertTokenIsFresh(idToken: string): IdTokenClaims {
  const claims = decodeIdToken(idToken)
  const now = Math.floor(Date.now() / 1000)
  expect(
    claims.exp !== undefined && claims.exp > now,
    'E2E_ID_TOKEN has expired — grab a fresh one from the dashboard (sessionStorage.bb_token)'
  ).toBe(true)
  return claims
}

// Writes the same two sessionStorage keys useAuth.ts writes on sign-in, so the
// app rehydrates exactly as it would after a real login. clientId is the token's
// `sub`, which is what useAuth.ts itself uses.
export async function signInWithIdToken(page: Page, baseUrl: string, idToken: string): Promise<void> {
  const claims = assertTokenIsFresh(idToken)

  // The origin has to be loaded before sessionStorage can be written to it, so
  // this lands on a cheap public page first rather than a dashboard route that
  // would bounce to /login before the session exists.
  await page.goto(`${baseUrl}/`)
  await page.evaluate(
    ([token, user]) => {
      sessionStorage.setItem('bb_token', token)
      sessionStorage.setItem('bb_user', user)
    },
    [
      idToken,
      JSON.stringify({
        clientId: claims.sub,
        email: claims.email ?? '',
        name: claims.name ?? '',
        plan: 'free',
      }),
    ]
  )
}
