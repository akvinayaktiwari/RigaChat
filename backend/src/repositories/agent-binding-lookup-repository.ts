import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { AgentBindingLookup } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('agent_binding_lookup')

export class AgentBindingConflictError extends Error {
  constructor(resourceId: string) {
    super(`Resource "${resourceId}" is already bound to a different Agent`)
    this.name = 'AgentBindingConflictError'
  }
}

// Reverse index from a bound channel resource (a chatbot's botId, a voice
// agent's agentId) to its owning Agent. Own table, not a GSI on `agents`,
// mirroring gupshup_app_lookup / meta_page_lookup: the resource id is the
// natural key, and binding a resource is an additive row.
//
// Atomic claim via ConditionExpression, not read-then-write: two binds racing
// on the same resource would otherwise both pass a read check before either
// writes. The condition lets the SAME Agent re-claim its own resource (so the
// one-client backfill is idempotent on re-run), but rejects any OTHER Agent --
// even one owned by the same client -- so a resource maps to exactly one Agent.
export async function claimAgentBinding(
  resourceId: string,
  agentId: string,
  clientId: string
): Promise<void> {
  const record: AgentBindingLookup = {
    resourceId,
    agentId,
    clientId,
    boundAt: new Date().toISOString(),
  }
  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME(),
        Item: record,
        ConditionExpression: 'attribute_not_exists(resourceId) OR agentId = :agentId',
        ExpressionAttributeValues: { ':agentId': agentId },
      })
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      throw new AgentBindingConflictError(resourceId)
    }
    throw new Error(
      `Failed to bind resource ${resourceId} to agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getAgentForResource(resourceId: string): Promise<AgentBindingLookup | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME(),
        Key: { resourceId },
      })
    )
    return (result.Item as AgentBindingLookup | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to look up agent for resource ${resourceId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function removeAgentBinding(resourceId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME(),
        Key: { resourceId },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to remove binding for resource ${resourceId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
