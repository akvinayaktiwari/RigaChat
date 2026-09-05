import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The OpenAI Realtime socket is constructed inside VoiceSession's constructor,
// so it can only be replaced by mocking the module. Instances are collected as
// they are built and the newest one is handed to each test -- that is the only
// handle a test has on the OpenAI leg.
const wsMock = vi.hoisted(() => {
  // A hand-rolled emitter rather than node's: this factory is hoisted above the
  // file's imports, so it cannot reference EventEmitter.
  class FakeSocket {
    static readonly OPEN = 1
    static readonly CONNECTING = 0
    readonly url: string
    readyState = 0
    sent: string[] = []
    closed = false
    private listeners = new Map<string, Array<(arg: never) => void>>()

    constructor(url: string) {
      this.url = url
      instances.push(this)
    }

    on(event: string, listener: (arg: never) => void): this {
      const existing = this.listeners.get(event) ?? []
      existing.push(listener)
      this.listeners.set(event, existing)
      return this
    }

    emit(event: string, arg?: unknown): void {
      for (const listener of this.listeners.get(event) ?? []) {
        ;(listener as (arg: unknown) => void)(arg)
      }
    }

    send(data: string): void {
      this.sent.push(data)
    }

    close(): void {
      this.closed = true
      this.readyState = 3
    }

    // Brings the socket up the way the real one does: readyState first, then
    // the event, so the 'open' handler sees an OPEN socket.
    connect(): void {
      this.readyState = 1
      this.emit('open')
    }

    receive(event: unknown): void {
      this.emit('message', Buffer.from(JSON.stringify(event)))
    }

    events(): Array<Record<string, unknown>> {
      return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>)
    }

    eventsOfType(type: string): Array<Record<string, unknown>> {
      return this.events().filter((event) => event.type === type)
    }
  }

  const instances: FakeSocket[] = []

  return { FakeSocket, instances }
})

vi.mock('ws', () => ({ default: wsMock.FakeSocket }))

vi.mock('../repositories/voice-repository.js', () => ({
  writeVoiceCallLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/voice-lead-service.js', () => ({
  resolveCallLead: vi.fn(),
  recordCallLifecycle: vi.fn().mockResolvedValue(undefined),
  recordCallTurn: vi.fn().mockResolvedValue(undefined),
  recordCallToolUse: vi.fn().mockResolvedValue(undefined),
  recordCallHandoff: vi.fn().mockResolvedValue({ notified: true }),
}))

import { VoiceSession, type ClientTransport, type VoiceAgentConfig } from './session.js'
import { writeVoiceCallLog } from '../repositories/voice-repository.js'
import {
  recordCallHandoff,
  recordCallLifecycle,
  recordCallToolUse,
  recordCallTurn,
  resolveCallLead,
  type CallIdentity,
} from '../services/voice-lead-service.js'

// Stands in for the browser socket or the Plivo adapter. Implements exactly
// ClientTransport, which is the point of that interface existing.
class FakeClient extends EventEmitter implements ClientTransport {
  readyState = 1
  sent: string[] = []
  closed = false

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.readyState = 3
  }

  receive(message: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(message)))
  }

  events(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>)
  }
}

const IDENTITY: CallIdentity = {
  leadRef: { source: 'voice', agentId: 'agent-1', leadId: 'lead-1' },
  leadId: 'lead-1',
  botId: 'bot-1',
  isNewLead: true,
}

const BASE_CONFIG: VoiceAgentConfig = {
  agentId: 'agent-1',
  clientId: 'client-1',
  voice: 'coral',
  instructions: 'You are Ravi from Acme Estates.',
  firstMessage: 'Hello, Acme Estates.',
}

let sessions: VoiceSession[] = []

function startSession(overrides: Partial<VoiceAgentConfig> = {}): {
  session: VoiceSession
  client: FakeClient
  openai: InstanceType<typeof wsMock.FakeSocket>
} {
  const client = new FakeClient()
  const session = new VoiceSession(client, { ...BASE_CONFIG, ...overrides })
  sessions.push(session)
  const openai = wsMock.instances[wsMock.instances.length - 1]
  return { session, client, openai }
}

