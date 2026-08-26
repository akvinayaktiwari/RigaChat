// Single source of truth for DynamoDB table names.
//
// WHY THIS IS CODE AND NOT 30 ENVIRONMENT VARIABLES
//   The Lambda has a hard 4KB limit on its environment. On 2026-08-10 it hit
//   that ceiling and a new table could not be added at all; space was bought
//   back by deleting three unrelated variables. Measured 2026-08-16:
//   rigachat-api was at 3597/4096 bytes, with 30 DYNAMODB_TABLE_* variables
//   consuming 1250 of them.
//
//   28 of those 30 carried no information. `DYNAMODB_TABLE_LEADS=leads` is the
//   key spelled twice. Only two differ: kb -> knowledge_base and
//   voice_kb -> voice_knowledge_base. So the map below IS the configuration,
//   and the variables were a 1250-byte restatement of it.
//
//   This is in tension with the project rule that external config lives in
//   environment variables, never hardcoded. DYNAMODB_TABLE_PREFIX is the
//   resolution: the genuinely environment-specific part (which deployment am I
//   talking to) stays in the environment, and the 28 redundant identity
//   mappings do not. A staging stack sets the prefix; nothing else changes.
//
// DELETION IS A SEPARATE, ORDERED STEP. See scripts/consolidate-table-env.sh.
// Shipping this file does not remove anything: the old variables simply stop
// being read. They must only be deleted AFTER this code is live and verified,
// because dynamo-client's previous getTableName threw on a missing variable and
// the backend is a single Lambda, so the reverse order is a full outage.
//
// Imported by voice-relay/server.ts too, which is a SEPARATE deployed process
// (npm run build:relay, its own bundle, port 3100, its own environment). It gets
// the same names from the same map rather than its own copy, so the two cannot
// drift. It carries no DynamoDB client dependency, which is why this lives in
// lib/ rather than in dynamo-client.ts.

export type TableKey =
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
  | 'journey_pending_replies'
  | 'contact_messages'
  | 'lead_state'
  | 'meta_deletion_requests'
  | 'voice_agents'
  | 'voice_call_logs'
  | 'voice_kb'
  | 'lead_events'
  | 'device_tokens'

// Verified against the live rigachat-api environment on 2026-08-16. Every value
// here is byte-identical to the variable it replaces; table-names.test.ts pins
// that, so a typo cannot silently repoint a table at something that does not
// exist. The two non-identity entries are called out because they are the only
// reason this map cannot be derived from the key.
export const TABLE_NAMES: Record<TableKey, string> = {
  clients: 'clients',
  bots: 'bots',
  leads: 'leads',
  conversations: 'conversations',
  kb: 'knowledge_base', // NOT identity
  forms: 'forms',
  form_leads: 'form_leads',
  subscriptions: 'subscriptions',
  usage: 'usage',
  audit_log: 'audit_log',
  webhook_events: 'webhook_events',
  payment_history: 'payment_history',
  meta_leads: 'meta_leads',
  meta_page_lookup: 'meta_page_lookup',
  journeys: 'journeys',
  scheduled_actions: 'scheduled_actions',
  journey_executions: 'journey_executions',
  appointment_requests: 'appointment_requests',
  gupshup_app_lookup: 'gupshup_app_lookup',
  whatsapp_inbound_activity: 'whatsapp_inbound_activity',
  agents: 'agents',
  agent_binding_lookup: 'agent_binding_lookup',
  journey_trigger_claims: 'journey_trigger_claims',
  journey_pending_replies: 'journey_pending_replies',
  contact_messages: 'contact_messages',
  lead_state: 'lead_state',
  meta_deletion_requests: 'meta_deletion_requests',
  voice_agents: 'voice_agents',
  voice_call_logs: 'voice_call_logs',
  voice_kb: 'voice_knowledge_base', // NOT identity
  lead_events: 'lead_events',
  device_tokens: 'device_tokens',
}

// Read per call rather than captured at module load, so a test can set it and
// so a Lambda whose environment changes between invocations picks it up without
// a cold start. Defaults to empty, which is production today.
export function getTableName(key: TableKey): string {
  return `${process.env.DYNAMODB_TABLE_PREFIX ?? ''}${TABLE_NAMES[key]}`
}
