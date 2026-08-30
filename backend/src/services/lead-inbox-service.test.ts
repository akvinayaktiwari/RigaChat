import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormLead, Lead, LeadState, MetaLead } from '../types/index.js'

const getLeadsByClientId = vi.fn()
const getLeadById = vi.fn()
const getLeadEvents = vi.fn()
vi.mock('../repositories/lead-event-repository.js', () => ({ getLeadEvents }))
vi.mock('../repositories/lead-repository.js', () => ({ getLeadsByClientId, getLeadById }))

const getFormLeadsByClientId = vi.fn()
const getFormLeadById = vi.fn()
vi.mock('../repositories/form-lead-repository.js', () => ({ getFormLeadsByClientId, getFormLeadById }))

const getMetaLeadsByClientId = vi.fn()
const getMetaLeadById = vi.fn()
vi.mock('../repositories/meta-lead-repository.js', () => ({ getMetaLeadsByClientId, getMetaLeadById }))

const getFormsByClientId = vi.fn()
const getPublicFormConfig = vi.fn()
vi.mock('../repositories/form-repository.js', () => ({ getFormsByClientId, getPublicFormConfig }))

const getLeadStatesForClient = vi.fn()
const getLeadState = vi.fn()
const upsertLeadState = vi.fn()
const appendLeadNote = vi.fn()
vi.mock('../repositories/lead-state-repository.js', () => ({
  getLeadStatesForClient,
  getLeadState,
  upsertLeadState,
  appendLeadNote,
}))

const {
  addLeadNoteForClient,
  getLeadTimeline,
  getUnifiedInbox,
  getUnifiedLeadDetail,
  updateLeadStateForClient,
  setLeadArchivedForClient,
} = await import('./lead-inbox-service.js')

const NOW = '2026-08-07T12:00:00.000Z'
const CLIENT = 'client-1'

function chatLead(leadId: string, createdAt: string): Lead {
  return {
    leadId,
    botId: 'bot-1',
    clientId: CLIENT,
    name: `chat ${leadId}`,
    chatTranscript: '',
    sourceUrl: 'https://example.com',
    createdAt,
  }
}

function formLead(leadId: string, createdAt: string): FormLead {
  return {
    leadId,
    formId: 'form-1',
    clientId: CLIENT,
    source: 'form',
    customFields: JSON.stringify({ Name: `form ${leadId}`, Phone: '+919900000000' }),
    sourceUrl: 'https://example.com/contact',
    createdAt,
  }
}

function metaLead(leadId: string, createdAt: string): MetaLead {
  return {
    leadId,
    pageId: 'page-1',
    clientId: CLIENT,
    name: `meta ${leadId}`,
    customFields: '{}',
    sourceUrl: 'https://facebook.com/page-1/',
    createdAt,
  } as MetaLead
}