// A telephony session: callerPhone present is what switches CRM recording on.
function startCall(overrides: Partial<VoiceAgentConfig> = {}) {
  return startSession({
    callerPhone: '+919876543210',
    dialledNumber: '+912240000000',
    linkedBotId: 'bot-1',
    ...overrides,
  })
}

function sessionUpdate(openai: InstanceType<typeof wsMock.FakeSocket>): Record<string, unknown> {
  const updates = openai.eventsOfType('session.update')
  expect(updates.length).toBeGreaterThan(0)
  return updates[updates.length - 1].session as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  wsMock.instances.length = 0
  sessions = []
  vi.mocked(resolveCallLead).mockResolvedValue(IDENTITY)
  vi.mocked(recordCallHandoff).mockResolvedValue({ notified: true })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  // Every session holds a 5s context timeout and possibly a duration timer.
  // Left running they leak across tests and fire against a torn-down mock.
  for (const session of sessions) session.cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('session.update', () => {
  it('sends the agent instructions when no context message ever arrives', () => {
    // Regression: instructions used to be accepted and ignored, so a call with
    // no context answered as a generic assistant. A phone call NEVER sends a
    // context message, which makes that the normal case rather than a race.
    vi.useFakeTimers()
    const { openai } = startSession()

    openai.connect()
    vi.advanceTimersByTime(5000)

    expect(sessionUpdate(openai).instructions).toBe('You are Ravi from Acme Estates.')
  })

  it('falls back to the generic assistant only when the agent has no instructions', () => {
    vi.useFakeTimers()
    const { openai } = startSession({ instructions: '' })

    openai.connect()
    vi.advanceTimersByTime(5000)

    expect(sessionUpdate(openai).instructions).toContain('helpful voice assistant')
  })

  it('applies a context message that arrives after OpenAI is ready', () => {
    vi.useFakeTimers()
    const { client, openai } = startSession()
    openai.connect()

    client.receive({ type: 'context', instructions: 'You are Priya.', voice: 'alloy' })
    vi.advanceTimersByTime(5000)

    // One update, carrying the context -- the deadline must not overwrite it
    // with the fallback afterwards.
    expect(openai.eventsOfType('session.update')).toHaveLength(1)
    expect(sessionUpdate(openai).instructions).toBe('You are Priya.')
  })

  it('applies context that arrives before OpenAI is ready', () => {
    vi.useFakeTimers()
    const { client, openai } = startSession()

    client.receive({ type: 'context', instructions: 'You are Priya.', voice: 'alloy' })
    openai.connect()
    vi.advanceTimersByTime(5000)

    expect(openai.eventsOfType('session.update')).toHaveLength(1)
    expect(sessionUpdate(openai).instructions).toBe('You are Priya.')
  })

  it('offers both tools and transcribes the caller, not only the agent', () => {
    // Without input transcription the caller's half of every call is never
    // written down, which is the entire value of the CRM record.
    vi.useFakeTimers()
    const { openai } = startSession()

    openai.connect()
    vi.advanceTimersByTime(5000)

    const session = sessionUpdate(openai)
    const tools = session.tools as Array<{ name: string }>
    expect(tools.map((tool) => tool.name)).toEqual(['search_knowledge_base', 'request_human'])
    const audio = session.audio as { input: { transcription?: unknown } }
    expect(audio.input.transcription).toEqual({ model: 'whisper-1' })
  })
})

describe('messages from the client', () => {
  it('ignores a malformed frame instead of tearing the call down', () => {
    const { client, openai } = startSession()
    openai.connect()

    expect(() => client.emit('message', Buffer.from('not json'))).not.toThrow()
  })

  it('forwards audio to OpenAI', () => {
    const { client, openai } = startSession()
    openai.connect()

    client.receive({ type: 'audio', data: 'BASE64AUDIO' })

    expect(openai.eventsOfType('input_audio_buffer.append')[0]).toMatchObject({ audio: 'BASE64AUDIO' })
  })

  it('drops audio while the OpenAI socket is still connecting', () => {
    const { client, openai } = startSession()

    client.receive({ type: 'audio', data: 'BASE64AUDIO' })

    expect(openai.sent).toHaveLength(0)
  })

  it('answers a ping', () => {
    const { client } = startSession()

    client.receive({ type: 'ping' })

    expect(client.events()).toEqual([{ type: 'pong' }])
  })

  it('greets on request, because silence on answer reads as a dead line', () => {
    const { client, openai } = startSession()
    openai.connect()

    client.receive({ type: 'greet' })

    expect(openai.eventsOfType('response.create')).toHaveLength(1)
    expect(openai.eventsOfType('input_audio_buffer.commit')).toHaveLength(0)
  })

  it('commits the buffer before asking for a response', () => {
    const { client, openai } = startSession()
    openai.connect()

    client.receive({ type: 'commit' })

    expect(openai.events().map((event) => event.type)).toEqual([
      'input_audio_buffer.commit',
      'response.create',
    ])
  })
})

describe('messages from OpenAI', () => {
  it('ignores a malformed frame', () => {
    const { openai } = startSession()
    openai.connect()

    expect(() => openai.emit('message', Buffer.from('{'))).not.toThrow()
  })

  it('relays audio deltas to the client', () => {
    const { client, openai } = startSession()
    openai.connect()

    openai.receive({ type: 'response.output_audio.delta', delta: 'CHUNK' })

    expect(client.events()).toEqual([{ type: 'audio', data: 'CHUNK' }])
  })

  it('streams transcript deltas to the client as they arrive', () => {
    const { client, openai } = startSession()
    openai.connect()

    openai.receive({ type: 'response.output_audio_transcript.delta', delta: { transcript: 'the ' } })

    expect(client.events()).toEqual([{ type: 'transcript', text: 'the ' }])
  })

  it('surfaces an OpenAI error to the client rather than going silent', () => {
    const { client, openai } = startSession()
    openai.connect()

    openai.receive({ type: 'error', error: { message: 'rate limited' } })

    expect(client.events()).toEqual([{ type: 'error', message: 'rate limited' }])
  })

  it('accumulates usage across every response in the call', () => {
    const { session, openai } = startSession()
    openai.connect()

    for (let i = 0; i < 2; i++) {
      openai.receive({
        type: 'response.done',
        response: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            input_token_details: { audio_tokens: 8 },
            output_token_details: { audio_tokens: 4 },
          },
        },
      })
    }
    session.cleanup()

    expect(writeVoiceCallLog).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 20, outputTokens: 10, audioTokens: 24, totalTokens: 30 })
    )
  })

  it('tolerates a response.done carrying no usage block', () => {
    const { session, openai } = startSession()
    openai.connect()

    openai.receive({ type: 'response.done' })
    session.cleanup()

    expect(writeVoiceCallLog).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 0, outputTokens: 0, totalTokens: 0 })
    )
  })
})

