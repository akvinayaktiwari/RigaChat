import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getTableName, TABLE_NAMES, type TableKey } from './table-names.js'

// The safety net for moving 30 table names out of the Lambda environment and
// into code. Every value below was read from the live rigachat-api environment
// on 2026-08-16. If someone edits TABLE_NAMES and mistypes an entry, the app
// would quietly start talking to a table that does not exist, and the failure
// would surface as an empty result or an AccessDenied rather than as anything
// naming the real cause. This test is what makes that impossible.
//
// When a table is genuinely renamed, update BOTH this map and TABLE_NAMES, and
// treat the diff as the thing to review.
const PRODUCTION_TABLE_NAMES: Record<TableKey, string> = {
  clients: 'clients',
  bots: 'bots',
  leads: 'leads',
  conversations: 'conversations',
  kb: 'knowledge_base',
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
  voice_kb: 'voice_knowledge_base',
  lead_events: 'lead_events',
}

// vitest.config.ts sets DYNAMODB_TABLE_PREFIX=test- as a safety boundary, so an
// unmocked repository call in any test hits a table that does not exist rather
// than production. This file is asserting the UNPREFIXED production names, so it
// clears the prefix for itself and restores it afterwards. Do not "simplify"
// this by dropping the prefix from the config: it is what stops a forgotten mock
// writing real rows.
const SUITE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX

beforeEach(() => {
  delete process.env.DYNAMODB_TABLE_PREFIX
})

afterEach(() => {
  if (SUITE_PREFIX === undefined) delete process.env.DYNAMODB_TABLE_PREFIX
  else process.env.DYNAMODB_TABLE_PREFIX = SUITE_PREFIX
})

describe('table name resolution', () => {
  it.each(Object.keys(PRODUCTION_TABLE_NAMES) as TableKey[])(
    'resolves %s to its production table name',
    (key) => {
      expect(getTableName(key)).toBe(PRODUCTION_TABLE_NAMES[key])
    }
  )

  // The two entries that are not just the key spelled twice. If either of these
  // regressed to the identity form, reads would silently hit a table that does
  // not exist, which is the whole reason the map cannot be derived from keys.
  it('keeps the two non-identity names', () => {
    expect(getTableName('kb')).toBe('knowledge_base')
    expect(getTableName('voice_kb')).toBe('voice_knowledge_base')
    expect(getTableName('kb')).not.toBe('kb')
    expect(getTableName('voice_kb')).not.toBe('voice_kb')
  })

  it('covers every key with no extras', () => {
    expect(Object.keys(TABLE_NAMES).sort()).toEqual(Object.keys(PRODUCTION_TABLE_NAMES).sort())
  })

  // The one piece of genuinely environment-specific configuration left. A
  // staging stack sets this; production leaves it unset.
  it('applies DYNAMODB_TABLE_PREFIX when set', () => {
    process.env.DYNAMODB_TABLE_PREFIX = 'staging_'

    expect(getTableName('leads')).toBe('staging_leads')
    expect(getTableName('kb')).toBe('staging_knowledge_base')
  })

  it('applies no prefix when unset, which is production', () => {
    expect(getTableName('leads')).toBe('leads')
  })

  // Read per call, not captured at module load, so a prefix change does not
  // need a cold start to take effect.
  it('reads the prefix per call rather than caching it', () => {
    expect(getTableName('bots')).toBe('bots')
    process.env.DYNAMODB_TABLE_PREFIX = 'x_'
    expect(getTableName('bots')).toBe('x_bots')
  })

  it('never returns an empty name', () => {
    for (const key of Object.keys(TABLE_NAMES) as TableKey[]) {
      expect(getTableName(key).length).toBeGreaterThan(0)
    }
  })
})
