import {
  AdminConfirmSignUpCommand,
  AdminGetUserCommand,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { cognitoAdminClient } from '../lib/cognito-admin.js'
import { tryAcquireQuickSignupAttempt } from '../repositories/redis-repository.js'
import { upsertClient } from './client-service.js'

const userPoolId = process.env.COGNITO_USER_POOL_ID
const clientId = process.env.COGNITO_CLIENT_ID

if (!userPoolId) {
  throw new Error(
    'Missing required environment variable COGNITO_USER_POOL_ID. Set it in your .env file before starting the server.'
  )
}

if (!clientId) {
  throw new Error(
    'Missing required environment variable COGNITO_CLIENT_ID. Set it in your .env file before starting the server.'
  )
}

interface CognitoServiceError {
  name?: string
  message?: string
}

export type QuickSignupErrorCode = 'EMAIL_EXISTS' | 'RATE_LIMITED' | 'INVALID_PASSWORD' | 'PROVIDER_ERROR'

export class QuickSignupError extends Error {
  code: QuickSignupErrorCode

  constructor(code: QuickSignupErrorCode, message: string) {
    super(message)
    this.name = 'QuickSignupError'
    this.code = code
  }
}

// Cognito auto-confirmation for the "skip email verification" signup flow.
// NotAuthorizedException covers "already confirmed" (harmless — the user can
// already sign in) and InvalidParameterException covers "no such user" (the
// signup itself failed upstream, nothing to confirm). Both are treated as a
// no-op success so the frontend's post-signup signIn() call isn't blocked by
// a confirmation error that doesn't actually indicate a problem.
export async function confirmSignup(username: string): Promise<void> {
  try {
    await cognitoAdminClient.send(
      new AdminConfirmSignUpCommand({
        UserPoolId: userPoolId,
        Username: username,
      })
    )
  } catch (err) {
    const error = err as CognitoServiceError
    if (error.name === 'NotAuthorizedException' || error.name === 'InvalidParameterException') {
      return
    }
    throw new Error(`Failed to confirm signup for ${username}: ${error.message ?? String(err)}`)
  }
}

export interface QuickSignupResult {
  token: string
  user: {
    clientId: string
    email: string
    name: string
    plan: string
  }
}

// Checked before SignUp as the primary "does this email already have an
// account" signal — AdminGetUser is a direct lookup, not inferred from a
// SignUp failure. UserNotFoundException is the only expected miss; anything
// else here is a real Cognito/provider problem, not "email is free."
async function emailExists(email: string): Promise<boolean> {
  try {
    await cognitoAdminClient.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }))
    return true
  } catch (err) {
    const error = err as CognitoServiceError
    if (error.name === 'UserNotFoundException') {
      return false
    }
    throw new QuickSignupError('PROVIDER_ERROR', `Failed to check existing account: ${error.message ?? String(err)}`)
  }
}

