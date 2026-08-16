import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const region = process.env.AWS_REGION

const baseClient = new DynamoDBClient({ region })

export const dynamoClient = DynamoDBDocumentClient.from(baseClient)

// Table names moved to lib/table-names.ts so voice-relay/server.ts, which is a
// separately built process with no DynamoDB document client, can share the same
// map instead of keeping its own copy. Re-exported here because ~30 repositories
// already import getTableName from this module and there is no reason to churn
// them. See lib/table-names.ts for why the names are code rather than 30
// environment variables.
export { getTableName, TABLE_NAMES, type TableKey } from '../lib/table-names.js'
