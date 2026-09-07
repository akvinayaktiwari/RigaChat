import { EventEmitter } from 'node:events'
import type WebSocket from 'ws'
import type { VoiceAgentVoice } from '../../types/index.js'
import { openAIToTelephony, telephonyToOpenAI, type TelephonyEncoding } from '../audio-codec.js'
import type { ClientTransport } from '../session.js'

// Translates between Plivo's bidirectional audio stream and the message shape
// VoiceSession already speaks to the browser widget. VoiceSession holds this
// object exactly where it would hold a browser WebSocket and cannot tell the
// difference -- which is the point: the OpenAI Realtime logic, the RAG tool
// call, barge-in, and the call log are reused unmodified rather than forked
// into a telephony copy that would drift.
//
//   Plivo <Stream>                 adapter                    VoiceSession
//   --------------                 -------                    ------------
//   event:"start"      -->  {type:"context"} + {type:"greet"}  -->  session.update
//   event:"media"      -->  decode + resample -> {type:"audio"} -->  input_audio_buffer
//   event:"stop"       -->  close()                            -->  cleanup + call log
//                      <--  {"event":"playAudio"}   <-- {type:"audio"}
//                      <--  {"event":"clearAudio"}  <-- {type:"barge-in"}
//
// PROTOCOL SHAPES ARE UNVERIFIED AGAINST LIVE TRAFFIC. They come from Plivo's
// published audio-streaming docs, not from a call we have placed -- there is no
// Plivo account yet (the DID/KYC step is still open). The envelope field names
// below are the single most likely thing to be wrong on the first real call,
// and the failure is quiet: audio simply does not flow. Verify against the
// first live stream before trusting anything here, and treat a silent call as
// a protocol mismatch until proven otherwise. Everything BELOW the envelope
// (codec, resampling) is covered by audio-codec.test.ts and is not in doubt.
interface PlivoStartEvent {
  event: 'start'
  streamId?: string
  start?: {
    streamId?: string
    callId?: string
    mediaFormat?: {
      encoding?: string
      sampleRate?: number
    }
  }
}

interface PlivoMediaEvent {
  event: 'media'
  streamId?: string
  media?: {
    track?: string
    payload?: string
  }
}

interface PlivoStopEvent {
  event: 'stop'
  streamId?: string
}

type PlivoEvent = PlivoStartEvent | PlivoMediaEvent | PlivoStopEvent | { event: string }

export interface PlivoAdapterConfig {
  instructions: string
  voice: VoiceAgentVoice
}

// Plivo's default for Indian PSTN calls. Overridden by whatever the start
// event's mediaFormat actually reports, because a mismatch here is not a
// degraded call -- it is noise, or silence, at full volume.
const DEFAULT_ENCODING: TelephonyEncoding = 'audio/x-mulaw'
const DEFAULT_SAMPLE_RATE = 8000

function parseEncoding(raw: string | undefined): TelephonyEncoding {
  if (!raw) return DEFAULT_ENCODING
  const normalised = raw.toLowerCase()
  if (normalised.includes('l16') || normalised.includes('pcm')) return 'audio/x-l16'
  if (normalised.includes('mulaw') || normalised.includes('ulaw')) return 'audio/x-mulaw'
  // An unrecognised encoding is not a reason to guess: mu-law is the safe
  // default for PSTN, and the log line is how anyone finds out the assumption
  // was wrong instead of chasing a "bad audio quality" report for a day.
  console.warn(`[PlivoAdapter] Unrecognised media encoding "${raw}", defaulting to ${DEFAULT_ENCODING}`)
  return DEFAULT_ENCODING
}

export class PlivoAudioAdapter extends EventEmitter implements ClientTransport {
  private plivoWs: WebSocket
  private config: PlivoAdapterConfig
  private streamId: string | null = null
  private encoding: TelephonyEncoding = DEFAULT_ENCODING
  private sampleRate = DEFAULT_SAMPLE_RATE
  private started = false

  constructor(plivoWs: WebSocket, config: PlivoAdapterConfig) {
    super()
    this.plivoWs = plivoWs
    this.config = config

    this.plivoWs.on('message', (data: WebSocket.RawData) => {
      this.handlePlivoMessage(data)
    })

    this.plivoWs.on('close', () => {
      this.emit('close')
    })

    this.plivoWs.on('error', (error: Error) => {
      this.emit('error', error)
    })
  }

  // VoiceSession compares against ws's numeric constants, so delegating keeps
  // the two in the same vocabulary rather than inventing a parallel one.
  get readyState(): number {
    return this.plivoWs.readyState
  }

