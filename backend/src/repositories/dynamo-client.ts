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
  | 'audit_log'
  | 'webhook_events'
  | 'payment_history'
  | 'meta_leads'
  | 'meta_page_lookup'
  | 'journeys'
  | 'scheduled_actions'
  | 'journey_executions'
  | 'appointment_requests'
  | 'gupshup_app_lookup'
  | 'whatsapp_inbound_activity'
  | 'agents'
  | 'agent_binding_lookup'
  | 'journey_trigger_claims'
  | 'contact_messages'

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
  audit_log: 'DYNAMODB_TABLE_AUDIT_LOG',
  webhook_events: 'DYNAMODB_TABLE_WEBHOOK_EVENTS',
  payment_history: 'DYNAMODB_TABLE_PAYMENT_HISTORY',
  meta_leads: 'DYNAMODB_TABLE_META_LEADS',
  meta_page_lookup: 'DYNAMODB_TABLE_META_PAGE_LOOKUP',
  journeys: 'DYNAMODB_TABLE_JOURNEYS',
  scheduled_actions: 'DYNAMODB_TABLE_SCHEDULED_ACTIONS',
  journey_executions: 'DYNAMODB_TABLE_JOURNEY_EXECUTIONS',
  appointment_requests: 'DYNAMODB_TABLE_APPOINTMENT_REQUESTS',
  gupshup_app_lookup: 'DYNAMODB_TABLE_GUPSHUP_APP_LOOKUP',
  whatsapp_inbound_activity: 'DYNAMODB_TABLE_WHATSAPP_INBOUND_ACTIVITY',
  agents: 'DYNAMODB_TABLE_AGENTS',
  agent_binding_lookup: 'DYNAMODB_TABLE_AGENT_BINDING_LOOKUP',
  journey_trigger_claims: 'DYNAMODB_TABLE_JOURNEY_TRIGGER_CLAIMS',
  contact_messages: 'DYNAMODB_TABLE_CONTACT_MESSAGES',
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
