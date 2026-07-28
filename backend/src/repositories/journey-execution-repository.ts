import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'

const TABLE_NAME = getTableName('journey_executions')

// Atomic: DynamoDB's ADD on a not-yet-existing item creates it with the
// operand as the starting value, so the first call for a given
// (leadId, stepId) pair returns 1, not a separate create-then-increment
// step that could race under concurrent Step Functions retries (the
// recheck Task has its own Retry policy in the compiled ASL).
export async function incrementWaitAndRecheckIteration(leadId: string, stepId: string): Promise<number> {
  try {
    const result = await dynamoClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { leadId, stepId },
        UpdateExpression: 'ADD iterationCount :one SET updatedAt = :now',
        ExpressionAttributeValues: { ':one': 1, ':now': new Date().toISOString() },
        ReturnValues: 'UPDATED_NEW',
      })
    )
    return (result.Attributes?.iterationCount as number | undefined) ?? 1
  } catch (error) {
    throw new Error(
      `Failed to increment wait_and_recheck iteration for lead ${leadId}, step ${stepId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