  private handlePlivoMessage(data: WebSocket.RawData): void {
    let event: PlivoEvent
    try {
      event = JSON.parse(data.toString())
    } catch {
      // A malformed frame is a network artefact. Dropping it keeps the call
      // alive; throwing would kill a conversation over one bad packet.
      return
    }

    switch (event.event) {
      case 'start':
        this.handleStart(event as PlivoStartEvent)
        return
      case 'media':
        this.handleMedia(event as PlivoMediaEvent)
        return
      case 'stop':
        this.close()
        return
      default:
        return
    }
  }

  private handleStart(event: PlivoStartEvent): void {
    if (this.started) return
    this.started = true

    this.streamId = event.start?.streamId ?? event.streamId ?? null
    this.encoding = parseEncoding(event.start?.mediaFormat?.encoding)
    this.sampleRate = event.start?.mediaFormat?.sampleRate ?? DEFAULT_SAMPLE_RATE

    console.log(
      `[PlivoAdapter] Stream started (streamId=${this.streamId}, encoding=${this.encoding}, rate=${this.sampleRate})`
    )

    // The browser widget sends its own context message; a phone call has no
    // browser, so the adapter supplies one from the agent record. Without this
    // the session falls back to a generic assistant and the client's persona,
    // greeting, and business context are silently gone -- the call still
    // "works", which is what makes it dangerous.
    this.emitToSession({
      type: 'context',
      instructions: this.config.instructions,
      voice: this.config.voice,
    })

    // Then make the agent speak first. A browser user clicked to start and
    // expects to talk first; a caller who dialled a number expects to be
    // greeted, and silence on answer reads as a dead line.
    this.emitToSession({ type: 'greet' })
  }

  private handleMedia(event: PlivoMediaEvent): void {
    const payload = event.media?.payload
    if (!payload) return

    try {
      this.emitToSession({
        type: 'audio',
        data: telephonyToOpenAI(payload, this.encoding, this.sampleRate),
      })
    } catch (error) {
      console.error(
        '[PlivoAdapter] Failed to convert inbound audio:',
        error instanceof Error ? error.message : error
      )
    }
  }

  private emitToSession(payload: unknown): void {
    // VoiceSession's handler JSON.parses whatever arrives, so hand it the same
    // wire format the browser would.
    this.emit('message', Buffer.from(JSON.stringify(payload)))
  }

  // Called by VoiceSession exactly as it calls browserWs.send().
  send(data: string): void {
    let message: { type?: string; data?: string }
    try {
      message = JSON.parse(data)
    } catch {
      return
    }

    if (message.type === 'audio' && message.data) {
      this.sendAudioToCaller(message.data)
      return
    }

    if (message.type === 'barge-in') {
      this.clearCallerAudio()
      return
    }

    // transcript / pong / error have no telephony equivalent. Dropping them is
    // correct, not a gap: there is no screen to render a transcript on and no
    // browser keepalive to answer.
  }

  private sendAudioToCaller(base64Pcm24k: string): void {
    if (this.plivoWs.readyState !== this.plivoWs.OPEN) return

    try {
      this.plivoWs.send(
        JSON.stringify({
          event: 'playAudio',
          media: {
            contentType: this.encoding,
            sampleRate: this.sampleRate,
            payload: openAIToTelephony(base64Pcm24k, this.encoding, this.sampleRate),
          },
        })
      )
    } catch (error) {
      console.error(
        '[PlivoAdapter] Failed to send audio to caller:',
        error instanceof Error ? error.message : error
      )
    }
  }

  // Barge-in. Without this the caller interrupts, the agent stops generating,
  // but everything already queued at Plivo keeps playing -- so the agent talks
  // over the caller for seconds after being cut off, which is the single most
  // irritating failure mode in a voice product.
  private clearCallerAudio(): void {
    if (this.plivoWs.readyState !== this.plivoWs.OPEN) return

    try {
      this.plivoWs.send(
        JSON.stringify({
          event: 'clearAudio',
          ...(this.streamId ? { streamId: this.streamId } : {}),
        })
      )
    } catch (error) {
      console.error(
        '[PlivoAdapter] Failed to clear caller audio:',
        error instanceof Error ? error.message : error
      )
    }
  }

  close(): void {
    if (this.plivoWs.readyState === this.plivoWs.OPEN || this.plivoWs.readyState === this.plivoWs.CONNECTING) {
      this.plivoWs.close()
    }
  }
}
