import { defineConfig } from 'vitest/config'

// Dummy values for env vars that are validated at module-import time
// (e.g. auth-service.ts's Cognito pool check) so importing a service under test
// doesn't throw before any test runs, even for services whose import graph
// reaches unrelated repositories.
//
// DYNAMODB_TABLE_PREFIX IS A SAFETY BOUNDARY, NOT A CONVENIENCE.
//
// Every table name resolves through lib/table-names.ts, which prefixes each one
// with this value. With `test-` set, an unmocked repository call in a test hits
// `test-leads` or `test-lead_events`, which do not exist, so the call fails and
// nothing is written anywhere real.
//
// Without it, unmocked calls hit PRODUCTION. That is not hypothetical: this file
// previously listed ~15 DYNAMODB_TABLE_* variables pointing at `test-*-table`
// names, and those were doing this job. When table names moved into code on
// 2026-08-16 those variables stopped being read, the boundary silently
// disappeared, and a test-suite run wrote 70 rows into the real lead_events
// table under fixture ids like `lead-1`. It was invisible because
// appendLeadEvent deliberately swallows its errors, so nothing failed.
//
// Do not remove this line. Mocking repositories per test file is still correct
// and still expected; this is the net for when someone forgets.
export default defineConfig({
  test: {
    environment: 'node',
    env: {
      AWS_REGION: 'ap-south-1',
      DYNAMODB_TABLE_PREFIX: 'test-',
      // Validated at module scope by openai-service.ts. A test that only
      // transitively imports it (any service reaching the agent turn handler)
      // would otherwise fail at import with a message about .env, which reads
      // like a broken setup rather than a missing mock.
      OPENAI_API_KEY: 'test-openai-key',
      COGNITO_USER_POOL_ID: 'test-pool-id',
      COGNITO_CLIENT_ID: 'test-client-id',
      JOURNEY_EXECUTOR_LAMBDA_ARN: 'arn:aws:lambda:ap-south-1:000000000000:function:test-journey-executor',
      SCHEDULER_TARGET_LAMBDA_ARN: 'arn:aws:lambda:ap-south-1:000000000000:function:test-scheduler-target',
      SCHEDULER_EXECUTION_ROLE_ARN: 'arn:aws:iam::000000000000:role/test-scheduler-execution-role',
      EMAIL_LOGO_URL: 'https://example.com/logo.png',
      ZOHO_CLIENT_ID: 'test-zoho-client-id',
      ZOHO_CLIENT_SECRET: 'test-zoho-client-secret',
      ZOHO_REDIRECT_URI: 'https://api.example.com/api/integrations/zoho/callback',
    },
  },
})
