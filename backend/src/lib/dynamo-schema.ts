interface AttributeDefinition {
  AttributeName: string
  AttributeType: 'S' | 'N' | 'B'
}

interface KeySchemaElement {
  AttributeName: string
  KeyType: 'HASH' | 'RANGE'
}

interface GlobalSecondaryIndex {
  IndexName: string
  KeySchema: KeySchemaElement[]
  Projection: { ProjectionType: 'ALL' }
}

interface TableDefinition {
  TableName: string
  KeySchema: KeySchemaElement[]
  AttributeDefinitions: AttributeDefinition[]
  GlobalSecondaryIndexes?: GlobalSecondaryIndex[]
  BillingMode: 'PAY_PER_REQUEST'
}

export const tableDefinitions: Record<string, TableDefinition> = {
  clients: {
    TableName: 'DYNAMODB_TABLE_CLIENTS', // reads from process.env.DYNAMODB_TABLE_CLIENTS
    KeySchema: [{ AttributeName: 'clientId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'clientId', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'email-index',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },

  bots: {
    TableName: 'DYNAMODB_TABLE_BOTS', // reads from process.env.DYNAMODB_TABLE_BOTS
    KeySchema: [
      { AttributeName: 'clientId', KeyType: 'HASH' },
      { AttributeName: 'botId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'clientId', AttributeType: 'S' },
      { AttributeName: 'botId', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'botId-index',
        KeySchema: [{ AttributeName: 'botId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },

  leads: {
    TableName: 'DYNAMODB_TABLE_LEADS', // reads from process.env.DYNAMODB_TABLE_LEADS
    KeySchema: [
      { AttributeName: 'botId', KeyType: 'HASH' },
      { AttributeName: 'createdAt', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'botId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
      { AttributeName: 'clientId', AttributeType: 'S' },
      { AttributeName: 'leadId', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'clientId-index',
        KeySchema: [{ AttributeName: 'clientId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'leadId-index',
        KeySchema: [{ AttributeName: 'leadId', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },

  conversations: {
    TableName: 'DYNAMODB_TABLE_CONVERSATIONS', // reads from process.env.DYNAMODB_TABLE_CONVERSATIONS
    KeySchema: [
      { AttributeName: 'botId', KeyType: 'HASH' },
      { AttributeName: 'conversationId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'botId', AttributeType: 'S' },
      { AttributeName: 'conversationId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },

  knowledge_base: {
    TableName: 'DYNAMODB_TABLE_KB', // reads from process.env.DYNAMODB_TABLE_KB
    KeySchema: [
      { AttributeName: 'botId', KeyType: 'HASH' },
      { AttributeName: 'entryId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'botId', AttributeType: 'S' },
      { AttributeName: 'entryId', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },

  subscriptions: {
    TableName: 'DYNAMODB_TABLE_SUBSCRIPTIONS', // reads from process.env.DYNAMODB_TABLE_SUBSCRIPTIONS
    KeySchema: [{ AttributeName: 'accountId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'accountId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },

  // Payment-webhook idempotency dedup. TTL attribute `expiresAt` (Unix epoch
  // seconds, ~90 days out) must be enabled on this attribute after creation —
  // the TableDefinition type above has no TTL field since no other table
  // uses one yet, so it's noted here instead of modeled in the interface.
  webhook_events: {
    TableName: 'DYNAMODB_TABLE_WEBHOOK_EVENTS', // reads from process.env.DYNAMODB_TABLE_WEBHOOK_EVENTS
    KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'eventId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },

  // Durable payment ledger, separate from the subscriptions table (which only
  // holds current state, not history). One row per subscription.charged event.
  payment_history: {
    TableName: 'DYNAMODB_TABLE_PAYMENT_HISTORY', // reads from process.env.DYNAMODB_TABLE_PAYMENT_HISTORY
    KeySchema: [
      { AttributeName: 'accountId', KeyType: 'HASH' },
      { AttributeName: 'paidAt', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'accountId', AttributeType: 'S' },
      { AttributeName: 'paidAt', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },
}

export function printTableDefinitions(): void {
  console.log(JSON.stringify(tableDefinitions, null, 2))
}
