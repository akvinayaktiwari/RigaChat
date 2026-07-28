import { test, expect } from '@playwright/test'
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from '@aws-sdk/client-cognito-identity-provider'

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION })
const userPoolId = process.env.COGNITO_USER_POOL_ID

// The real "does the whole product work" flow: an anonymous visitor lands on
// the homepage, signs up through the quick-signup modal (no email round trip
// -- see quickSignup() in auth-service.ts), and lands on their dashboard with
// a working session. This is the flow every other feature sits behind.
test('visitor can sign up from the homepage and reach the dashboard', async ({ page }) => {
  const email = `e2e-signup-${Date.now()}@example.com`
  const password = 'TestPass123!'

  await page.goto('/')
  await page.getByRole('button', { name: 'Start free trial' }).first().click()

  // Scoped to the modal's <form> (identified by the password field it
  // contains) since the landing page behind the modal has its own elements
  // with overlapping accessible names -- an "Email support" footer button
  // (substring-matches getByLabel('Email')) and a CTA button with this same
  // "Start free trial" text.
  const modalForm = page.locator('form').filter({ has: page.getByLabel('Password', { exact: true }) })
  await modalForm.getByLabel('Email', { exact: true }).fill(email)
  await modalForm.getByLabel('Password', { exact: true }).fill(password)
  await modalForm.getByRole('button', { name: 'Start free trial' }).click()

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Leads' })).toBeVisible()

  if (userPoolId) {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email }))
  }
})