function state(leadId: string, overrides: Partial<LeadState>): LeadState {
  return {
    leadId,
    clientId: CLIENT,
    status: 'contacted',
    notes: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
  getLeadsByClientId.mockResolvedValue([])
  getFormLeadsByClientId.mockResolvedValue([])
  getMetaLeadsByClientId.mockResolvedValue([])
  getLeadStatesForClient.mockResolvedValue([])
  getFormsByClientId.mockResolvedValue([])
  getLeadState.mockResolvedValue(null)
  getPublicFormConfig.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getUnifiedInbox', () => {
  it('merges all three sources into one list with a source-specific leadRef', async () => {
    getLeadsByClientId.mockResolvedValue([chatLead('c1', '2026-08-01T00:00:00.000Z')])
    getFormLeadsByClientId.mockResolvedValue([formLead('f1', '2026-08-02T00:00:00.000Z')])
    getMetaLeadsByClientId.mockResolvedValue([metaLead('m1', '2026-08-03T00:00:00.000Z')])

    const inbox = (await getUnifiedInbox(CLIENT)).leads

    expect(inbox).toHaveLength(3)
    expect(inbox.map((lead) => lead.leadRef)).toEqual(
      expect.arrayContaining([
        { source: 'chat', botId: 'bot-1', leadId: 'c1' },
        { source: 'form', formId: 'form-1', leadId: 'f1' },
        { source: 'meta', pageId: 'page-1', leadId: 'm1' },
      ])
    )
  })

  it('normalizes a form lead’s contact fields out of customFields', async () => {
    getFormLeadsByClientId.mockResolvedValue([formLead('f1', '2026-08-02T00:00:00.000Z')])

    const [lead] = (await getUnifiedInbox(CLIENT)).leads

    expect(lead.name).toBe('form f1')
    expect(lead.phone).toBe('+919900000000')
  })

  it('reads a UUID-keyed form submission via the form’s own field definitions', async () => {
    // The form builder keys customFields by fieldId, not by label. Without the
    // field defs these rows resolve to no name/phone/email -- which also left
    // the journey layer with no phone number to deliver to.
    const uuidKeyed: FormLead = {
      ...formLead('f1', '2026-08-02T00:00:00.000Z'),
      customFields: JSON.stringify({
        '8967c774-4ab1-4d7d-8d60-c62ff8e9db94': 'Whatsapppppp',
        '21a12d38-a922-4b38-b490-7dd4956017ff': 'ravi@example.com',
        '6baea1e9-9d03-4a30-8530-6ecb3a46cedd': '3 BHK',
      }),
    }
    getFormLeadsByClientId.mockResolvedValue([uuidKeyed])
    getFormsByClientId.mockResolvedValue([
      {
        formId: 'form-1',
        fields: [
          { fieldId: '8967c774-4ab1-4d7d-8d60-c62ff8e9db94', label: 'Name', type: 'text', required: true },
          { fieldId: '21a12d38-a922-4b38-b490-7dd4956017ff', label: 'Email', type: 'email', required: false },
          { fieldId: '6baea1e9-9d03-4a30-8530-6ecb3a46cedd', label: 'Property', type: 'text', required: false },
        ],
      },
    ])

    const [lead] = (await getUnifiedInbox(CLIENT)).leads

    expect(lead.name).toBe('Whatsapppppp')
    expect(lead.email).toBe('ravi@example.com')
    expect(lead.propertyInterest).toBe('3 BHK')
  })

  it('resolves a phone field by its declared type, not its label', async () => {
    // A field literally called "Reach me on" is still the phone number when the
    // form declares type: 'phone'. Key-name matching could never see that.
    getFormLeadsByClientId.mockResolvedValue([
      {
        ...formLead('f1', '2026-08-02T00:00:00.000Z'),
        customFields: JSON.stringify({ 'abc-123': '+919900000000' }),
      },
    ])
    getFormsByClientId.mockResolvedValue([
      {
        formId: 'form-1',
        fields: [{ fieldId: 'abc-123', label: 'Reach me on', type: 'phone', required: true }],
      },
    ])

    const [lead] = (await getUnifiedInbox(CLIENT)).leads

    expect(lead.phone).toBe('+919900000000')
  })

  it('still reads older label-keyed submissions when no field defs are available', async () => {
    getFormLeadsByClientId.mockResolvedValue([formLead('f1', '2026-08-02T00:00:00.000Z')])
    getFormsByClientId.mockResolvedValue([])

    const [lead] = (await getUnifiedInbox(CLIENT)).leads

    expect(lead.name).toBe('form f1')
    expect(lead.phone).toBe('+919900000000')
  })

  it('attaches state to the matching lead and leaves untouched leads null', async () => {
    getLeadsByClientId.mockResolvedValue([
      chatLead('c1', '2026-08-01T00:00:00.000Z'),
      chatLead('c2', '2026-08-02T00:00:00.000Z'),
    ])
    getLeadStatesForClient.mockResolvedValue([state('c1', { status: 'qualified' })])

    const inbox = (await getUnifiedInbox(CLIENT)).leads
    const byId = new Map(inbox.map((lead) => [lead.leadId, lead]))

    expect(byId.get('c1')?.state?.status).toBe('qualified')
    expect(byId.get('c2')?.state).toBeNull()
  })

  it('puts overdue follow-ups first, most overdue leading', async () => {
    getLeadsByClientId.mockResolvedValue([
      chatLead('recent', '2026-08-07T11:00:00.000Z'),
      chatLead('due-soon', '2026-08-01T00:00:00.000Z'),
      chatLead('very-overdue', '2026-08-01T00:00:00.000Z'),
    ])
    getLeadStatesForClient.mockResolvedValue([
      state('due-soon', { nextActionAt: '2026-08-07T11:00:00.000Z' }),
      state('very-overdue', { nextActionAt: '2026-08-05T09:00:00.000Z' }),
    ])

    const inbox = (await getUnifiedInbox(CLIENT)).leads

    expect(inbox.map((lead) => lead.leadId)).toEqual(['very-overdue', 'due-soon', 'recent'])
  })

  it('orders untouched leads oldest first, because those are the ones going cold', async () => {
    getLeadsByClientId.mockResolvedValue([
      chatLead('newer', '2026-08-06T00:00:00.000Z'),
      chatLead('older', '2026-08-02T00:00:00.000Z'),
    ])

    const inbox = (await getUnifiedInbox(CLIENT)).leads

    expect(inbox.map((lead) => lead.leadId)).toEqual(['older', 'newer'])
  })

  it('ranks untouched above future-scheduled, and closed last', async () => {
    getLeadsByClientId.mockResolvedValue([
      chatLead('closed', '2026-08-01T00:00:00.000Z'),
      chatLead('scheduled', '2026-08-01T00:00:00.000Z'),
      chatLead('untouched', '2026-08-01T00:00:00.000Z'),
      chatLead('in-progress', '2026-08-01T00:00:00.000Z'),
    ])
    getLeadStatesForClient.mockResolvedValue([
      state('closed', { status: 'closed', outcome: 'lost' }),
      state('scheduled', { nextActionAt: '2026-08-09T00:00:00.000Z' }),
      state('untouched', { status: 'new' }),
      state('in-progress', { status: 'contacted' }),
    ])

    const inbox = (await getUnifiedInbox(CLIENT)).leads

    expect(inbox.map((lead) => lead.leadId)).toEqual([
      'untouched',
      'scheduled',
      'in-progress',
      'closed',
    ])
  })

  it('sorts a closed lead behind an overdue one even when the closed lead is newer', async () => {
    getLeadsByClientId.mockResolvedValue([
      chatLead('closed', '2026-08-07T00:00:00.000Z'),
      chatLead('overdue', '2026-08-01T00:00:00.000Z'),
    ])
    getLeadStatesForClient.mockResolvedValue([
      state('closed', { status: 'closed', outcome: 'won' }),
      state('overdue', { nextActionAt: '2026-08-06T00:00:00.000Z' }),
    ])

    const inbox = (await getUnifiedInbox(CLIENT)).leads

    expect(inbox.map((lead) => lead.leadId)).toEqual(['overdue', 'closed'])
  })
})

