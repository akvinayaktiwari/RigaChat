import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { VoiceAgentVoice, VoiceCallLog } from '../types/index.js'
import { generateToken } from './auth.js'
import { writeVoiceCallLog } from '../repositories/voice-repository.js'

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

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error(
    'Missing required environment variable OPENAI_API_KEY. Set it in your .env file before starting the server.'
  )
}

export interface VoiceAgentConfig {
  agentId: string
  clientId: string
  voice: VoiceAgentVoice
  instructions: string
  firstMessage: string
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
}

interface VoiceContext {
  instructions?: string
  voice?: VoiceAgentVoice
  botName?: string
}

export class VoiceSession {
  private browserWs: WebSocket
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
  private fallbackVoice: VoiceAgentVoice
  private context: VoiceContext = {}

  constructor(browserWs: WebSocket, agentConfig: VoiceAgentConfig) {
    this.browserWs = browserWs
    this.agentId = agentConfig.agentId
    this.clientId = agentConfig.clientId
    this.fallbackVoice = agentConfig.voice

    this.openaiWs = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    this.openaiWs.on('open', () => {
      this.openaiReady = true

      if (this.contextReceived) {
        this.sendSessionUpdate(this.context.instructions ?? FALLBACK_INSTRUCTIONS, this.context.voice ?? this.fallbackVoice)
      }

      this.contextTimeout = setTimeout(() => {
        if (!this.sessionUpdateSent) {
          this.sendSessionUpdate(FALLBACK_INSTRUCTIONS, this.fallbackVoice)
        }
      }, CONTEXT_TIMEOUT_MS)
    })

    this.openaiWs.on('message', (data: WebSocket.RawData) => {
      this.handleOpenAIMessage(data)
    })

    this.openaiWs.on('error', (err) => {
      console.error('[VoiceRelay] OpenAI socket error:', err.message)
    })

    this.browserWs.on('message', (data: WebSocket.RawData) => {
      this.handleBrowserMessage(data)
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
            instructions: context.instructions ?? FALLBACK_INSTRUCTIONS,
            tools: REALTIME_TOOLS,
            audio: {
              input: {
                format: { type: 'audio/pcm', rate: 24000 },
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
    if (this.browserWs.readyState === WebSocket.OPEN || this.browserWs.readyState === WebSocket.CONNECTING) {
      this.browserWs.close()
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

  private handleBrowserMessage(data: WebSocket.RawData): void {
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
      this.sendToBrowser({ type: 'pong' })
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
      return
    }

    if (event.type === 'response.output_audio.delta' && event.delta) {
      this.sendToBrowser({ type: 'audio', data: event.delta })
      return
    }

    if (event.type === 'response.output_audio_transcript.delta' && event.delta?.transcript) {
      this.sendToBrowser({ type: 'transcript', text: event.delta.transcript })
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
      this.sendToBrowser({ type: 'error', message: event.error?.message ?? 'Unknown error' })
    }
  }

  private bargeIn(): void {
    if (this.openaiWs.readyState === WebSocket.OPEN) {
      this.openaiWs.send(JSON.stringify({ event_id: randomUUID(), type: 'response.cancel' }))
      this.openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.clear' }))
    }
    this.isAgentSpeaking = false
    this.currentResponseId = null
    this.sendToBrowser({ type: 'barge-in' })
  }

  private async handleToolCall(event: OpenAIRealtimeEvent): Promise<void> {
    console.log('[VoiceRelay] Tool call triggered:', event.name, event.arguments)
    let chunks: string[] = []
    try {
      const { query } = JSON.parse(event.arguments ?? '{}') as { query: string }
      console.log('[VoiceRelay] Fetching RAG chunks for query:', query)
      chunks = await this.fetchRagChunks(query)
      console.log('[VoiceRelay] RAG chunks received:', chunks.length, 'chunks')
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

  private sendToBrowser(payload: unknown): void {
    if (this.browserWs.readyState === WebSocket.OPEN) {
      this.browserWs.send(JSON.stringify(payload))
    }
  }
}
