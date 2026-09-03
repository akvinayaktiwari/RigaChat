import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { VoiceAgentVoice, VoiceCallLog } from '../types/index.js'
import { generateToken } from './auth.js'
import { writeVoiceCallLog } from '../repositories/voice-repository.js'
import {
  recordCallLifecycle,
  recordCallToolUse,
  recordCallTurn,
  resolveCallLead,
  type CallIdentity,
} from '../services/voice-lead-service.js'

const REALTIME_MODEL = 'gpt-realtime'
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`
const CONTEXT_TIMEOUT_MS = 5000
const RAG_FETCH_TIMEOUT_MS = 5000
// TODO: add BACKEND_URL to the EC2 .env — it is not set there today. This is
// the current Lambda function URL (from scripts/deploy.sh) used as a fallback
// until the env var exists.
const FALLBACK_BACKEND_URL = 'https://hxtvyv6kgsasppyrvyljaezeii0zxzco.lambda-url.ap-south-1.on.aws'
const FALLBACK_INSTRUCTIONS =
  'You are a helpful voice assistant. Keep responses concise — this is a voice conversation, 2-3 sentences max.'

const KNOWLEDGE_BASE_TOOL = {
  type: 'function',
  name: 'search_knowledge_base',
  description:
    'Search the knowledge base for specific information like pricing, amenities, availability, or business policies when you do not already know the answer.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The specific question or topic to search for',
      },
    },
    required: ['query'],
  },
}

// Shared by both session.update send sites so they can never drift out of sync.
const REALTIME_TOOLS = [KNOWLEDGE_BASE_TOOL]

// Without this the model transcribes only its OWN speech: the caller's half of
// every conversation is never written down. Tolerable while the transcript was
// a live subtitle in a browser widget; not tolerable once the call becomes a
// CRM record, where "what did they actually ask for" is the entire value.
const TRANSCRIPTION = { model: 'whisper-1' }

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error(
    'Missing required environment variable OPENAI_API_KEY. Set it in your .env file before starting the server.'
  )
}

// The surface VoiceSession actually uses from its client-side socket. Narrower
// than a full WebSocket on purpose: it is the whole contract a transport must
// satisfy, so the Plivo adapter implements four members rather than faking a
// WebSocket, and the compiler enforces the boundary instead of a cast hiding it.
// The numeric readyState is ws's (OPEN === 1), shared rather than re-invented.
export interface ClientTransport {
  readyState: number
  on(event: 'message', listener: (data: WebSocket.RawData) => void): void
  send(data: string): void
  close(): void
}

export interface VoiceAgentConfig {
  agentId: string
  clientId: string
  voice: VoiceAgentVoice
  instructions: string
  firstMessage: string
  // VoiceAgent.maxSessionDuration, in minutes. Stored and validated at agent
  // creation since the beginning and never enforced anywhere, so a call could
  // run until someone noticed. Tolerable while every call started with a user
  // clicking a widget; not tolerable once a public phone number can start one.
  maxSessionMinutes?: 5 | 10 | 15
  // Telephony only. Absent for a browser call, which has no caller ID and
  // therefore no identity to join on -- so a browser session records no lead,
  // exactly as it did before. Present means: resolve who this is and write the
  // conversation into the shared lead_events stream.
  callerPhone?: string
  dialledNumber?: string
  linkedBotId?: string
}

interface OpenAIResponseUsage {
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
  input_token_details?: { audio_tokens?: number }
  output_token_details?: { audio_tokens?: number }
}

interface OpenAIRealtimeEvent {
  type: string
  response?: { id?: string; usage?: OpenAIResponseUsage }
  delta?: { audio?: string; transcript?: string }
  error?: { message?: string }
  name?: string
  arguments?: string
  call_id?: string
  transcript?: string
}

interface VoiceContext {
  instructions?: string
  voice?: VoiceAgentVoice
  botName?: string
}

export class VoiceSession {
  private clientWs: ClientTransport
  private openaiWs: WebSocket
  private agentId: string
  private clientId: string
  private callId = randomUUID()
  private startedAt = new Date().toISOString()
  private totalInputTokens = 0
  private totalOutputTokens = 0
  private totalAudioTokens = 0
  private isAgentSpeaking = false
  private currentResponseId: string | null = null
  private openaiReady = false
  private contextReceived = false
  private sessionUpdateSent = false
  private contextTimeout: NodeJS.Timeout | null = null
  private durationTimeout: NodeJS.Timeout | null = null
  private fallbackVoice: VoiceAgentVoice
  private fallbackInstructions: string
  private context: VoiceContext = {}
  private identity: CallIdentity | null = null
  private identityPending: Promise<void> | null = null
  private agentUtterance = ''

  constructor(clientWs: ClientTransport, agentConfig: VoiceAgentConfig) {
    this.clientWs = clientWs
    this.agentId = agentConfig.agentId
    this.clientId = agentConfig.clientId
    this.fallbackVoice = agentConfig.voice
    // agentConfig.instructions was previously accepted and ignored: every path
    // fell back to the generic FALLBACK_INSTRUCTIONS, so a browser whose context
    // message was slow or lost answered as an anonymous assistant instead of the
    // client's agent. A phone call has no context message at all, which turns
    // that latent bug into the normal case.
    this.fallbackInstructions = agentConfig.instructions || FALLBACK_INSTRUCTIONS

    this.openaiWs = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (agentConfig.callerPhone !== undefined) {
      this.identityPending = this.resolveIdentity(agentConfig)
    }

    if (agentConfig.maxSessionMinutes) {
      this.durationTimeout = setTimeout(
        () => {
          console.warn(
            `[VoiceRelay] Call ${this.callId} hit the ${agentConfig.maxSessionMinutes}-minute cap, ending it`
          )
          this.cleanup()
        },
        agentConfig.maxSessionMinutes * 60 * 1000
      )
    }

    this.openaiWs.on('open', () => {
      this.openaiReady = true

      if (this.contextReceived) {
        this.sendSessionUpdate(this.context.instructions ?? this.fallbackInstructions, this.context.voice ?? this.fallbackVoice)
      }

      this.contextTimeout = setTimeout(() => {
        if (!this.sessionUpdateSent) {
          this.sendSessionUpdate(this.fallbackInstructions, this.fallbackVoice)
        }
      }, CONTEXT_TIMEOUT_MS)
    })

    this.openaiWs.on('message', (data: WebSocket.RawData) => {
      this.handleOpenAIMessage(data)
    })

    this.openaiWs.on('error', (err) => {
      console.error('[VoiceRelay] OpenAI socket error:', err.message)
    })

    this.clientWs.on('message', (data: WebSocket.RawData) => {
      this.handleClientMessage(data)
    })
  }

  private applyContext(context: VoiceContext): void {
    this.contextReceived = true
    this.context = context

    if (this.openaiReady && !this.sessionUpdateSent && this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            type: 'realtime',
            instructions: context.instructions ?? this.fallbackInstructions,
            tools: REALTIME_TOOLS,
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
                transcription: TRANSCRIPTION,
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                },
              },
              output: {
                format: { type: 'audio/pcm', rate: 24000 },
              },
            },
          },
        })
      )
      this.sessionUpdateSent = true
    }
  }

  private sendSessionUpdate(instructions: string, voice: VoiceAgentVoice): void {
    if (this.openaiWs.readyState !== WebSocket.OPEN) {
      return
    }

    this.openaiWs.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          instructions,
          tools: REALTIME_TOOLS,
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: TRANSCRIPTION,
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
              },
            },
            output: {
              format: { type: 'audio/pcm', rate: 24000 },
              voice,
            },
          },
        },
      })
    )
    this.sessionUpdateSent = true
  }

  cleanup(): void {
    if (this.contextTimeout) {
      clearTimeout(this.contextTimeout)
      this.contextTimeout = null
    }

    if (this.durationTimeout) {
      clearTimeout(this.durationTimeout)
      this.durationTimeout = null
    }

    // Fire-and-forget: cleanup() is synchronous and must always close the
    // sockets below regardless of whether the log write succeeds. A sync
    // try/catch here wouldn't catch a rejection from this non-awaited async
    // call, so failures are handled via .catch() instead.
    this.writeCallLog('completed').catch((error) => {
      console.error('[VoiceRelay] Failed to write call log:', error instanceof Error ? error.message : error)
    })

    if (this.openaiWs.readyState === WebSocket.OPEN || this.openaiWs.readyState === WebSocket.CONNECTING) {
      this.openaiWs.close()
    }
    if (this.clientWs.readyState === WebSocket.OPEN || this.clientWs.readyState === WebSocket.CONNECTING) {
      this.clientWs.close()
    }
  }

  // Resolved once, at the start, and awaited by every write. Doing it lazily on
  // the first transcript would race: two turns arriving together would each see
  // no identity and create their own lead for the same caller.
  //
  // A failure here is logged and swallowed. Losing the CRM record of a call is
  // bad; dropping the call itself because DynamoDB was briefly unavailable is
  // worse, and the caller is on the line either way.
  private async resolveIdentity(agentConfig: VoiceAgentConfig): Promise<void> {
    try {
      this.identity = await resolveCallLead({
        clientId: this.clientId,
        agentId: this.agentId,
        callerPhone: agentConfig.callerPhone ?? '',
        dialledNumber: agentConfig.dialledNumber ?? '',
        callId: this.callId,
        linkedBotId: agentConfig.linkedBotId,
      })

      await recordCallLifecycle({
        identity: this.identity,
        clientId: this.clientId,
        body: this.identity.isNewLead
          ? `Inbound call to ${agentConfig.dialledNumber ?? 'unknown number'}`
          : `Inbound call to ${agentConfig.dialledNumber ?? 'unknown number'} (returning contact)`,
      })
    } catch (error) {
      console.error(
        '[VoiceRelay] Failed to resolve call identity:',
        error instanceof Error ? error.message : error
      )
    }
  }

  // Every lead write funnels through here so none of them can run before the
  // identity exists, and none of them can take a live call down.
  private async withIdentity(write: (identity: CallIdentity) => Promise<void>): Promise<void> {
    if (!this.identityPending) return
    try {
      await this.identityPending
      if (!this.identity) return
      await write(this.identity)
    } catch (error) {
      console.error(
        '[VoiceRelay] Failed to record call activity:',
        error instanceof Error ? error.message : error
      )
    }
  }

  private async writeCallLog(status: 'completed' | 'dropped' | 'error'): Promise<void> {
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.round((new Date(endedAt).getTime() - new Date(this.startedAt).getTime()) / 1000)

    const log: VoiceCallLog = {
      agentId: this.agentId,
      callId: this.callId,
      clientId: this.clientId,
      startedAt: this.startedAt,
      endedAt,
      durationSeconds,
      inputTokens: this.totalInputTokens,
      outputTokens: this.totalOutputTokens,
      audioTokens: this.totalAudioTokens,
      totalTokens: this.totalInputTokens + this.totalOutputTokens,
      status,
    }

    await writeVoiceCallLog(log)
  }

  private handleClientMessage(data: WebSocket.RawData): void {
    let message: { type: string; data?: string; instructions?: string; voice?: VoiceAgentVoice; botName?: string }
    try {
      message = JSON.parse(data.toString())
    } catch {
      return
    }

    if (message.type === 'context') {
      this.applyContext(message)
      return
    }

    if (message.type === 'audio' && message.data) {
      if (this.openaiWs.readyState === WebSocket.OPEN) {
        this.openaiWs.send(
          JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: message.data,
          })
        )
      }
      return
    }

    if (message.type === 'ping') {
      this.sendToClient({ type: 'pong' })
      return
    }

    // A caller who dialled a number expects to be greeted; silence on answer
    // reads as a dead line. The browser widget does not need this (the user
    // clicked to start and speaks first), so it is a transport-driven trigger
    // rather than something the session does unconditionally.
    if (message.type === 'greet') {
      if (this.openaiWs.readyState === WebSocket.OPEN) {
        this.openaiWs.send(JSON.stringify({ type: 'response.create' }))
      }
      return
    }

    if (message.type === 'commit') {
      if (this.openaiWs.readyState === WebSocket.OPEN) {
        this.openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }))
        this.openaiWs.send(JSON.stringify({ type: 'response.create' }))
      }
    }
  }

  private handleOpenAIMessage(data: WebSocket.RawData): void {
    let event: OpenAIRealtimeEvent
    try {
      event = JSON.parse(data.toString())
    } catch {
      return
    }

    if (event.type === 'response.created') {
      this.isAgentSpeaking = true
      this.currentResponseId = event.response?.id ?? null
      return
    }

    if (event.type === 'response.done') {
      if (event.response?.usage) {
        this.totalInputTokens += event.response.usage.input_tokens ?? 0
        this.totalOutputTokens += event.response.usage.output_tokens ?? 0
        this.totalAudioTokens +=
          (event.response.usage.input_token_details?.audio_tokens ?? 0) +
          (event.response.usage.output_token_details?.audio_tokens ?? 0)
      }
      this.isAgentSpeaking = false
      this.currentResponseId = null
      this.flushAgentUtterance()
      return
    }

    if (event.type === 'response.output_audio.delta' && event.delta) {
      this.sendToClient({ type: 'audio', data: event.delta })
      return
    }

    if (event.type === 'response.output_audio_transcript.delta' && event.delta?.transcript) {
      // Accumulated rather than written per delta: a delta is a word fragment,
      // and fifty rows saying "the", "unit", "is" is not a transcript anyone
      // can read. Flushed as one turn on response.done below.
      this.agentUtterance += event.delta.transcript
      this.sendToClient({ type: 'transcript', text: event.delta.transcript })
      return
    }

    // The caller's half. Requires TRANSCRIPTION to be set in session.update --
    // without it this event never fires and only the agent is ever recorded.
    if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
      const callerText = event.transcript
      void this.withIdentity((identity) =>
        recordCallTurn({ identity, clientId: this.clientId, role: 'caller', text: callerText })
      )
      return
    }

    if (event.type === 'input_audio_buffer.speech_started') {
      if (this.isAgentSpeaking) {
        this.bargeIn()
      }
      return
    }

    if (event.type === 'response.function_call_arguments.done' && event.name === 'search_knowledge_base') {
      console.log('[VoiceRelay] OpenAI requested tool call')
      this.handleToolCall(event)
      return
    }

    if (event.type === 'error') {
      console.error('[VoiceRelay] OpenAI error event:', event.error?.message)
      this.sendToClient({ type: 'error', message: event.error?.message ?? 'Unknown error' })
    }
  }

  private bargeIn(): void {
    if (this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.send(JSON.stringify({ event_id: randomUUID(), type: 'response.cancel' }))
      this.openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
    }
    this.isAgentSpeaking = false
    this.currentResponseId = null
    // The caller interrupted, but the agent did say something before being cut
    // off and the caller heard it. Dropping it would leave a transcript where
    // the caller answers a question nobody asked.
    this.flushAgentUtterance()
    this.sendToClient({ type: 'barge-in' })
  }

  private flushAgentUtterance(): void {
    const utterance = this.agentUtterance.trim()
    this.agentUtterance = ''
    if (!utterance) return

    void this.withIdentity((identity) =>
      recordCallTurn({ identity, clientId: this.clientId, role: 'agent', text: utterance })
    )
  }

  private async handleToolCall(event: OpenAIRealtimeEvent): Promise<void> {
    console.log('[VoiceRelay] Tool call triggered:', event.name, event.arguments)
    let chunks: string[] = []
    try {
      const { query } = JSON.parse(event.arguments ?? '{}') as { query: string }
      console.log('[VoiceRelay] Fetching RAG chunks for query:', query)
      chunks = await this.fetchRagChunks(query)
      console.log('[VoiceRelay] RAG chunks received:', chunks.length, 'chunks')
      void this.withIdentity((identity) =>
        recordCallToolUse({ identity, clientId: this.clientId, query, resultCount: chunks.length })
      )
    } catch (error) {
      console.log('[VoiceRelay] Tool call failed:', error)
      console.error('[VoiceRelay] Tool call failed:', error instanceof Error ? error.message : error)
    }

    if (this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: event.call_id,
            output: chunks.join('\n\n') || 'No specific information found.',
          },
        })
      )
      this.openaiWs.send(JSON.stringify({ type: 'response.create' }))
    }
  }

  private async fetchRagChunks(query: string): Promise<string[]> {
    const token = generateToken(this.agentId, process.env.VOICE_AUTH_SECRET ?? '')
    const backendUrl = process.env.BACKEND_URL ?? FALLBACK_BACKEND_URL

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), RAG_FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(`${backendUrl}/api/voice-agents/rag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: this.agentId, query, token }),
        signal: controller.signal,
      })

      if (!response.ok) {
        return []
      }

      const data = (await response.json()) as { chunks?: string[] }
      return data.chunks ?? []
    } finally {
      clearTimeout(timeout)
    }
  }

  private sendToClient(payload: unknown): void {
    if (this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(payload))
    }
  }
}