describe('updateLeadStateForClient', () => {
  it('writes the patch and stamps lastTouchedAt', async () => {
    getLeadById.mockResolvedValue(chatLead('c1', '2026-08-01T00:00:00.000Z'))
    upsertLeadState.mockResolvedValue(state('c1', { status: 'contacted' }))

    await updateLeadStateForClient(
      { source: 'chat', botId: 'bot-1', leadId: 'c1' },
      CLIENT,
      { status: 'contacted' }
    )

    expect(upsertLeadState).toHaveBeenCalledWith('c1', CLIENT, {
      status: 'contacted',
      lastTouchedAt: NOW,
    })
  })

  it('refuses a lead owned by a different client, without revealing it exists', async () => {
    getLeadById.mockResolvedValue({ ...chatLead('c1', NOW), clientId: 'someone-else' })

    await expect(
      updateLeadStateForClient({ source: 'chat', botId: 'bot-1', leadId: 'c1' }, CLIENT, {
        status: 'qualified',
      })
    ).rejects.toThrow('Lead not found')
    expect(upsertLeadState).not.toHaveBeenCalled()
  })

  it('refuses a lead that does not resolve at all', async () => {
    getMetaLeadById.mockResolvedValue(null)

    await expect(
      updateLeadStateForClient({ source: 'meta', pageId: 'page-1', leadId: 'gone' }, CLIENT, {
        status: 'closed',
      })
    ).rejects.toThrow('Lead not found')
    expect(upsertLeadState).not.toHaveBeenCalled()
  })
})