describe('barge-in', () => {
  it('cancels the in-flight response when the caller interrupts', () => {
    const { client, openai } = startSession()
    openai.connect()
    openai.receive({ type: 'response.created', response: { id: 'resp-1' } })

    openai.receive({ type: 'input_audio_buffer.speech_started' })

    expect(openai.eventsOfType('response.cancel')).toHaveLength(1)
    expect(openai.eventsOfType('input_audio_buffer.clear')).toHaveLength(1)
    expect(client.events()).toContainEqual({ type: 'barge-in' })
  })

  it('does nothing when the caller speaks while the agent is silent', () => {
    const { client, openai } = startSession()
    openai.connect()

    openai.receive({ type: 'input_audio_buffer.speech_started' })

    expect(openai.eventsOfType('response.cancel')).toHaveLength(0)
    expect(client.events()).toHaveLength(0)
  })

  it('stops treating the agent as speaking once its response is done', () => {
    const { openai } = startSession()
    openai.connect()
    openai.receive({ type: 'response.created', response: { id: 'resp-1' } })
    openai.receive({ type: 'response.done' })

    openai.receive({ type: 'input_audio_buffer.speech_started' })

    expect(openai.eventsOfType('response.cancel')).toHaveLength(0)
  })
})

describe('the CRM record', () => {
  it('records nothing for a browser call, which has no caller ID to join on', async () => {
    const { session, openai } = startCall({ callerPhone: undefined, dialledNumber: undefined })
    openai.connect()

    openai.receive({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Hi' })
    openai.receive({ type: 'response.output_audio_transcript.delta', delta: { transcript: 'Hello' } })
    openai.receive({ type: 'response.done' })
    await vi.waitFor(() => expect(writeVoiceCallLog).not.toHaveBeenCalled())

    expect(resolveCallLead).not.toHaveBeenCalled()
    expect(recordCallTurn).not.toHaveBeenCalled()
    void session
  })

  it('resolves the caller once, at the start, and logs the call opening', async () => {
    startCall()

    await vi.waitFor(() => expect(recordCallLifecycle).toHaveBeenCalled())

    expect(resolveCallLead).toHaveBeenCalledTimes(1)
    expect(resolveCallLead).toHaveBeenCalledWith(
      expect.objectContaining({ callerPhone: '+919876543210', dialledNumber: '+912240000000', linkedBotId: 'bot-1' })
    )
    expect(recordCallLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Inbound call to +912240000000' })
    )
  })

  it('says so when the caller is already known', async () => {
    vi.mocked(resolveCallLead).mockResolvedValue({ ...IDENTITY, isNewLead: false })

    startCall()

    await vi.waitFor(() =>
      expect(recordCallLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'Inbound call to +912240000000 (returning contact)' })
      )
    )
  })

  it("records the caller's half of the conversation", async () => {
    const { openai } = startCall()
    openai.connect()

    openai.receive({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Is the two-bedroom still available?',
    })

    await vi.waitFor(() =>
      expect(recordCallTurn).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'caller', text: 'Is the two-bedroom still available?' })
      )
    )
  })

  it('writes the agent turn as one utterance, not one row per word fragment', async () => {
    const { openai } = startCall()
    openai.connect()

    for (const fragment of ['Yes, ', 'it is ', 'still available.']) {
      openai.receive({ type: 'response.output_audio_transcript.delta', delta: { transcript: fragment } })
    }
    openai.receive({ type: 'response.done' })

    await vi.waitFor(() => expect(recordCallTurn).toHaveBeenCalledTimes(1))
    expect(recordCallTurn).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'agent', text: 'Yes, it is still available.' })
    )
  })

  it('keeps what the caller heard before interrupting', async () => {
    // Dropping it leaves a transcript where the caller answers a question
    // nobody appears to have asked.
    const { openai } = startCall()
    openai.connect()
    openai.receive({ type: 'response.created', response: { id: 'resp-1' } })
    openai.receive({ type: 'response.output_audio_transcript.delta', delta: { transcript: 'Would you like to' } })

    openai.receive({ type: 'input_audio_buffer.speech_started' })

    await vi.waitFor(() =>
      expect(recordCallTurn).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'agent', text: 'Would you like to' })
      )
    )
  })

  it('writes no turn when the agent said nothing', async () => {
    const { openai } = startCall()
    openai.connect()
    await vi.waitFor(() => expect(recordCallLifecycle).toHaveBeenCalled())

    openai.receive({ type: 'response.done' })

    await vi.waitFor(() => expect(recordCallTurn).not.toHaveBeenCalled())
  })

  it('keeps the call up when identity resolution fails', async () => {
    vi.mocked(resolveCallLead).mockRejectedValue(new Error('DynamoDB unavailable'))
    const { client, openai } = startCall()
    openai.connect()

    openai.receive({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'Hello' })
    openai.receive({ type: 'response.output_audio.delta', delta: 'CHUNK' })

    await vi.waitFor(() => expect(recordCallTurn).not.toHaveBeenCalled())
    expect(client.closed).toBe(false)
    expect(client.events()).toContainEqual({ type: 'audio', data: 'CHUNK' })
  })
})

