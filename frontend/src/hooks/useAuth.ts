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
  handleCallback: (code: string) => Promise<boolean>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<{ token: string; user: AuthUser }>
  // For flows that obtain a token+user outside the Cognito calls this hook
  // otherwise owns (e.g. the backend-orchestrated quick-signup endpoint,
  // which already returns a ready-to-use {token, user} pair) — sets the same
  // session state signIn()/handleCallback() do, without re-hitting Cognito.
  setSession: (token: string, user: AuthUser) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN
const COGNITO_CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID
const COGNITO_REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI

// Region/URL for direct calls to the Cognito User Pools API (SignUp, InitiateAuth),
// used by the email/password flow. Separate from COGNITO_DOMAIN, which is the
// Hosted UI domain used by the Google OAuth flow above.
const REGION = import.meta.env.VITE_COGNITO_REGION || 'ap-south-1'
const COGNITO_API_URL = `https://cognito-idp.${REGION}.amazonaws.com/`

interface IdTokenPayload {
  sub: string
  email: string
  name?: string
  exp?: number
}

function decodeIdToken(idToken: string): IdTokenPayload {
  const [, payloadSegment] = idToken.split('.')
  const decoded = atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'))
  return JSON.parse(decoded) as IdTokenPayload
}

// sessionStorage (not localStorage) so a session survives a page refresh but
// is cleared when the tab closes and can't be read from other tabs.
const SESSION_TOKEN_KEY = 'bb_token'
const SESSION_USER_KEY = 'bb_user'

function saveSession(token: string, user: AuthUser): void {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token)
  sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
}

function clearSession(): void {
  sessionStorage.removeItem(SESSION_TOKEN_KEY)
  sessionStorage.removeItem(SESSION_USER_KEY)
}

interface CognitoErrorBody {
  __type?: string
  message?: string
}

async function parseCognitoError(response: Response): Promise<CognitoErrorBody> {
  try {
    return (await response.json()) as CognitoErrorBody
  } catch {
    return {}
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    token: null,
  })

  useEffect(() => {
    // Restore a session saved by a previous handleCallback()/signIn() call so
    // a page refresh doesn't log the user out. Falls through to the existing
    // isLoading:false below if there's no saved session or it's expired.
    const savedToken = sessionStorage.getItem(SESSION_TOKEN_KEY)
    const savedUserJson = sessionStorage.getItem(SESSION_USER_KEY)

    if (savedToken && savedUserJson) {
      try {
        const user = JSON.parse(savedUserJson) as AuthUser
        const payload = decodeIdToken(savedToken)
        const now = Math.floor(Date.now() / 1000)

        if (payload.exp && payload.exp > now) {
          setAuthToken(savedToken)
          setState({
            isAuthenticated: true,
            isLoading: false,
            user,
            token: savedToken,
          })
          return
        }
      } catch {
        // Malformed saved session — fall through to clearing it below.
      }
      clearSession()
    }

    // The /auth/callback route (AuthCallbackPage) is solely responsible for
    // consuming the one-time authorization code and calling handleCallback.
    // Doing it here too would race it and burn the code on a duplicate
    // /oauth2/token request, which Cognito rejects on the second use.
    setState((prev) => ({ ...prev, isLoading: false }))
  }, [])

  function login(): void {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: COGNITO_CLIENT_ID,
      redirect_uri: COGNITO_REDIRECT_URI,
      // 'profile' is intentionally omitted — it isn't in this Cognito app
      // client's AllowedOAuthScopes and requesting it causes invalid_scope.
      scope: 'openid email',
      identity_provider: 'Google',
    })
    window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`
  }

  async function handleCallback(code: string): Promise<boolean> {
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

      const user: AuthUser = {
        clientId: sub,
        email,
        name: name ?? email.split('@')[0],
        plan: meResponse.data.plan,
      }

      setState({
        isAuthenticated: true,
        isLoading: false,
        user,
        token: tokens.id_token,
      })
      saveSession(tokens.id_token, user)

      return true
    } catch (error) {
      console.error('Cognito callback handling failed:', error)
      setAuthToken(null)
      clearSession()
      setState({ isAuthenticated: false, isLoading: false, user: null, token: null })
      window.location.href = '/login'
      return false
    }
  }

  function logout(): void {
    setAuthToken(null)
    clearSession()
    setState({ isAuthenticated: false, isLoading: false, user: null, token: null })

    const params = new URLSearchParams({
      client_id: COGNITO_CLIENT_ID,
      logout_uri: COGNITO_REDIRECT_URI,
    })
    window.location.href = `https://${COGNITO_DOMAIN}/logout?${params.toString()}`
  }

  function setSession(token: string, user: AuthUser): void {
    setAuthToken(token)
    setState({ isAuthenticated: true, isLoading: false, user, token })
    saveSession(token, user)
  }

  async function signIn(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const response = await fetch(COGNITO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: COGNITO_CLIENT_ID,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    })

    if (!response.ok) {
      const errorBody = await parseCognitoError(response)
      if (errorBody.__type === 'NotAuthorizedException') {
        throw new Error('Incorrect email or password')
      }
      if (errorBody.__type === 'UserNotFoundException') {
        throw new Error('No account found with this email')
      }
      if (errorBody.__type === 'UserNotConfirmedException') {
        throw new Error('Please verify your email first')
      }
      throw new Error('Sign in failed. Please try again.')
    }

    const result = (await response.json()) as {
      AuthenticationResult: { IdToken: string; AccessToken: string; RefreshToken: string }
    }
    const idToken = result.AuthenticationResult.IdToken
    const payload = decodeIdToken(idToken)

    setAuthToken(idToken)

    const meResponse = await syncMe()
    if (!meResponse.success || !meResponse.data) {
      throw new Error(meResponse.error ?? 'Failed to sync client record')
    }

    const user: AuthUser = {
      clientId: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email.split('@')[0],
      plan: meResponse.data.plan,
    }

    setState({
      isAuthenticated: true,
      isLoading: false,
      user,
      token: idToken,
    })
    saveSession(idToken, user)

    return { token: idToken, user }
  }

  async function signUp(name: string, email: string, password: string): Promise<void> {
    const response = await fetch(COGNITO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.SignUp',
      },
      body: JSON.stringify({
        ClientId: COGNITO_CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'name', Value: name },
        ],
      }),
    })

    if (!response.ok) {
      const errorBody = await parseCognitoError(response)
      if (errorBody.__type === 'UsernameExistsException') {
        throw new Error('An account with this email already exists')
      }
      if (errorBody.__type === 'InvalidPasswordException') {
        throw new Error('Password does not meet requirements')
      }
      if (errorBody.__type === 'InvalidParameterException') {
        throw new Error('Please check your details and try again')
      }
      throw new Error(errorBody.message ?? 'Sign up failed. Please try again.')
    }

    // Cognito now emails a real verification code and leaves the user
    // UNCONFIRMED (see the signup email verification / OTP module) — no
    // auto-confirm or auto-sign-in here, since InitiateAuth would just reject
    // with UserNotConfirmedException until VerifyEmailPage's confirmSignup()
    // call succeeds. The caller (SignupPage) is responsible for routing the
    // user to /verify-email next.
  }

  return createElement(
    AuthContext.Provider,
    { value: { ...state, login, logout, handleCallback, signUp, signIn, setSession } },
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
