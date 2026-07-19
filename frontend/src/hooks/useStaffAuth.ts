import { createContext, createElement, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export interface StaffUser {
  sub: string
  email: string
  name: string
}

interface StaffAuthState {
  isAuthenticated: boolean
  isLoading: boolean
  staffUser: StaffUser | null
  token: string | null
}

export interface MfaChallenge {
  needsMfa: true
  session: string
}

interface StaffAuthContextValue extends StaffAuthState {
  signIn: (email: string, password: string) => Promise<MfaChallenge>
  submitMfaCode: (session: string, code: string, email: string) => Promise<void>
  signOut: () => void
}

const StaffAuthContext = createContext<StaffAuthContextValue | undefined>(undefined)

const STAFF_CLIENT_ID = import.meta.env.VITE_STAFF_COGNITO_CLIENT_ID
const STAFF_REGION = import.meta.env.VITE_STAFF_COGNITO_REGION || 'ap-south-1'
const STAFF_COGNITO_API_URL = `https://cognito-idp.${STAFF_REGION}.amazonaws.com/`

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

// Fully separate sessionStorage key from useAuth.ts's 'bb_token'/'bb_user' —
// a staff session and a customer session must never collide or be readable
// from one another, mirroring the backend's isolated verifier instances.
const STAFF_SESSION_KEY = 'vyostra_staff_session'

interface StoredStaffSession {
  token: string
  staffUser: StaffUser
}

function saveStaffSession(token: string, staffUser: StaffUser): void {
  sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify({ token, staffUser }))
}

function clearStaffSession(): void {
  sessionStorage.removeItem(STAFF_SESSION_KEY)
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

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StaffAuthState>({
    isAuthenticated: false,
    isLoading: true,
    staffUser: null,
    token: null,
  })

  useEffect(() => {
    const raw = sessionStorage.getItem(STAFF_SESSION_KEY)
    if (raw) {
      try {
        const { token, staffUser } = JSON.parse(raw) as StoredStaffSession
        const payload = decodeIdToken(token)
        const now = Math.floor(Date.now() / 1000)

        if (payload.exp && payload.exp > now) {
          setState({ isAuthenticated: true, isLoading: false, staffUser, token })
          return
        }
      } catch {
        // Malformed saved session — fall through to clearing it below.
      }
      clearStaffSession()
    }

    setState((prev) => ({ ...prev, isLoading: false }))
  }, [])

  async function signIn(email: string, password: string): Promise<MfaChallenge> {
    const response = await fetch(STAFF_COGNITO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_AUTH',
        ClientId: STAFF_CLIENT_ID,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          PREFERRED_CHALLENGE: 'PASSWORD',
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await parseCognitoError(response)
      if (errorBody.__type === 'NotAuthorizedException') {
        throw new Error('Incorrect email or password')
      }
      if (errorBody.__type === 'UserNotFoundException') {
        throw new Error('No staff account found with this email')
      }
      throw new Error('Sign in failed. Please try again.')
    }

    const result = (await response.json()) as { ChallengeName?: string; Session?: string }

    if (result.ChallengeName === 'SOFTWARE_TOKEN_MFA' && result.Session) {
      return { needsMfa: true, session: result.Session }
    }

    if (result.ChallengeName === 'MFA_SETUP') {
      throw new Error('This staff account has no MFA registered. Contact an administrator before signing in.')
    }

    throw new Error('Unexpected sign-in response. Please try again.')
  }

  async function submitMfaCode(session: string, code: string, email: string): Promise<void> {
    const response = await fetch(STAFF_COGNITO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge',
      },
      body: JSON.stringify({
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        ClientId: STAFF_CLIENT_ID,
        Session: session,
        ChallengeResponses: {
          USERNAME: email,
          SOFTWARE_TOKEN_MFA_CODE: code,
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await parseCognitoError(response)
      if (errorBody.__type === 'CodeMismatchException') {
        throw new Error('Incorrect code. Please try again.')
      }
      if (errorBody.__type === 'ExpiredCodeException' || errorBody.__type === 'NotAuthorizedException') {
        throw new Error('This code has expired. Please sign in again.')
      }
      throw new Error('Verification failed. Please try again.')
    }

    const result = (await response.json()) as {
      AuthenticationResult?: { IdToken: string }
    }
    const idToken = result.AuthenticationResult?.IdToken
    if (!idToken) {
      throw new Error('Verification failed. Please try again.')
    }

    const payload = decodeIdToken(idToken)
    const staffUser: StaffUser = {
      sub: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email.split('@')[0],
    }

    setState({ isAuthenticated: true, isLoading: false, staffUser, token: idToken })
    saveStaffSession(idToken, staffUser)
  }

  function signOut(): void {
    clearStaffSession()
    setState({ isAuthenticated: false, isLoading: false, staffUser: null, token: null })
  }

  return createElement(
    StaffAuthContext.Provider,
    { value: { ...state, signIn, submitMfaCode, signOut } },
    children
  )
}

export function useStaffAuth(): StaffAuthContextValue {
  const ctx = useContext(StaffAuthContext)
  if (!ctx) {
    throw new Error('useStaffAuth must be used within a StaffAuthProvider')
  }
  return ctx
}
