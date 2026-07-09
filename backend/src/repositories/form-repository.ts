import { v4 as uuidv4 } from 'uuid'
import { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { FormConfig } from '../types/index.js'

const TABLE_NAME = getTableName('forms')

export async function createForm(
  data: Omit<FormConfig, 'formId' | 'createdAt' | 'updatedAt'>
): Promise<FormConfig> {
  const now = new Date().toISOString()
  const record: FormConfig = { ...data, formId: uuidv4(), createdAt: now, updatedAt: now }

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
      `Failed to create form for client ${data.clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getFormById(formId: string, clientId: string): Promise<FormConfig | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { clientId, formId },
      })
    )
    return (result.Item as FormConfig | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get form ${formId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getPublicFormConfig(formId: string): Promise<FormConfig | null> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'formId-index',
        KeyConditionExpression: 'formId = :formId',
        ExpressionAttributeValues: { ':formId': formId },
        Limit: 1,
      })
    )
    const items = (result.Items as FormConfig[] | undefined) ?? []
    return items[0] ?? null
  } catch (error) {
    throw new Error(
      `Failed to get public form config ${formId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getFormsByClientId(clientId: string): Promise<FormConfig[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
      })
    )
    return (result.Items as FormConfig[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get forms for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function updateForm(
  formId: string,
  clientId: string,
  updates: Partial<Omit<FormConfig, 'formId' | 'clientId' | 'createdAt'>>
): Promise<FormConfig> {
  const now = new Date().toISOString()
  const fields: Record<string, unknown> = { ...updates, updatedAt: now }

  const updateExpressionParts: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    updateExpressionParts.push(`#${key} = :${key}`)
    expressionAttributeNames[`#${key}`] = key
    expressionAttributeValues[`:${key}`] = value
  }

  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { clientId, formId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    )
    return result.Attributes as FormConfig
  } catch (error) {
    throw new Error(
      `Failed to update form ${formId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function deleteForm(formId: string, clientId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { clientId, formId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to delete form ${formId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
