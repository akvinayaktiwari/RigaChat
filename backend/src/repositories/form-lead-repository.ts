import { v4 as uuidv4 } from 'uuid'
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { FormLead } from '../types/index.js'

const TABLE_NAME = getTableName('form_leads')

export async function createFormLead(data: Omit<FormLead, 'leadId' | 'createdAt'>): Promise<FormLead> {
  const record: FormLead = { ...data, leadId: uuidv4(), createdAt: new Date().toISOString() }

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
      `Failed to create form lead for form ${data.formId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getFormLeadsByFormId(formId: string, limit = 50): Promise<FormLead[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'formId = :formId',
        ExpressionAttributeValues: { ':formId': formId },
        ScanIndexForward: false,
        Limit: limit,
      })
    )
    return (result.Items as FormLead[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get form leads for form ${formId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getFormLeadsByClientId(clientId: string): Promise<FormLead[]> {
  try {
    const result = await dynamoClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'clientId-index',
        KeyConditionExpression: 'clientId = :clientId',
        ExpressionAttributeValues: { ':clientId': clientId },
        ScanIndexForward: false,
      })
    )
    return (result.Items as FormLead[] | undefined) ?? []
  } catch (error) {
    throw new Error(
      `Failed to get form leads for client ${clientId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getFormLeadById(formId: string, leadId: string): Promise<FormLead | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { formId, leadId },
      })
    )
    return (result.Item as FormLead | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to get form lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export interface FormLeadSyncStatus {
  crmSynced?: boolean
  crmSyncedAt?: string
  crmExternalId?: string
  crmSyncError?: string
  crmSyncAttempts?: number
}

export async function updateFormLeadSyncStatus(
  formId: string,
  leadId: string,
  status: FormLeadSyncStatus
): Promise<void> {
  const fields: Record<string, unknown> = { ...status, updatedAt: new Date().toISOString() }

  const updateExpressionParts: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    updateExpressionParts.push(`#${key} = :${key}`)
    expressionAttributeNames[`#${key}`] = key
    expressionAttributeValues[`:${key}`] = value
  }

  try {
    await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { formId, leadId },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to update sync status for form lead ${leadId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
