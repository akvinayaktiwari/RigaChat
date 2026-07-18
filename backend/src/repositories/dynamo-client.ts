import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const region = process.env.AWS_REGION

const baseClient = new DynamoDBClient({ region })

export const dynamoClient = DynamoDBDocumentClient.from(baseClient)

type TableKey =
  | 'clients'
  | 'bots'
  | 'leads'
  | 'conversations'
  | 'kb'
  | 'forms'
  | 'form_leads'
  | 'subscriptions'
  | 'usage'

const tableEnvVarNames: Record<TableKey, string> = {
  clients: 'DYNAMODB_TABLE_CLIENTS',
  bots: 'DYNAMODB_TABLE_BOTS',
  leads: 'DYNAMODB_TABLE_LEADS',
  conversations: 'DYNAMODB_TABLE_CONVERSATIONS',
  kb: 'DYNAMODB_TABLE_KB',
  forms: 'DYNAMODB_TABLE_FORMS',
  form_leads: 'DYNAMODB_TABLE_FORM_LEADS',
  subscriptions: 'DYNAMODB_TABLE_SUBSCRIPTIONS',
  usage: 'DYNAMODB_TABLE_USAGE',
}

export function getTableName(key: TableKey): string {
  const envVarName = tableEnvVarNames[key]
  const tableName = process.env[envVarName]

  if (!tableName) {
    throw new Error(
      `Missing required environment variable ${envVarName}. Set it in your .env file before starting the server.`
    )
  }

  return tableName
}
