import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormLead, Lead, LeadState, MetaLead } from '../types/index.js'

const getLeadsByClientId = vi.fn()
const getLeadById = vi.fn()
vi.mock('../repositories/lead-repository.js', () => ({ getLeadsByClientId, getLeadById }))

const getFormLeadsByClientId = vi.fn()
const getFormLeadById = vi.fn()
vi.mock('../repositories/form-lead-repository.js', () => ({ getFormLeadsByClientId, getFormLeadById }))

const getMetaLeadsByClientId = vi.fn()
const getMetaLeadById = vi.fn()
vi.mock('../repositories/meta-lead-repository.js', () => ({ getMetaLeadsByClientId, getMetaLeadById }))

const getLeadStatesForClient = vi.fn()
const upsertLeadState = vi.fn()
const appendLeadNote = vi.fn()
vi.mock('../repositories/lead-state-repository.js', () => ({
  getLeadStatesForClient,
  upsertLeadState,
  appendLeadNote,
}))

const { addLeadNoteForClient, getUnifiedInbox, updateLeadStateForClient } = await import(
  './lead-inbox-service.js'
)

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
