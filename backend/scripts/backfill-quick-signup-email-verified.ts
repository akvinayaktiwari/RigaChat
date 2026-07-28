// One-time backfill: sets email_verified=true for every existing Cognito
// user who is CONFIRMED but whose email attribute was never actually
// verified.
//
// This state is only reachable through quickSignup()'s AdminConfirmSignUpCommand
// force-confirm path (auth-service.ts) -- the real signup path always
// verifies email as part of confirming with the emailed code. Those users
// were left unable to use "forgot password", since Cognito's ForgotPassword
// API refuses to send a reset code when there is no verified email or phone
// on the account. confirmSignup() now sets email_verified itself going
// forward; this script fixes up accounts created before that change.
//
// Safe to re-run -- users who already have email_verified=true are skipped,
// so a second run (e.g. after a partial failure) creates zero additional
// writes.
//
// Run manually from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm scripts/backfill-quick-signup-email-verified.ts

import {
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { cognitoAdminClient } from '../src/lib/cognito-admin.js'

const userPoolId = process.env.COGNITO_USER_POOL_ID

if (!userPoolId) {
  throw new Error('Missing required environment variable COGNITO_USER_POOL_ID. Set it in your .env file first.')
}

async function listAllUsers(): Promise<UserType[]> {
  const users: UserType[] = []
  let paginationToken: string | undefined

  do {
    const result = await cognitoAdminClient.send(
      new ListUsersCommand({ UserPoolId: userPoolId, PaginationToken: paginationToken })
    )
    users.push(...(result.Users ?? []))
    paginationToken = result.PaginationToken
  } while (paginationToken)

  return users
}

function isEmailVerified(user: UserType): boolean {
  return user.Attributes?.find((attr) => attr.Name === 'email_verified')?.Value === 'true'
}

async function main(): Promise<void> {
  console.log('Scanning Cognito user pool...')
  const users = await listAllUsers()
  console.log(`Found ${users.length} user(s).`)

  let updated = 0
  let skipped = 0
  const errors: { username: string; error: string }[] = []

  for (const user of users) {
    const username = user.Username
    if (!username) {
      skipped++
      continue
    }

    if (user.UserStatus !== 'CONFIRMED' || isEmailVerified(user)) {
      skipped++
      continue
    }

    try {
      await cognitoAdminClient.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: username,
          UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
        })
      )
      updated++
    } catch (error) {
      errors.push({ username, error: error instanceof Error ? error.message : String(error) })
    }
  }

  console.log('\n=== Backfill summary ===')
  console.log(`Total users scanned: ${users.length}`)
  console.log(`email_verified set to true: ${updated}`)
  console.log(`Skipped (already verified, unconfirmed, or no username): ${skipped}`)
  console.log(`Errors: ${errors.length}`)
  if (errors.length > 0) {
    for (const { username, error } of errors) {
      console.log(`  - ${username}: ${error}`)
    }
  }
}

main().catch((error) => {
  console.error('Backfill script failed to run:', error)
  process.exit(1)
})
