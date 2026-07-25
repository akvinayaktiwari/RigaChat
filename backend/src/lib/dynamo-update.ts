import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient } from '../repositories/dynamo-client.js'

// Builds and sends a partial SET update for arbitrary fields, skipping any
// that are undefined, and always bumping updatedAt. Shared by every lead
// source's sync-status update (form-lead-repository.ts,
// meta-lead-repository.ts) -- the dynamic-UpdateExpression-from-a-partial-
// object pattern is identical regardless of table name or key shape.
export async function updatePartialFields(
  tableName: string,
  key: Record<string, string>,
  fields: Record<string, unknown>
): Promise<void> {
  const fieldsWithTimestamp: Record<string, unknown> = { ...fields, updatedAt: new Date().toISOString() }

  const updateExpressionParts: string[] = []
  const expressionAttributeNames: Record<string, string> = {}
  const expressionAttributeValues: Record<string, unknown> = {}

  for (const [fieldKey, value] of Object.entries(fieldsWithTimestamp)) {
    if (value === undefined) continue
    updateExpressionParts.push(`#${fieldKey} = :${fieldKey}`)
    expressionAttributeNames[`#${fieldKey}`] = fieldKey
    expressionAttributeValues[`:${fieldKey}`] = value
  }

  await dynamoClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  )
}
