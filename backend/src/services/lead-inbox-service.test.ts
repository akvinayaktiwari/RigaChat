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

    const inbox = await getUnifiedInbox(CLIENT)

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

    const [lead] = await getUnifiedInbox(CLIENT)

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
        '21a12d38-a922-4b38-b490-7dd4956017ff': 'akvinayaktiwari5@gmail.com',
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

    const [lead] = await getUnifiedInbox(CLIENT)

    expect(lead.name).toBe('Whatsapppppp')
    expect(lead.email).toBe('akvinayaktiwari5@gmail.com')
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

    const [lead] = await getUnifiedInbox(CLIENT)

    expect(lead.phone).toBe('+919900000000')
  })

  it('still reads older label-keyed submissions when no field defs are available', async () => {
    getFormLeadsByClientId.mockResolvedValue([formLead('f1', '2026-08-02T00:00:00.000Z')])
    getFormsByClientId.mockResolvedValue([])

    const [lead] = await getUnifiedInbox(CLIENT)

    expect(lead.name).toBe('form f1')
    expect(lead.phone).toBe('+919900000000')
  })

  it('attaches state to the matching lead and leaves untouched leads null', async () => {
    getLeadsByClientId.mockResolvedValue([
      chatLead('c1', '2026-08-01T00:00:00.000Z'),
      chatLead('c2', '2026-08-02T00:00:00.000Z'),
    ])
    getLeadStatesForClient.mockResolvedValue([state('c1', { status: 'qualified' })])

    const inbox = await getUnifiedInbox(CLIENT)
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

    const inbox = await getUnifiedInbox(CLIENT)

    expect(inbox.map((lead) => lead.leadId)).toEqual(['very-overdue', 'due-soon', 'recent'])
  })

  it('orders untouched leads oldest first, because those are the ones going cold', async () => {
    getLeadsByClientId.mockResolvedValue([
      chatLead('newer', '2026-08-06T00:00:00.000Z'),
      chatLead('older', '2026-08-02T00:00:00.000Z'),
    ])

    const inbox = await getUnifiedInbox(CLIENT)

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

    const inbox = await getUnifiedInbox(CLIENT)

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

    const inbox = await getUnifiedInbox(CLIENT)

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
