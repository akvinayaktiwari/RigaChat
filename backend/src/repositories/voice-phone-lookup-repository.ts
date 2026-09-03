import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamoClient, getTableName } from './dynamo-client.js'
import type { VoicePhoneLookup } from '../types/index.js'

const TABLE_NAME = (): string => getTableName('voice_phone_lookup')

export class VoicePhoneConflictError extends Error {
  constructor(phoneNumber: string) {
    super(`Phone number "${phoneNumber}" is already assigned to a different voice agent`)
    this.name = 'VoicePhoneConflictError'
  }
}

// Plivo does not guarantee one spelling of the dialled number: the answer
// webhook and the media stream have been observed carrying `+919876543210`,
// `919876543210`, and (for some carriers) a leading `00`. The partition key is
// an exact-match lookup, so an unnormalised write and a normalised read miss
// each other and the call is silently unroutable -- the caller hears nothing
// and no row is ever consulted. Every read and write in this module goes
// through here so the two can never disagree.
//
//   +91 98765 43210  ->  +919876543210
//   919876543210     ->  +919876543210
//   0091 9876543210  ->  +919876543210
//
// Anything that is not a plausible E.164 body after stripping is rejected
// loudly rather than stored, because a malformed key is a row nobody can ever
// read back.
export function normalisePhoneNumber(raw: string): string {
  const trimmed = raw.trim()
  const withoutPrefix = trimmed.startsWith('+')
    ? trimmed.slice(1)
    : trimmed.startsWith('00')
      ? trimmed.slice(2)
      : trimmed
  const digits = withoutPrefix.replace(/[\s\-().]/g, '')

  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new Error(
      `Invalid phone number "${raw}": expected 8-15 digits in E.164 form after normalisation, got "${digits}"`
    )
  }

  return `+${digits}`
}

// Atomic claim via ConditionExpression rather than read-then-write: two
// assignments racing on the same number would otherwise both pass a read check
// before either writes, and the loser's agent would silently stop receiving
// calls it believes it owns. The condition lets the SAME agent re-claim its own
// number (so re-running an assignment is idempotent) but rejects any other
// agent, including one owned by the same client.
//
// assignedAt is written on every successful claim including a re-claim. Unlike
// meta_page_lookup's connectedAt it is not a GSI sort key and nothing orders on
// it, so a refreshed timestamp on re-assignment is harmless rather than a
// silent reordering.
export async function claimPhoneNumber(
  phoneNumber: string,
  agentId: string,
  clientId: string
): Promise<void> {
  const normalised = normalisePhoneNumber(phoneNumber)
  const record: VoicePhoneLookup = {
    phoneNumber: normalised,
    agentId,
    clientId,
    assignedAt: new Date().toISOString(),
  }

  try {
    await dynamoClient.send(
      new PutCommand({
        TableName: TABLE_NAME(),
        Item: record,
        ConditionExpression: 'attribute_not_exists(phoneNumber) OR agentId = :agentId',
        ExpressionAttributeValues: { ':agentId': agentId },
      })
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      throw new VoicePhoneConflictError(normalised)
    }
    throw new Error(
      `Failed to assign phone number ${normalised} to voice agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// The read on the inbound-call hot path. Returns null for a number nobody has
// claimed, which the caller must treat as "reject this call" -- never as a
// reason to fall back to some default agent, which would route a stranger's
// call to an arbitrary client's bot.
export async function getAgentForPhoneNumber(phoneNumber: string): Promise<VoicePhoneLookup | null> {
  const normalised = normalisePhoneNumber(phoneNumber)

  try {
    const result = await dynamoClient.send(
      new GetCommand({
        TableName: TABLE_NAME(),
        Key: { phoneNumber: normalised },
      })
    )
    return (result.Item as VoicePhoneLookup | undefined) ?? null
  } catch (error) {
    throw new Error(
      `Failed to look up voice agent for phone number ${normalised}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function releasePhoneNumber(phoneNumber: string): Promise<void> {
  const normalised = normalisePhoneNumber(phoneNumber)

  try {
    await dynamoClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME(),
        Key: { phoneNumber: normalised },
      })
    )
  } catch (error) {
    throw new Error(
      `Failed to release phone number ${normalised}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
