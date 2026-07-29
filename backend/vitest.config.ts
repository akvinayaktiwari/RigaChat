import { defineConfig } from 'vitest/config'

// Dummy values for env vars that are validated at module-import time
// (e.g. dynamo-client.ts's getTableName(), auth-service.ts's Cognito pool
// check) so importing a service under test doesn't throw before any test
// runs, even for services whose import graph reaches unrelated repositories.
export default defineConfig({
  test: {
    environment: 'node',
    env: {
      AWS_REGION: 'ap-south-1',
      COGNITO_USER_POOL_ID: 'test-pool-id',
      COGNITO_CLIENT_ID: 'test-client-id',
      DYNAMODB_TABLE_CLIENTS: 'test-clients-table',
      DYNAMODB_TABLE_SUBSCRIPTIONS: 'test-subscriptions-table',
      EMAIL_LOGO_URL: 'https://example.com/logo.png',
    },
  },
})
