import { AdminConfirmSignUpCommand } from '@aws-sdk/client-cognito-identity-provider'
import { cognitoAdminClient } from '../lib/cognito-admin.js'

const userPoolId = process.env.COGNITO_USER_POOL_ID

if (!userPoolId) {
  throw new Error(
    'Missing required environment variable COGNITO_USER_POOL_ID. Set it in your .env file before starting the server.'
  )
}

interface CognitoServiceError {
  name?: string
  message?: string
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
