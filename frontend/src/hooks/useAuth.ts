import { createContext, createElement, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { setAuthToken } from '../services/api'

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
  login: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    token: null,
  })

  useEffect(() => {
    // No persisted session in this mock implementation — token lives only in memory,
    // so there is nothing to restore. Real Cognito integration (Step 10) replaces this.
    setState((prev) => ({ ...prev, isLoading: false }))
  }, [])

  function login(token: string, user: AuthUser): void {
    setAuthToken(token)
    setState({ isAuthenticated: true, isLoading: false, user, token })
  }

  function logout(): void {
    setAuthToken(null)
    setState({ isAuthenticated: false, isLoading: false, user: null, token: null })
  }

  return createElement(AuthContext.Provider, { value: { ...state, login, logout } }, children)
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
