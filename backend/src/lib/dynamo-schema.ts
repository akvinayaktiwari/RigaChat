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
}

export function printTableDefinitions(): void {
  console.log(JSON.stringify(tableDefinitions, null, 2))
}