describe('the call log', () => {
  it('writes the log and closes both sockets on cleanup', async () => {
    const { session, client, openai } = startSession()
    openai.connect()

    session.cleanup()

    expect(client.closed).toBe(true)
    expect(openai.closed).toBe(true)
    await vi.waitFor(() =>
      expect(writeVoiceCallLog).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1', clientId: 'client-1', status: 'completed' })
      )
    )
  })

  it('records the call duration', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T10:00:00.000Z'))
    const { session, openai } = startSession()
    openai.connect()

    vi.setSystemTime(new Date('2026-09-05T10:01:30.000Z'))
    session.cleanup()

    expect(writeVoiceCallLog).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: '2026-09-05T10:00:00.000Z',
        endedAt: '2026-09-05T10:01:30.000Z',
        durationSeconds: 90,
      })
    )
  })

  it('still closes the sockets when the log write rejects', async () => {
    vi.mocked(writeVoiceCallLog).mockRejectedValue(new Error('table missing'))
    const { session, client, openai } = startSession()
    openai.connect()

    session.cleanup()

    expect(client.closed).toBe(true)
    expect(openai.closed).toBe(true)
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled())
  })

  it('closes a socket that never finished connecting', () => {
    const { session, openai } = startSession()

    session.cleanup()

    expect(openai.closed).toBe(true)
  })
})