describe('addLeadNoteForClient', () => {
  it('appends a note once ownership checks out', async () => {
    getFormLeadById.mockResolvedValue(formLead('f1', '2026-08-01T00:00:00.000Z'))
    appendLeadNote.mockResolvedValue(state('f1', {}))

    await addLeadNoteForClient(
      { source: 'form', formId: 'form-1', leadId: 'f1' },
      CLIENT,
      'Called, asked for a Saturday visit',
      'user-1'
    )

    expect(appendLeadNote).toHaveBeenCalledWith(
      'f1',
      CLIENT,
      'Called, asked for a Saturday visit',
      'user-1'
    )
  })

  it('refuses to append to another client’s lead', async () => {
    getFormLeadById.mockResolvedValue({ ...formLead('f1', NOW), clientId: 'someone-else' })

    await expect(
      addLeadNoteForClient({ source: 'form', formId: 'form-1', leadId: 'f1' }, CLIENT, 'hi', 'u1')
    ).rejects.toThrow('Lead not found')
    expect(appendLeadNote).not.toHaveBeenCalled()
  })
})

describe('getUnifiedLeadDetail', () => {
  it('returns the chat transcript alongside the normalized lead', async () => {
    getLeadById.mockResolvedValue({
      ...chatLead('c1', '2026-08-01T00:00:00.000Z'),
      chatTranscript: 'User: hi\nBot: hello',
    })

    const detail = await getUnifiedLeadDetail({ source: 'chat', botId: 'bot-1', leadId: 'c1' }, CLIENT)

    expect(detail.chatTranscript).toBe('User: hi\nBot: hello')
    expect(detail.leadRef).toEqual({ source: 'chat', botId: 'bot-1', leadId: 'c1' })
    expect(detail.createdAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('relabels a form lead’s answers from fieldId to the human label', async () => {
    getFormLeadById.mockResolvedValue({
      ...formLead('f1', '2026-08-02T00:00:00.000Z'),
      customFields: JSON.stringify({ 'abc-123': '3 BHK' }),
    })
    getPublicFormConfig.mockResolvedValue({
      formId: 'form-1',
      fields: [{ fieldId: 'abc-123', label: 'Property', type: 'text', required: false }],
    })

    const detail = await getUnifiedLeadDetail({ source: 'form', formId: 'form-1', leadId: 'f1' }, CLIENT)

    // A UUID is not something to show a human next to their own answer.
    expect(detail.customFields).toEqual({ Property: '3 BHK' })
  })

  it('keeps an answer whose field was since deleted from the form', async () => {
    getFormLeadById.mockResolvedValue({
      ...formLead('f1', '2026-08-02T00:00:00.000Z'),
      customFields: JSON.stringify({ 'gone-456': 'still an answer' }),
    })
    getPublicFormConfig.mockResolvedValue({ formId: 'form-1', fields: [] })

    const detail = await getUnifiedLeadDetail({ source: 'form', formId: 'form-1', leadId: 'f1' }, CLIENT)

    expect(detail.customFields).toEqual({ 'gone-456': 'still an answer' })
  })

  it('does not 404 a lead just because its customFields blob is malformed', async () => {
    getFormLeadById.mockResolvedValue({
      ...formLead('f1', '2026-08-02T00:00:00.000Z'),
      customFields: 'not json at all',
    })

    const detail = await getUnifiedLeadDetail({ source: 'form', formId: 'form-1', leadId: 'f1' }, CLIENT)

    expect(detail.customFields).toEqual({})
    expect(detail.leadId).toBe('f1')
  })

  it('attaches the lead_state row when one exists', async () => {
    getLeadById.mockResolvedValue(chatLead('c1', '2026-08-01T00:00:00.000Z'))
    getLeadState.mockResolvedValue(state('c1', { status: 'qualified' }))

    const detail = await getUnifiedLeadDetail({ source: 'chat', botId: 'bot-1', leadId: 'c1' }, CLIENT)

    expect(detail.state?.status).toBe('qualified')
  })

  it('refuses another client’s lead without revealing that it exists', async () => {
    getLeadById.mockResolvedValue({ ...chatLead('c1', NOW), clientId: 'someone-else' })

    await expect(
      getUnifiedLeadDetail({ source: 'chat', botId: 'bot-1', leadId: 'c1' }, CLIENT)
    ).rejects.toThrow('Lead not found')
  })

  it('refuses a lead that does not exist', async () => {
    getMetaLeadById.mockResolvedValue(null)

    await expect(
      getUnifiedLeadDetail({ source: 'meta', pageId: 'page-1', leadId: 'gone' }, CLIENT)
    ).rejects.toThrow('Lead not found')
  })
})

describe('getLeadTimeline', () => {
  beforeEach(() => {
    getLeadEvents.mockReset().mockResolvedValue([])
  })

  // Ownership is checked against the SOURCE RECORD, not the events.
  // lead_events is partitioned by leadId alone, so a leadId lifted from a URL
  // would otherwise read another tenant's whole conversation. Filtering after
  // the read is not a boundary: it still fetched the rows.
  it('refuses a lead belonging to another client', async () => {
    getLeadById.mockResolvedValue({ leadId: 'lead-1', clientId: 'someone-else', botId: 'bot-1' })

    await expect(
      getLeadTimeline({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, 'client-1')
    ).rejects.toThrow('Lead not found')

    expect(getLeadEvents).not.toHaveBeenCalled()
  })

  it('refuses a lead that does not exist, with the same error', async () => {
    getLeadById.mockResolvedValue(null)

    await expect(
      getLeadTimeline({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, 'client-1')
    ).rejects.toThrow('Lead not found')
  })

  it('returns the events for a lead the client owns', async () => {
    getLeadById.mockResolvedValue({ leadId: 'lead-1', clientId: 'client-1', botId: 'bot-1' })
    getLeadEvents.mockResolvedValue([{ leadId: 'lead-1', type: 'message_in', ts: 'x' }])

    const events = await getLeadTimeline({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, 'client-1')

    expect(events).toHaveLength(1)
  })

  // A long nurture can accumulate hundreds of rows; one lead must not pull an
  // unbounded read on a Lambda shared with every other request.
  it('bounds the read', async () => {
    getLeadById.mockResolvedValue({ leadId: 'lead-1', clientId: 'client-1', botId: 'bot-1' })

    await getLeadTimeline({ source: 'chat', botId: 'bot-1', leadId: 'lead-1' }, 'client-1')

    expect(getLeadEvents).toHaveBeenCalledWith('lead-1', 500)
  })
})

// Added 2026-08-27 with the tier-on-the-wire and pagination changes.
describe('urgencyTier on the wire', () => {
  it('stamps a tier on every lead', async () => {
    getLeadsByClientId.mockResolvedValue([chatLead('c1', '2026-08-01T00:00:00.000Z')])
    getFormLeadsByClientId.mockResolvedValue([formLead('f1', '2026-08-02T00:00:00.000Z')])

    const { leads } = await getUnifiedInbox(CLIENT)

    expect(leads.every((lead) => typeof lead.urgencyTier === 'string')).toBe(true)
  })

  it('names each tier the same way the sort ranks it', async () => {
    getLeadsByClientId.mockResolvedValue([
      chatLead('overdue', '2026-08-01T00:00:00.000Z'),
      chatLead('untouched', '2026-08-02T00:00:00.000Z'),
      chatLead('scheduled', '2026-08-03T00:00:00.000Z'),
      chatLead('progress', '2026-08-04T00:00:00.000Z'),
      chatLead('closed', '2026-08-05T00:00:00.000Z'),
    ])
    getLeadStatesForClient.mockResolvedValue([
      state('overdue', { status: 'contacted', nextActionAt: '2026-08-06T00:00:00.000Z' }),
      state('scheduled', { status: 'contacted', nextActionAt: '2026-08-09T00:00:00.000Z' }),
      state('progress', { status: 'contacted' }),
      state('closed', { status: 'closed' }),
    ])

    const { leads } = await getUnifiedInbox(CLIENT)

    // The order IS the tier order, so this asserts both at once.
    expect(leads.map((lead) => [lead.leadId, lead.urgencyTier])).toEqual([
      ['overdue', 'overdue'],
      ['untouched', 'untouched'],
      ['scheduled', 'scheduled'],
      ['progress', 'in_progress'],
      ['closed', 'closed'],
    ])
  })

  it('sends the tier on the detail read too, so the badge matches the list', async () => {
    getLeadById.mockResolvedValue(chatLead('c1', '2026-08-01T00:00:00.000Z'))
    getLeadState.mockResolvedValue(state('c1', { status: 'contacted', nextActionAt: '2026-08-06T00:00:00.000Z' }))

    const detail = await getUnifiedLeadDetail({ source: 'chat', botId: 'bot-1', leadId: 'c1' }, CLIENT)

    expect(detail.urgencyTier).toBe('overdue')
  })
})

describe('inbox pagination', () => {
  function manyLeads(count: number) {
    // Epoch offsets, NOT a seconds field -- `00:00:60` is not a valid ISO time
    // and Date.parse returns NaN for it, which is how the first version of this
    // helper produced an inbox that paged forever.
    const base = Date.parse('2026-08-01T00:00:00.000Z')
    return Array.from({ length: count }, (_, i) =>
      chatLead(`c${String(i).padStart(3, '0')}`, new Date(base + i * 1000).toISOString())
    )
  }

  // Pagination is OPT-IN. The web CRM calls this with no limit and renders
  // every lead; a default page size would silently truncate a dashboard.
  it('returns the whole inbox when no limit is given', async () => {
    getLeadsByClientId.mockResolvedValue(manyLeads(120))

    const page = await getUnifiedInbox(CLIENT)

    expect(page.leads).toHaveLength(120)
    expect(page.total).toBe(120)
    expect(page.nextCursor).toBeUndefined()
  })

  it('pages once a limit is given, and reports the full total', async () => {
    getLeadsByClientId.mockResolvedValue(manyLeads(120))

    const page = await getUnifiedInbox(CLIENT, { limit: 50 })

    expect(page.leads).toHaveLength(50)
    // total is the whole inbox, not the page -- a UI showing "50 leads" when
    // there are 120 would be worse than showing nothing.
    expect(page.total).toBe(120)
    expect(page.nextCursor).toBeDefined()
  })

  it('honours an explicit limit and caps it', async () => {
    getLeadsByClientId.mockResolvedValue(manyLeads(400))

    expect((await getUnifiedInbox(CLIENT, { limit: 10 })).leads).toHaveLength(10)
    expect((await getUnifiedInbox(CLIENT, { limit: 9999 })).leads).toHaveLength(200)
  })

  it('omits nextCursor on the last page', async () => {
    getLeadsByClientId.mockResolvedValue(manyLeads(10))

    const page = await getUnifiedInbox(CLIENT, { limit: 50 })

    expect(page.leads).toHaveLength(10)
    expect(page.nextCursor).toBeUndefined()
  })

  // The property that matters: walking every page must yield every lead exactly
  // once. A cursor that skips one means an operator never sees that lead.
  it('walks the whole inbox exactly once across pages', async () => {
    const all = manyLeads(137)
    getLeadsByClientId.mockResolvedValue(all)

    const seen: string[] = []
    let cursor: string | undefined
    let guard = 0
    do {
      const page = await getUnifiedInbox(CLIENT, { limit: 25, ...(cursor ? { cursor } : {}) })
      seen.push(...page.leads.map((lead) => lead.leadId))
      cursor = page.nextCursor
      guard += 1
    } while (cursor && guard < 20)

    expect(seen).toHaveLength(137)
    expect(new Set(seen).size).toBe(137)
    expect(seen).toEqual([...all].map((lead) => lead.leadId).sort())
  })

  it('starts from the top when the cursor cannot be read', async () => {
    getLeadsByClientId.mockResolvedValue(manyLeads(10))

    const page = await getUnifiedInbox(CLIENT, { limit: 50, cursor: 'not-a-real-cursor' })

    // A stale cursor after a deploy should show the inbox, not a 400.
    expect(page.leads).toHaveLength(10)
  })

  // Without a leadId tiebreak the sort is not a TOTAL order, so two leads
  // sharing a timestamp can swap between requests -- which for a paginated
  // reader means seeing one twice and the other never.
  it('orders leads with identical timestamps deterministically', async () => {
    const sameInstant = '2026-08-01T00:00:00.000Z'
    getLeadsByClientId.mockResolvedValue([
      chatLead('zzz', sameInstant),
      chatLead('aaa', sameInstant),
      chatLead('mmm', sameInstant),
    ])

    const first = (await getUnifiedInbox(CLIENT)).leads.map((lead) => lead.leadId)
    const second = (await getUnifiedInbox(CLIENT)).leads.map((lead) => lead.leadId)

    expect(first).toEqual(['aaa', 'mmm', 'zzz'])
    expect(first).toEqual(second)
  })
})

// Regression guard for the failure the first draft of the test above found:
// a lead whose createdAt cannot be parsed used to make the cursor unable to
// advance, so the same page was served forever.
describe('pagination with a corrupt date', () => {
  it('still terminates and returns every lead exactly once', async () => {
    const base = Date.parse('2026-08-01T00:00:00.000Z')
    const leads = Array.from({ length: 9 }, (_, i) =>
      chatLead(`c${i}`, new Date(base + i * 1000).toISOString())
    )
    leads.push(chatLead('corrupt', 'not-a-date'))
    getLeadsByClientId.mockResolvedValue(leads)

    const seen: string[] = []
    let cursor: string | undefined
    let guard = 0
    do {
      const page = await getUnifiedInbox(CLIENT, { limit: 3, ...(cursor ? { cursor } : {}) })
      seen.push(...page.leads.map((lead) => lead.leadId))
      cursor = page.nextCursor
      guard += 1
    } while (cursor && guard < 10)

    expect(new Set(seen).size).toBe(10)
    // Sorted last, so a corrupt row is not the first thing an operator sees.
    expect(seen[seen.length - 1]).toBe('corrupt')
  })
})

// Archiving is the everyday half of lead deletion: hide it, keep everything.
describe('archiving a lead', () => {
  it('keeps an archived lead out of the inbox', async () => {
    getLeadsByClientId.mockResolvedValue([chatLead('c1', '2026-08-01T00:00:00.000Z')])
    getLeadStatesForClient.mockResolvedValue([
      { leadId: 'c1', clientId: CLIENT, status: 'new', notes: [], archivedAt: '2026-08-29T00:00:00.000Z' },
    ])

    expect((await getUnifiedInbox(CLIENT)).leads).toHaveLength(0)
  })

  it('shows it again on request, so a mistake is recoverable', async () => {
    getLeadsByClientId.mockResolvedValue([chatLead('c1', '2026-08-01T00:00:00.000Z')])
    getLeadStatesForClient.mockResolvedValue([
      { leadId: 'c1', clientId: CLIENT, status: 'new', notes: [], archivedAt: '2026-08-29T00:00:00.000Z' },
    ])

    expect((await getUnifiedInbox(CLIENT, { includeArchived: true })).leads).toHaveLength(1)
  })

  it('leaves un-archived leads alone', async () => {
    getLeadsByClientId.mockResolvedValue([chatLead('c1', '2026-08-01T00:00:00.000Z')])
    getLeadStatesForClient.mockResolvedValue([{ leadId: 'c1', clientId: CLIENT, status: 'new', notes: [] }])

    expect((await getUnifiedInbox(CLIENT)).leads).toHaveLength(1)
  })

  it('stamps who archived it and when', async () => {
    getLeadById.mockResolvedValue({ leadId: 'c1', clientId: CLIENT, botId: 'bot-1' })
    upsertLeadState.mockResolvedValue({ leadId: 'c1' })

    await setLeadArchivedForClient({ source: 'chat', botId: 'bot-1', leadId: 'c1' }, CLIENT, true, 'operator-1')

    expect(upsertLeadState).toHaveBeenCalledWith('c1', CLIENT, {
      archivedAt: expect.any(String),
      archivedBy: 'operator-1',
    })
  })

  // Explicitly-undefined is a REMOVE in the patch layer, so unarchiving leaves
  // no trace rather than a lingering archived:false to reason about.
  it('clears both fields on unarchive', async () => {
    getLeadById.mockResolvedValue({ leadId: 'c1', clientId: CLIENT, botId: 'bot-1' })
    upsertLeadState.mockResolvedValue({ leadId: 'c1' })

    await setLeadArchivedForClient({ source: 'chat', botId: 'bot-1', leadId: 'c1' }, CLIENT, false, 'operator-1')

    expect(upsertLeadState).toHaveBeenCalledWith('c1', CLIENT, {
      archivedAt: undefined,
      archivedBy: undefined,
    })
  })

  // /state stamps lastTouchedAt because changing a status means working the
  // lead. Archiving is the opposite claim, and bumping it would push a lead you
  // just dismissed UP the urgency sort if it were ever unarchived.
  it('does not count as touching the lead', async () => {
    getLeadById.mockResolvedValue({ leadId: 'c1', clientId: CLIENT, botId: 'bot-1' })
    upsertLeadState.mockResolvedValue({ leadId: 'c1' })

    await setLeadArchivedForClient({ source: 'chat', botId: 'bot-1', leadId: 'c1' }, CLIENT, true, 'operator-1')

    expect(upsertLeadState.mock.calls[0][2]).not.toHaveProperty('lastTouchedAt')
  })
})
