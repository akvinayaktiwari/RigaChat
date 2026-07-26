import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { PaymentRecord } from '../types/index.js'

const TABLE_NAME = getTableName('payment_history')

export async function logPayment(data: Omit<PaymentRecord, 'createdAt'>): Promise<PaymentRecord> {
  const record: PaymentRecord = { ...data, createdAt: new Date().toISOString() }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: record,
      })
    )
    return record
  } catch (error) {
    throw new Error(
      `Failed to log payment ${data.paymentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getPaymentHistory(accountId: string): Promise<PaymentRecord[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'accountId = :accountId',
        ExpressionAttributeValues: { ':accountId': accountId },
        ScanIndexForward: false,
      })
    )
    return (result.Items as PaymentRecord[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get payment history for ${accountId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
