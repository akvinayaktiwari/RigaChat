/**
 * The public origin of the marketing site, e.g. "https://vyostra.com".
 *
 * Derived from VITE_COGNITO_REDIRECT_URI rather than a new variable: the login
 * redirect is definitionally the live domain (if it were wrong, sign-in would
 * already be broken), and CI's CloudFront invalidation step resolves the site
 * host from the same value for the same reason. A hardcoded origin is what once
 * shipped a login pointing at the retired domain.
 *
 * Empty when the variable is unset (unit tests). scripts/prerender.mjs refuses
 * to write canonical URLs or a sitemap from a non-https origin in CI.
 */
export function siteOrigin(redirectUri: string | undefined): string {
  if (!redirectUri) return ''

  try {
    return new URL(redirectUri).origin
  } catch {
    throw new Error(`VITE_COGNITO_REDIRECT_URI is not a valid URL: "${redirectUri}"`)
  }
}

export const SITE_URL: string = siteOrigin(import.meta.env.VITE_COGNITO_REDIRECT_URI)

/**
 * Absolute URL for a site path.
 *
 * Pass the path exactly as it is SERVED. Prerendered routes are S3 directories,
 * so they are served at the trailing-slash form ("/blog/") and the bare form
 * 302-redirects to it; a canonical must never point at a redirect.
 */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`
}
