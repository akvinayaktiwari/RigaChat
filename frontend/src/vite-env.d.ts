/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_CDN_URL: string
  readonly VITE_COGNITO_DOMAIN: string
  readonly VITE_COGNITO_CLIENT_ID: string
  readonly VITE_COGNITO_REDIRECT_URI: string
  readonly VITE_COGNITO_REGION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
