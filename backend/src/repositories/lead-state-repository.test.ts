import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.fn()
vi.mock('./dynamo-client.js', () => ({
  dynamoClient: { send },
  getTableName: () => 'test-lead-state-table',
}))

const { appendLeadNote, getLeadState, getLeadStatesForClient, upsertLeadState } = await import(
  './lead-state-repository.js'
)

// Reaches into the command the repository handed to DynamoDB. The expression is
// the actual contract here -- two writers share this row (an operator logging a
// call, and the journey executor recording replied/leadScore), so what the
// expression touches and what it leaves alone IS the behaviour.
function lastCommandInput(): Record<string, unknown> {
  const call = send.mock.calls.at(-1)
  return (call?.[0] as { input: Record<string, unknown> }).input
}

beforeEach(() => {
  vi.clearAllMocks()
  send.mockResolvedValue({ Attributes: { leadId: 'l1', clientId: 'c1', status: 'new', notes: [] } })
})

describe('upsertLeadState', () => {
  it('SETs only the fields the caller supplied', async () => {
    await upsertLeadState('l1', 'c1', { status: 'contacted' })

    const input = lastCommandInput()
    const expr = input.UpdateExpression as string
    expect(expr).toContain('#status = :status')
    expect(expr).not.toContain('#ownerId')
    expect(expr).not.toContain('#leadScore')
    expect(input.Key).toEqual({ leadId: 'l1' })
  })

  // The whole reason this is an UPDATE and not a Put. A Put from the operator
  // would erase whatever the journey executor last wrote, and vice versa.
  it('never writes fields it was not given', async () => {
    await upsertLeadState('l1', 'c1', { leadScore: 80 })

    const expr = lastCommandInput().UpdateExpression as string
    expect(expr).toContain('#leadScore = :leadScore')
    expect(expr).not.toContain('#status =')
    expect(expr).not.toContain('#replied')
  })

  // A key present with an undefined value means "clear this", which is how a
  // completed follow-up drops its nextActionAt and a reopened lead drops its
  // outcome. Dropping the key instead would silently no-op.
  it('REMOVEs a field that is present but undefined', async () => {
    await upsertLeadState('l1', 'c1', { nextActionAt: undefined })

    const expr = lastCommandInput().UpdateExpression as string
    expect(expr).toContain('REMOVE #nextActionAt')
    expect(expr).not.toContain('#nextActionAt = :nextActionAt')
  })

  it('can SET one field and REMOVE another in the same write', async () => {
    await upsertLeadState('l1', 'c1', { status: 'contacted', outcome: undefined })

    const expr = lastCommandInput().UpdateExpression as string
    expect(expr).toContain('#status = :status')
    expect(expr).toContain('REMOVE #outcome')
  })

  it('always stamps clientId so the row is ownership-checkable and indexed', async () => {
    await upsertLeadState('l1', 'c1', { status: 'new' })

    const input = lastCommandInput()
    expect(input.UpdateExpression as string).toContain('#clientId = :clientId')
    expect((input.ExpressionAttributeValues as Record<string, unknown>)[':clientId']).toBe('c1')
  })

  // createdAt is when the lead was first TOUCHED. A second write must not
  // reset it, or "when did we start working this" becomes "just now", forever.
  it('preserves createdAt and notes across later writes', async () => {
    await upsertLeadState('l1', 'c1', { status: 'qualified' })

    const expr = lastCommandInput().UpdateExpression as string
    expect(expr).toContain('#createdAt = if_not_exists(#createdAt, :now)')
    expect(expr).toContain('#notes = if_not_exists(#notes, :emptyNotes)')
  })

  it('surfaces a DynamoDB failure as a named error rather than swallowing it', async () => {
    send.mockRejectedValueOnce(new Error('ResourceNotFoundException'))

    await expect(upsertLeadState('l1', 'c1', { status: 'new' })).rejects.toThrow(
      /Failed to update state for lead l1/
    )
  })
})

describe('appendLeadNote', () => {
  it('appends rather than overwriting the existing notes list', async () => {
    await appendLeadNote('l1', 'c1', 'Called, wants a Saturday visit', 'user-1')

    const input = lastCommandInput()
    const expr = input.UpdateExpression as string
    expect(expr).toContain('list_append(if_not_exists(#notes, :empty), :note)')

    const note = (input.ExpressionAttributeValues as Record<string, { body: string; authorId: string }[]>)[
      ':note'
    ][0]
    expect(note.body).toBe('Called, wants a Saturday visit')
    expect(note.authorId).toBe('user-1')
  })

  it('creates the row with status new when the lead has never been touched', async () => {
    await appendLeadNote('l1', 'c1', 'first contact', 'user-1')

    const expr = lastCommandInput().UpdateExpression as string
    expect(expr).toContain('#status = if_not_exists(#status, :new)')
  })

  it('counts a note as a touch', async () => {
    await appendLeadNote('l1', 'c1', 'note', 'user-1')

    expect(lastCommandInput().UpdateExpression as string).toContain('#lastTouchedAt = :now')
  })
})

describe('reads', () => {
  it('gets a single row by its leadId key', async () => {
    send.mockResolvedValueOnce({ Item: { leadId: 'l1', status: 'contacted' } })

    const state = await getLeadState('l1')

    expect(state?.status).toBe('contacted')
    expect(lastCommandInput().Key).toEqual({ leadId: 'l1' })
  })

  it('returns null for a lead nobody has touched', async () => {
    send.mockResolvedValueOnce({})
    await expect(getLeadState('nope')).resolves.toBeNull()
  })

  // The index is clientId+updatedAt, NOT clientId+nextActionAt: a
  // nextActionAt-keyed index would be sparse and drop every lead without a
  // scheduled follow-up, which is most of them.
  it('queries the client index and returns an empty list when there are no rows', async () => {
    send.mockResolvedValueOnce({})

    await expect(getLeadStatesForClient('c1')).resolves.toEqual([])
    expect(lastCommandInput().IndexName).toBe('clientId-updatedAt-index')
  })
})
