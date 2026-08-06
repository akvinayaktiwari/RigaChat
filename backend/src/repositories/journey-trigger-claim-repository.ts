import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { JourneyTriggerClaim, JourneyTriggerType } from '../types/index.js'

export class JourneyTriggerConflictError extends Error {
  constructor(
    readonly claimKey: string,
    readonly heldByBundleId: string
  ) {
    super(`Another published journey already handles this trigger (bundle ${heldByBundleId})`)
    this.name = 'JourneyTriggerConflictError'
  }
}

// Exactly one published bundle may own a given (Agent, trigger) pair. Its own
// table rather than a GSI on `journeys`, and an atomic conditional put rather
// than query-then-write -- the third instance of the pattern proven by
// gupshup_app_lookup and agent_binding_lookup. Codex's review of this design
// was right that "check whether another bundle has this trigger, then publish"
// cannot be made atomic by querying: two concurrent publishes would both pass
// the read before either wrote, and both would go live.
//
// Scope key is the Agent when the bot is wrapped in one, otherwise the bot.
// Prefixed so an agentId can never be mistaken for a botId.
export function triggerClaimKey(scope: { agentId?: string; botId: string }, triggerType: JourneyTriggerType): string {
  return scope.agentId ? `agent:${scope.agentId}#${triggerType}` : `bot:${scope.botId}#${triggerType}`
}

// Lets the SAME bundle re-claim its own trigger, so republishing is idempotent,
// while rejecting any other bundle. The rejection is not an error state to be
// swallowed -- it is the signal the route turns into an explicit "this would
// replace your current lead-captured journey" decision for the client.
export async function claimJourneyTrigger(
  claimKey: string,
  claim: Omit<JourneyTriggerClaim, 'claimKey' | 'claimedAt'>
): Promise<void> {
  const record: JourneyTriggerClaim = { ...claim, claimKey, claimedAt: new Date().toISOString() }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: getTableName('journey_trigger_claims'),
        Item: record,
        ConditionExpression: 'attribute_not_exists(claimKey) OR bundleId = :bundleId',
        ExpressionAttributeValues: { ':bundleId': claim.bundleId },
      })
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      const existing = await getJourneyTriggerClaim(claimKey)
      throw new JourneyTriggerConflictError(claimKey, existing?.bundleId ?? 'unknown')
    }
    throw new Error(
      `Failed to claim trigger ${claimKey}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function getJourneyTriggerClaim(claimKey: string): Promise<JourneyTriggerClaim | null> {
  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: getTableName('journey_trigger_claims'),
        Key: { claimKey },
      })
    )
    return (result.Item as JourneyTriggerClaim | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to read trigger claim ${claimKey}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Conditional on the releasing bundle actually being the holder, so deleting
// bundle A can never release a trigger that bundle B has since taken over.
// A missing row is success: releasing a trigger nobody holds is the desired
// end state, not a failure.
export async function releaseJourneyTrigger(claimKey: string, bundleId: string): Promise<void> {
  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: getTableName('journey_trigger_claims'),
        Key: { claimKey },
        ConditionExpression: 'attribute_not_exists(claimKey) OR bundleId = :bundleId',
        ExpressionAttributeValues: { ':bundleId': bundleId },
      })
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return
    throw new Error(
      `Failed to release trigger ${claimKey}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
