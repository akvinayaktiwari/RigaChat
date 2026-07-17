import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import type { VoiceAgentVoice } from '../types/index.js'

const REALTIME_MODEL = 'gpt-realtime'
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`
const CONTEXT_TIMEOUT_MS = 5000
const FALLBACK_INSTRUCTIONS =
  'You are a helpful voice assistant. Keep responses concise — this is a voice conversation, 2-3 sentences max.'

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error(
    'Missing required environment variable OPENAI_API_KEY. Set it in your .env file before starting the server.'
  )
}

export interface VoiceAgentConfig {
  voice: VoiceAgentVoice
  instructions: string
  firstMessage: string
}

interface OpenAIRealtimeEvent {
  type: string
  response?: { id?: string }
  delta?: { audio?: string; transcript?: string }
  error?: { message?: string }
}

interface VoiceContext {
  instructions?: string
  voice?: VoiceAgentVoice
  botName?: string
}

export class VoiceSession {
  private browserWs: WebSocket
  private openaiWs: WebSocket
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
    if (this.openaiWs.readyState === WebSocket.OPEN || this.openaiWs.readyState === WebSocket.CONNECTING) {
      this.openaiWs.close()
    }
    if (this.browserWs.readyState === WebSocket.OPEN || this.browserWs.readyState === WebSocket.CONNECTING) {
      this.browserWs.close()
    }
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

  private sendToBrowser(payload: unknown): void {
    if (this.browserWs.readyState === WebSocket.OPEN) {
      this.browserWs.send(JSON.stringify(payload))
    }
  }
}