describe('the duration cap', () => {
  it('ends a call that runs past its cap', () => {
    vi.useFakeTimers()
    const { client, openai } = startSession({ maxSessionMinutes: 5 })
    openai.connect()

    vi.advanceTimersByTime(5 * 60 * 1000)

    expect(client.closed).toBe(true)
    expect(writeVoiceCallLog).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }))
  })

  it('leaves a call under its cap alone', () => {
    vi.useFakeTimers()
    const { client, openai } = startSession({ maxSessionMinutes: 10 })
    openai.connect()

    vi.advanceTimersByTime(9 * 60 * 1000)

    expect(client.closed).toBe(false)
  })

  it('does not arm a cap when the agent has none configured', () => {
    vi.useFakeTimers()
    const { client, openai } = startSession()
    openai.connect()

    vi.advanceTimersByTime(60 * 60 * 1000)

    expect(client.closed).toBe(false)
  })

  it('clears the cap on cleanup so it cannot fire after the call ended', () => {
    vi.useFakeTimers()
    const { session, openai } = startSession({ maxSessionMinutes: 5 })
    openai.connect()

    session.cleanup()
    vi.mocked(writeVoiceCallLog).mockClear()
    vi.advanceTimersByTime(5 * 60 * 1000)

    expect(writeVoiceCallLog).not.toHaveBeenCalled()
  })
})

