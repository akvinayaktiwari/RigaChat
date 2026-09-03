import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the DynamoDB boundary. getTableName also runs at module load, so it is
// stubbed here to avoid depending on the prefix vitest.config.ts sets.
const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-voice-phone-lookup',
}))

const {
  claimPhoneNumber,
  getAgentForPhoneNumber,
  releasePhoneNumber,
  normalisePhoneNumber,
  VoicePhoneConflictError,
} = await import('./voice-phone-lookup-repository.js')

function conditionalCheckFailed(): Error {
  const err = new Error('The conditional request failed')
  err.name = 'ConditionalCheckFailedException'
  return err
}

beforeEach(() => {
  send.mockReset()
})

describe('normalisePhoneNumber', () => {
  // The whole point of the function: every spelling Plivo has been observed to
  // send must collapse to ONE key, or a write and a read miss each other and
  // the call is silently unroutable.
  it.each([
    ['+919876543210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['00919876543210', '+919876543210'],
    ['+91 98765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['  +919876543210  ', '+919876543210'],
    ['+1 (415) 555-0132', '+14155550132'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalisePhoneNumber(input)).toBe(expected)
  })

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
    ['notaphone', 'letters'],
    ['+91987', 'too short'],
    ['+9198765432101234567', 'too long'],
    ['+0919876543210', 'leading zero after normalisation'],
  ])('rejects %s (%s) rather than storing an unreadable key', (input) => {
    expect(() => normalisePhoneNumber(input)).toThrow(/Invalid phone number/)
  })
})

describe('claimPhoneNumber', () => {
  it('writes an atomic claim so a number maps to at most one voice agent', async () => {
    send.mockResolvedValueOnce({})

    await claimPhoneNumber('+919876543210', 'agent-1', 'client-1')

    expect(send).toHaveBeenCalledTimes(1)
    const command = send.mock.calls[0][0]
    expect(command.input.TableName).toBe('test-voice-phone-lookup')
    expect(command.input.Item).toMatchObject({
      phoneNumber: '+919876543210',
      agentId: 'agent-1',
      clientId: 'client-1',
    })
    expect(command.input.Item.assignedAt).toEqual(expect.any(String))
    expect(command.input.ConditionExpression).toBe(
      'attribute_not_exists(phoneNumber) OR agentId = :agentId'
    )
    expect(command.input.ExpressionAttributeValues).toEqual({ ':agentId': 'agent-1' })
  })

  it('stores the normalised number, not the raw one, so the webhook read can find it', async () => {
    send.mockResolvedValueOnce({})

    await claimPhoneNumber('91 98765 43210', 'agent-1', 'client-1')

    expect(send.mock.calls[0][0].input.Item.phoneNumber).toBe('+919876543210')
  })

  it('throws VoicePhoneConflictError when another agent already owns the number', async () => {
    send.mockRejectedValueOnce(conditionalCheckFailed())

    await expect(claimPhoneNumber('+919876543210', 'agent-2', 'client-2')).rejects.toBeInstanceOf(
      VoicePhoneConflictError
    )
  })

  it('surfaces non-conflict DynamoDB failures as a distinct error', async () => {
    send.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'))

    await expect(claimPhoneNumber('+919876543210', 'agent-1', 'client-1')).rejects.toThrow(
      /Failed to assign phone number/
    )
  })

  it('rejects an invalid number before touching DynamoDB', async () => {
    await expect(claimPhoneNumber('notaphone', 'agent-1', 'client-1')).rejects.toThrow(
      /Invalid phone number/
    )
    expect(send).not.toHaveBeenCalled()
  })
})

describe('getAgentForPhoneNumber', () => {
  it('returns the owning agent for a claimed number', async () => {
    send.mockResolvedValueOnce({
      Item: {
        phoneNumber: '+919876543210',
        agentId: 'agent-1',
        clientId: 'client-1',
        assignedAt: '2026-09-03T00:00:00.000Z',
      },
    })

    const result = await getAgentForPhoneNumber('+919876543210')

    expect(result).toEqual({
      phoneNumber: '+919876543210',
      agentId: 'agent-1',
      clientId: 'client-1',
      assignedAt: '2026-09-03T00:00:00.000Z',
    })
    expect(send.mock.calls[0][0].input.Key).toEqual({ phoneNumber: '+919876543210' })
  })

  // An unclaimed number must read as null so the webhook handler rejects the
  // call. Falling back to any default agent would route a stranger's call into
  // an arbitrary client's bot.
  it('returns null for a number nobody has claimed', async () => {
    send.mockResolvedValueOnce({})

    await expect(getAgentForPhoneNumber('+919876543210')).resolves.toBeNull()
  })

  it('normalises before reading, so a webhook spelling variant still resolves', async () => {
    send.mockResolvedValueOnce({})

    await getAgentForPhoneNumber('919876543210')

    expect(send.mock.calls[0][0].input.Key).toEqual({ phoneNumber: '+919876543210' })
  })

  it('surfaces a lookup failure rather than reporting the number as unclaimed', async () => {
    send.mockRejectedValueOnce(new Error('AccessDeniedException'))

    await expect(getAgentForPhoneNumber('+919876543210')).rejects.toThrow(
      /Failed to look up voice agent/
    )
  })
})

describe('releasePhoneNumber', () => {
  it('deletes the claim by its normalised key', async () => {
    send.mockResolvedValueOnce({})

    await releasePhoneNumber('91 98765 43210')

    expect(send.mock.calls[0][0].input.Key).toEqual({ phoneNumber: '+919876543210' })
  })

  it('surfaces a delete failure', async () => {
    send.mockRejectedValueOnce(new Error('ResourceNotFoundException'))

    await expect(releasePhoneNumber('+919876543210')).rejects.toThrow(
      /Failed to release phone number/
    )
  })
})
