/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_CDN_URL: string
  readonly VITE_COGNITO_DOMAIN: string
  readonly VITE_COGNITO_CLIENT_ID: string
  readonly VITE_COGNITO_REDIRECT_URI: string
  readonly VITE_COGNITO_REGION: string
  /**
   * The hostname developers are told to call (https://api.vyostra.com). Shown
   * in Settings only; the dashboard itself keeps calling VITE_API_URL. Optional:
   * unset falls back to VITE_API_URL.
   */
  readonly VITE_PUBLIC_API_URL?: string
  /** GA4 Measurement ID (G-XXXXXXXXXX). Optional: unset disables analytics. */
  readonly VITE_GA_MEASUREMENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