describe('the knowledge base tool', () => {
  function stubRag(response: unknown, ok = true): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('feeds retrieved chunks back to the model', async () => {
    const fetchMock = stubRag({ chunks: ['Two-bedroom units start at 85 lakh.', 'Possession is Q4 2027.'] })
    const { openai } = startSession()
    openai.connect()

    openai.receive({
      type: 'response.function_call_arguments.done',
      name: 'search_knowledge_base',
      call_id: 'call-abc',
      arguments: JSON.stringify({ query: 'two bedroom price' }),
    })

    await vi.waitFor(() => expect(openai.eventsOfType('conversation.item.create')).toHaveLength(1))
    const item = openai.eventsOfType('conversation.item.create')[0].item as Record<string, unknown>
    expect(item).toMatchObject({ type: 'function_call_output', call_id: 'call-abc' })
    expect(item.output).toBe('Two-bedroom units start at 85 lakh.\n\nPossession is Q4 2027.')
    expect(openai.eventsOfType('response.create')).toHaveLength(1)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/voice-agents/rag')
  })

  it('tells the model nothing was found rather than leaving it hanging', async () => {
    stubRag({ chunks: [] })
    const { openai } = startSession()
    openai.connect()

    openai.receive({
      type: 'response.function_call_arguments.done',
      name: 'search_knowledge_base',
      call_id: 'call-abc',
      arguments: JSON.stringify({ query: 'parking' }),
    })

    await vi.waitFor(() => expect(openai.eventsOfType('conversation.item.create')).toHaveLength(1))
    const item = openai.eventsOfType('conversation.item.create')[0].item as { output: string }
    expect(item.output).toBe('No specific information found.')
  })

  it('answers the model even when the retrieval call fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { openai } = startSession()
    openai.connect()

    openai.receive({
      type: 'response.function_call_arguments.done',
      name: 'search_knowledge_base',
      call_id: 'call-abc',
      arguments: JSON.stringify({ query: 'parking' }),
    })

    await vi.waitFor(() => expect(openai.eventsOfType('conversation.item.create')).toHaveLength(1))
    const item = openai.eventsOfType('conversation.item.create')[0].item as { output: string }
    expect(item.output).toBe('No specific information found.')
  })

  it('treats a non-200 from the backend as no results', async () => {
    stubRag({ chunks: ['never read'] }, false)
    const { openai } = startSession()
    openai.connect()

    openai.receive({
      type: 'response.function_call_arguments.done',
      name: 'search_knowledge_base',
      call_id: 'call-abc',
      arguments: JSON.stringify({ query: 'parking' }),
    })

    await vi.waitFor(() => expect(openai.eventsOfType('conversation.item.create')).toHaveLength(1))
    const item = openai.eventsOfType('conversation.item.create')[0].item as { output: string }
    expect(item.output).toBe('No specific information found.')
  })

  it('records the lookup against the lead on a telephony call', async () => {
    stubRag({ chunks: ['Two-bedroom units start at 85 lakh.'] })
    const { openai } = startCall()
    openai.connect()

    openai.receive({
      type: 'response.function_call_arguments.done',
      name: 'search_knowledge_base',
      call_id: 'call-abc',
      arguments: JSON.stringify({ query: 'two bedroom price' }),
    })

    await vi.waitFor(() =>
      expect(recordCallToolUse).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'two bedroom price', resultCount: 1 })
      )
    )
  })
})

