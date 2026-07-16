import WebSocket from 'ws'
import type { VoiceConfig, VoiceSession } from '../types/index.js'
import type { AudioCallback, TranscriptCallback, VoiceProvider } from './voice-provider.js'

const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17'
const REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`

const apiKey = process.env.OPENAI_API_KEY

if (!apiKey) {
  throw new Error(
    'Missing required environment variable OPENAI_API_KEY. Set it in your .env file before starting the server.'
  )
}

export class OpenAIRealtimeProvider implements VoiceProvider {
  private sessions = new Map<string, WebSocket>()
  private audioCallbacks = new Map<string, AudioCallback>()
  private transcriptCallbacks = new Map<string, TranscriptCallback>()

  async connect(config: VoiceConfig): Promise<VoiceSession> {
    const sessionId = crypto.randomUUID()

    const ws = new WebSocket(REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    })

    this.sessions.set(sessionId, ws)

    ws.on('message', (data: WebSocket.RawData) => {
      this.handleMessage(sessionId, data)
    })

    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', (error) => reject(error))
    })

    ws.on('close', (code, reason) => {
      console.error(`[VoiceWS] OpenAI socket closed — sessionId: ${sessionId}, code: ${code}, reason: ${reason.toString()}`)
      this.sessions.delete(sessionId)
    })

    ws.on('error', (err) => {
      console.error(`[VoiceWS] OpenAI socket error — sessionId: ${sessionId}:`, err.message)
    })

    ws.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          voice: config.voice,
          instructions: `${config.ragContext}\n\n${config.greetingMessage}`,
          turn_detection: { type: 'server_vad' },
          max_response_output_tokens: 1000,
        },
      })
    )

    return {
      sessionId,
      agentId: config.agentId,
      clientId: config.clientId,
      connectionId: sessionId,
      status: 'active',
      startedAt: new Date().toISOString(),
    }
  }

  async disconnect(sessionId: string): Promise<void> {
    const ws = this.sessions.get(sessionId)
    if (!ws) {
      throw new Error(`Voice session ${sessionId} not found`)
    }

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'session.end' }))
    }
    ws.close()

    this.sessions.delete(sessionId)
    this.audioCallbacks.delete(sessionId)
    this.transcriptCallbacks.delete(sessionId)
  }

  async sendAudio(sessionId: string, audioChunk: ArrayBuffer): Promise<void> {
    const ws = this.sessions.get(sessionId)
    if (!ws) {
      throw new Error(`Voice session ${sessionId} not found`)
    }

    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Voice session ${sessionId} socket not open (readyState ${ws.readyState})`)
    }

    ws.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: Buffer.from(audioChunk).toString('base64'),
      })
    )
  }

  onAudioResponse(sessionId: string, callback: AudioCallback): void {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Voice session ${sessionId} not found`)
    }
    this.audioCallbacks.set(sessionId, callback)
  }

  onTranscript(sessionId: string, callback: TranscriptCallback): void {
    if (!this.sessions.has(sessionId)) {
      throw new Error(`Voice session ${sessionId} not found`)
    }
    this.transcriptCallbacks.set(sessionId, callback)
  }

  isConnected(sessionId: string): boolean {
    return this.sessions.has(sessionId) && this.sessions.get(sessionId)?.readyState === WebSocket.OPEN
  }

  private handleMessage(sessionId: string, data: WebSocket.RawData): void {
    let event: { type: string; delta?: string; transcript?: string }
    try {
      event = JSON.parse(data.toString())
    } catch {
      return
    }

    if (event.type === 'response.audio.delta' && event.delta) {
      const callback = this.audioCallbacks.get(sessionId)
      if (callback) {
        callback(Buffer.from(event.delta, 'base64').buffer)
      }
    }

    if (event.type === 'response.audio_transcript.done' && event.transcript) {
      const callback = this.transcriptCallbacks.get(sessionId)
      if (callback) {
        callback(event.transcript, 'assistant')
      }
    }

    if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
      const callback = this.transcriptCallbacks.get(sessionId)
      if (callback) {
        callback(event.transcript, 'user')
      }
    }
  }
}
