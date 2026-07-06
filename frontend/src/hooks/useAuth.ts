import { createContext, createElement, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { setAuthToken, syncMe } from '../services/api'

export interface AuthUser {
  clientId: string
  email: string
  name: string
  plan: string
}

export interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: AuthUser | null
  token: string | null
}

interface AuthContextValue extends AuthState {
  login: () => void
  logout: () => void
  handleCallback: (code: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID
const COGNITO_REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI

interface IdTokenPayload {
  sub: string
  email: string
  name?: string
}

function decodeIdToken(idToken: string): IdTokenPayload {
  const [, payloadSegment] = idToken.split('.')
  const decoded = atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'))
  return JSON.parse(decoded) as IdTokenPayload
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    token: null,
  })

  useEffect(() => {
    async function init() {
      try {
        const code = new URLSearchParams(window.location.search).get('code')
        if (code) {
          await handleCallback(code)
        } else {
          setState((prev) => ({ ...prev, isLoading: false }))
        }
      } catch (error) {
        console.error('Auth initialization failed:', error)
        setState((prev) => ({ ...prev, isLoading: false }))
      }
    }
    void init()
  }, [])

  function login(): void {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: COGNITO_CLIENT_ID,
      redirect_uri: COGNITO_REDIRECT_URI,
      scope: 'openid email profile',
      identity_provider: 'Google',
    })
    window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`
  }

  async function handleCallback(code: string): Promise<void> {
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: COGNITO_CLIENT_ID,
        redirect_uri: COGNITO_REDIRECT_URI,
        code,
      })

      const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })

      if (!response.ok) {
        throw new Error(`Token exchange failed with status ${response.status}`)
      }

      const tokens = (await response.json()) as { id_token: string; access_token: string }
      const { sub, email, name } = decodeIdToken(tokens.id_token)

      setAuthToken(tokens.id_token)

      const meResponse = await syncMe()
      if (!meResponse.success || !meResponse.data) {
        throw new Error(meResponse.error ?? 'Failed to sync client record')
      }

      setState({
        isAuthenticated: true,
        isLoading: false,
        user: {
          clientId: sub,
          email,
          name: name ?? email.split('@')[0],
          plan: meResponse.data.plan,
        },
        token: tokens.id_token,
      })

      window.history.replaceState({}, '', '/dashboard')
    } catch (error) {
      console.error('Cognito callback handling failed:', error)
      setAuthToken(null)
      setState({ isAuthenticated: false, isLoading: false, user: null, token: null })
      window.location.href = '/login'
    }
  }

  function logout(): void {
    setAuthToken(null)
    setState({ isAuthenticated: false, isLoading: false, user: null, token: null })

    const params = new URLSearchParams({
      client_id: COGNITO_CLIENT_ID,
      logout_uri: COGNITO_REDIRECT_URI,
    })
    window.location.href = `https://${COGNITO_DOMAIN}/logout?${params.toString()}`
  }

  return createElement(
    AuthContext.Provider,
    { value: { ...state, login, logout, handleCallback } },
    children
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