describe('asking for a human', () => {
  function requestHuman(
    openai: InstanceType<typeof wsMock.FakeSocket>,
    args: string = JSON.stringify({ reason: 'Wants to negotiate the price.' })
  ): void {
    openai.receive({
      type: 'response.function_call_arguments.done',
      name: 'request_human',
      call_id: 'call-human',
      arguments: args,
    })
  }

  // The walk-back after a failed transfer is injected as a system message
  // rather than a tool output, so it is read from a different shape.
  function lastSystemPrompt(openai: InstanceType<typeof wsMock.FakeSocket>): string {
    const created = openai.eventsOfType('conversation.item.create')
    const item = created[created.length - 1].item as { content?: Array<{ text?: string }> }
    return item.content?.[0]?.text ?? ''
  }

  function toolOutput(openai: InstanceType<typeof wsMock.FakeSocket>): string {
    const created = openai.eventsOfType('conversation.item.create')
    const item = created[created.length - 1].item as { output?: string }
    return item.output ?? ''
  }

  it('records the handoff with the reason the model gave', async () => {
    const { openai } = startCall()
    openai.connect()

    requestHuman(openai)

    await vi.waitFor(() =>
      expect(recordCallHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'Wants to negotiate the price.' })
      )
    )
  })

  it('still hands off when the argument blob is malformed', async () => {
    // A broken argument costs the reason, not the handoff: someone asked for a
    // person either way.
    const { openai } = startCall()
    openai.connect()

    requestHuman(openai, 'not json')

    await vi.waitFor(() =>
      expect(recordCallHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'The caller asked to speak to a person.' })
      )
    )
  })

  it('promises a transfer only when one can actually be made', async () => {
    const transferToHuman = vi.fn().mockResolvedValue(true)
    const { openai } = startCall({ transferToHuman })
    openai.connect()

    requestHuman(openai)

    await vi.waitFor(() => expect(toolOutput(openai)).toContain('putting them through'))
  })

  it('promises a callback when no transfer is possible', async () => {
    const { openai } = startCall()
    openai.connect()

    requestHuman(openai)

    await vi.waitFor(() => expect(toolOutput(openai)).toContain('notified and will call back'))
  })

  it('does not claim someone was notified when nobody was', async () => {
    vi.mocked(recordCallHandoff).mockResolvedValue({ notified: false, skipReason: 'no notification number' })
    const { openai } = startCall()
    openai.connect()

    requestHuman(openai)

    await vi.waitFor(() => expect(toolOutput(openai)).toContain('pass this on'))
    expect(toolOutput(openai)).not.toContain('has been notified')
  })

  it('names the reopening time when the office is shut', async () => {
    const { openai } = startCall({ closedUntil: 'tomorrow at 9am' })
    openai.connect()

    requestHuman(openai)

    await vi.waitFor(() => expect(toolOutput(openai)).toContain('reopens tomorrow at 9am'))
  })

  it('waits for the closing line before hanging up', async () => {
    const { client, openai } = startCall()
    openai.connect()
    requestHuman(openai)
    await vi.waitFor(() => expect(toolOutput(openai)).toContain('call back'))

    // Cutting the caller off here would be at the exact moment they asked for help.
    expect(client.closed).toBe(false)

    openai.receive({ type: 'response.done' })

    await vi.waitFor(() => expect(client.closed).toBe(true))
  })

  it('waits for the closing line before transferring', async () => {
    const transferToHuman = vi.fn().mockResolvedValue(true)
    const { client, openai } = startCall({ transferToHuman })
    openai.connect()
    requestHuman(openai)
    await vi.waitFor(() => expect(toolOutput(openai)).toContain('putting them through'))

    expect(transferToHuman).not.toHaveBeenCalled()

    openai.receive({ type: 'response.done' })

    await vi.waitFor(() => expect(transferToHuman).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(client.closed).toBe(true))
  })

  it('walks the promise back out loud when the transfer fails', async () => {
    // The caller has already been told they are being put through. Silence here
    // leaves them holding a line that goes nowhere.
    const transferToHuman = vi.fn().mockResolvedValue(false)
    const { client, openai } = startCall({ transferToHuman })
    openai.connect()
    requestHuman(openai)
    await vi.waitFor(() => expect(toolOutput(openai)).toContain('putting them through'))

    openai.receive({ type: 'response.done' })

    await vi.waitFor(() => expect(lastSystemPrompt(openai)).toContain('could not be completed'))
    expect(client.closed).toBe(false)

    // And the apology itself is the last thing said.
    openai.receive({ type: 'response.done' })
    await vi.waitFor(() => expect(client.closed).toBe(true))
  })

  it('acts on the pending decision exactly once', async () => {
    const { client, openai } = startCall()
    openai.connect()
    requestHuman(openai)
    await vi.waitFor(() => expect(toolOutput(openai)).toContain('call back'))

    openai.receive({ type: 'response.done' })
    await vi.waitFor(() => expect(client.closed).toBe(true))
    vi.mocked(writeVoiceCallLog).mockClear()

    openai.receive({ type: 'response.done' })

    await vi.waitFor(() => expect(writeVoiceCallLog).not.toHaveBeenCalled())
  })
})
