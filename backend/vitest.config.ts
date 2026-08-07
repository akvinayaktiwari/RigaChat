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
      DYNAMODB_TABLE_LEAD_STATE: 'test-lead-state-table',
      DYNAMODB_TABLE_SUBSCRIPTIONS: 'test-subscriptions-table',
      DYNAMODB_TABLE_JOURNEYS: 'test-journeys-table',
      JOURNEY_EXECUTOR_LAMBDA_ARN: 'arn:aws:lambda:ap-south-1:000000000000:function:test-journey-executor',
      DYNAMODB_TABLE_SCHEDULED_ACTIONS: 'test-scheduled-actions-table',
      SCHEDULER_TARGET_LAMBDA_ARN: 'arn:aws:lambda:ap-south-1:000000000000:function:test-scheduler-target',
      SCHEDULER_EXECUTION_ROLE_ARN: 'arn:aws:iam::000000000000:role/test-scheduler-execution-role',
      DYNAMODB_TABLE_JOURNEY_EXECUTIONS: 'test-journey-executions-table',
      DYNAMODB_TABLE_PAYMENT_HISTORY: 'test-payment-history-table',
      DYNAMODB_TABLE_WEBHOOK_EVENTS: 'test-webhook-events-table',
      DYNAMODB_TABLE_GUPSHUP_APP_LOOKUP: 'test-gupshup-app-lookup-table',
      DYNAMODB_TABLE_WHATSAPP_INBOUND_ACTIVITY: 'test-whatsapp-inbound-activity-table',
      EMAIL_LOGO_URL: 'https://example.com/logo.png',
    },
  },
})
