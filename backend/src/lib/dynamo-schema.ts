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

  // Meta Lead Ads submissions. Partition key is clientId (not pageId) since
  // the dashboard always reads "all of this client's Meta leads" -- pageId
  // is looked up separately via meta_page_lookup, then only used to resolve
  // clientId, never to query leads directly.
  //
  // Range key is leadId (a generated UUID), NOT createdAt: two submissions
  // for the same client in the same millisecond are plausible under real ad
  // traffic, and an ISO-timestamp range key would let the second overwrite
  // the first with zero error (matches form_leads' leadId-as-range-key
  // choice, not the plain leads table's createdAt-keyed pattern). The
  // clientId-createdAt-index GSI below provides chronological listing,
  // since the primary key's range (leadId) doesn't sort by time.
  meta_leads: {
    TableName: 'DYNAMODB_TABLE_META_LEADS', // reads from process.env.DYNAMODB_TABLE_META_LEADS
    KeySchema: [
      { AttributeName: 'clientId', KeyType: 'HASH' },
      { AttributeName: 'leadId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'clientId', AttributeType: 'S' },
      { AttributeName: 'leadId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'clientId-createdAt-index',
        KeySchema: [
          { AttributeName: 'clientId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
  },

  // pageId -> clientId lookup for routing the shared app-level Meta webhook.
  // One row per connected Page today (MVP: one Page per client), but keyed
  // by pageId (not embedded on clients) so a client connecting a second Page
  // later is an additive new row, not a schema change.
  meta_page_lookup: {
    TableName: 'DYNAMODB_TABLE_META_PAGE_LOOKUP', // reads from process.env.DYNAMODB_TABLE_META_PAGE_LOOKUP
    KeySchema: [{ AttributeName: 'pageId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'pageId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
  },

  // Marketing-site contact form submissions (public /contact page). Partition
  // key is the generated messageId, not the submitter's email: the same person
  // may legitimately write twice, and an email-keyed row would let the second
  // message silently overwrite the first.
  //
  // The GSI's partition key is the constant `recordType` attribute so the ops
  // console can list submissions newest-first with a Query instead of a Scan.
  // A constant GSI partition key is normally a hot-partition mistake — it is
  // deliberate and safe here because writes come from one landing page's
  // contact form (single-digit per day), nowhere near the 1000 WCU/partition
  // ceiling. Do NOT copy this shape for anything on the bot/lead traffic path.
  contact_messages: {
    TableName: 'DYNAMODB_TABLE_CONTACT_MESSAGES', // reads from process.env.DYNAMODB_TABLE_CONTACT_MESSAGES
    KeySchema: [{ AttributeName: 'messageId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'messageId', AttributeType: 'S' },
      { AttributeName: 'recordType', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'recordType-createdAt-index',
        KeySchema: [
          { AttributeName: 'recordType', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
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
