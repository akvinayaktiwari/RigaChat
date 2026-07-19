import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { AuditEntry } from '../types/index.js'

const TABLE_NAME = getTableName('audit_log')

export async function writeAuditEntry(entry: AuditEntry): Promise<void> {
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: entry,
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to write audit entry for ${entry.accountId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getAuditHistory(accountId: string): Promise<AuditEntry[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'accountId = :accountId',
        ExpressionAttributeValues: { ':accountId': accountId },
        ScanIndexForward: false,
      })
    )
    return (result.Items as AuditEntry[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get audit history for ${accountId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
