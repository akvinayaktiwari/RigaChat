import { v4 as uuidv4 } from 'uuid'
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { AppointmentRequest } from '../types/index.js'

const TABLE_NAME = getTableName('appointment_requests')

export async function createAppointmentRequest(
  data: Omit<AppointmentRequest, 'requestId' | 'status' | 'createdAt'> & { status?: AppointmentRequest['status'] }
): Promise<AppointmentRequest> {
  const record: AppointmentRequest = {
    ...data,
    requestId: uuidv4(),
    status: data.status ?? 'requested',
    createdAt: new Date().toISOString(),
  }

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
      `Failed to create appointment request for bot ${data.botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getAppointmentRequestsByBotId(botId: string): Promise<AppointmentRequest[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'botId = :botId',
        ExpressionAttributeValues: { ':botId': botId },
      })
    )
    return (result.Items as AppointmentRequest[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get appointment requests for bot ${botId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