// Public-facing, unauthenticated signup for the landing-page checkout flow:
// SignUp -> auto-confirm (reuses confirmSignup() above) -> upsertClient ->
// sign in, all server-side so the caller gets back a ready-to-use session in
// one call. Rate-limited per IP (1 attempt / QUICK_SIGNUP_RATE_LIMIT_SECONDS,
// see redis-repository.ts) since this is an unauthenticated account-creation
// endpoint.
export async function quickSignup(email: string, password: string, ip: string): Promise<QuickSignupResult> {
  const acquired = await tryAcquireQuickSignupAttempt(ip, email)
  if (!acquired) {
    throw new QuickSignupError('RATE_LIMITED', 'Too many signup attempts. Please wait a moment and try again.')
  }

  if (await emailExists(email)) {
    throw new QuickSignupError('EMAIL_EXISTS', 'An account with this email already exists.')
  }

  // The user pool's schema requires a `name` attribute (confirmed live — the
  // existing frontend signUp() in useAuth.ts always sends one too, since a
  // request without it is rejected with "Attributes did not conform to the
  // schema: name.formatted"). quick-signup's request body is email+password
  // only, so this derives a placeholder the same way client-service.ts and
  // client-routes.ts already do for a missing name (email local-part).
  const derivedName = email.split('@')[0]

  let userSub: string
  try {
    const signUpResult = await cognitoAdminClient.send(
      new SignUpCommand({
        ClientId: clientId,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'name', Value: derivedName },
        ],
      })
    )
    if (!signUpResult.UserSub) {
      throw new QuickSignupError('PROVIDER_ERROR', 'Signup succeeded but no user id was returned.')
    }
    userSub = signUpResult.UserSub
  } catch (err) {
    if (err instanceof QuickSignupError) throw err
    const error = err as CognitoServiceError
    if (error.name === 'UsernameExistsException') {
      throw new QuickSignupError('EMAIL_EXISTS', 'An account with this email already exists.')
    }
    if (error.name === 'InvalidPasswordException') {
      throw new QuickSignupError('INVALID_PASSWORD', 'Password does not meet requirements.')
    }
    throw new QuickSignupError('PROVIDER_ERROR', `Signup failed: ${error.message ?? String(err)}`)
  }

  await confirmSignup(email)

  const client = await upsertClient({
    clientId: userSub,
    email,
    name: derivedName,
    authProvider: 'email',
  })

  try {
    const authResult = await cognitoAdminClient.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      })
    )
    const idToken = authResult.AuthenticationResult?.IdToken
    if (!idToken) {
      throw new QuickSignupError('PROVIDER_ERROR', 'Signed up but sign-in returned no token.')
    }

    return {
      token: idToken,
      user: { clientId: userSub, email, name: client.name, plan: client.plan },
    }
  } catch (err) {
    if (err instanceof QuickSignupError) throw err
    const error = err as CognitoServiceError
    throw new QuickSignupError('PROVIDER_ERROR', `Signed up but sign-in failed: ${error.message ?? String(err)}`)
  }
}

export class ForgotPasswordError extends Error {
  code: 'RATE_LIMITED'

  constructor(message: string) {
    super(message)
    this.name = 'ForgotPasswordError'
    this.code = 'RATE_LIMITED'
  }
}

// Enumeration-safe: UserNotFoundException is swallowed so the caller always
// sees the same outcome whether or not the email has an account. Cognito's
// own LimitExceededException is a real user-facing state (not an enumeration
// leak, since it fires for any email once the pool-wide/IP throttle is hit)
// so it's re-thrown for the route to map to 429. Anything else propagates as
// a genuine provider error.
export async function forgotPassword(email: string): Promise<void> {
  try {
    await cognitoAdminClient.send(new ForgotPasswordCommand({ ClientId: clientId, Username: email }))
  } catch (err) {
    const error = err as CognitoServiceError
    if (error.name === 'UserNotFoundException') return
    if (error.name === 'LimitExceededException') {
      throw new ForgotPasswordError('Too many requests. Please wait a moment and try again.')
    }
    throw new Error(`Failed to initiate password reset: ${error.message ?? String(err)}`)
  }
}

export type ConfirmForgotPasswordErrorCode = 'INVALID_CODE' | 'CODE_EXPIRED' | 'INVALID_PASSWORD' | 'PROVIDER_ERROR'

export class ConfirmForgotPasswordError extends Error {
  code: ConfirmForgotPasswordErrorCode

  constructor(code: ConfirmForgotPasswordErrorCode, message: string) {
    super(message)
    this.name = 'ConfirmForgotPasswordError'
    this.code = code
  }
}

function mapConfirmForgotPasswordError(err: unknown): ConfirmForgotPasswordError {
  const error = err as CognitoServiceError
  switch (error.name) {
    case 'CodeMismatchException':
      return new ConfirmForgotPasswordError('INVALID_CODE', 'Invalid code')
    case 'ExpiredCodeException':
      return new ConfirmForgotPasswordError('CODE_EXPIRED', 'Code expired, request a new one')
    case 'InvalidPasswordException':
      return new ConfirmForgotPasswordError('INVALID_PASSWORD', error.message ?? 'Password does not meet requirements.')
    default:
      return new ConfirmForgotPasswordError('PROVIDER_ERROR', `Failed to reset password: ${error.message ?? String(err)}`)
  }
}

export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  try {
    await cognitoAdminClient.send(
      new ConfirmForgotPasswordCommand({
        ClientId: clientId,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
      })
    )
  } catch (err) {
    throw mapConfirmForgotPasswordError(err)
  }
}
