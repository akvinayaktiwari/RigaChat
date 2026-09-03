import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlivoAudioAdapter } from './plivo-audio-adapter.js'
import { pcm16ToBuffer, pcm16ToMuLaw } from '../audio-codec.js'

// Stands in for the Plivo WebSocket. Extends EventEmitter so the adapter's
// real listener wiring is exercised rather than stubbed.
class FakePlivoSocket extends EventEmitter {
  readyState = 1
  readonly OPEN = 1
  readonly CONNECTING = 0
  sent: string[] = []
  closed = false

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.readyState = 3
  }

  sentEvents(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw))
  }
}

function startEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event: 'start',
    start: {
      streamId: 'stream-1',
      callId: 'call-1',
      mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000 },
      ...overrides,
    },
  })
}

function mediaEvent(payload: string): string {
  return JSON.stringify({ event: 'media', streamId: 'stream-1', media: { track: 'inbound', payload } })
}

const CONFIG = { instructions: 'You are Ravi from Acme Estates.', voice: 'coral' as const }

let socket: FakePlivoSocket
let adapter: PlivoAudioAdapter
let toSession: Array<Record<string, unknown>>

beforeEach(() => {
  socket = new FakePlivoSocket()
  adapter = new PlivoAudioAdapter(socket as never, CONFIG)
  toSession = []
  adapter.on('message', (data: Buffer) => {
    toSession.push(JSON.parse(data.toString()))
  })
})

describe('stream start', () => {
  // The two things a phone call needs that a browser call does not. Both fail
  // silently if dropped: the call connects, the caller hears a generic
  // assistant, or hears nothing at all.
  it('supplies the agent persona the browser would otherwise have sent', () => {
    socket.emit('message', Buffer.from(startEvent()))

    expect(toSession[0]).toEqual({
      type: 'context',
      instructions: 'You are Ravi from Acme Estates.',
      voice: 'coral',
    })
  })

  it('asks the agent to speak first, so the caller is not met with silence', () => {
    socket.emit('message', Buffer.from(startEvent()))

    expect(toSession[1]).toEqual({ type: 'greet' })
  })

  it('ignores a duplicate start rather than greeting twice', () => {
    socket.emit('message', Buffer.from(startEvent()))
    socket.emit('message', Buffer.from(startEvent()))

    expect(toSession.filter((m) => m.type === 'greet')).toHaveLength(1)
  })

  it('adopts the media format the stream actually reports', () => {
    socket.emit('message', Buffer.from(startEvent({ mediaFormat: { encoding: 'audio/x-l16', sampleRate: 16000 } })))

    // 320 L16 samples at 16k -> 480 at 24k -> 960 bytes. Proves the reported
    // format drove conversion; assuming mu-law/8k here would give a different
    // length and unusable audio.
    socket.emit('message', Buffer.from(mediaEvent(pcm16ToBuffer(new Int16Array(320).fill(1000)).toString('base64'))))

    const audio = toSession.find((m) => m.type === 'audio')
    expect(Buffer.from(audio?.data as string, 'base64')).toHaveLength(960)
  })

  it('falls back to mu-law 8k when the format is missing or unrecognised', () => {
    socket.emit('message', Buffer.from(startEvent({ mediaFormat: { encoding: 'audio/weird' } })))
    socket.emit('message', Buffer.from(mediaEvent(pcm16ToMuLaw(new Int16Array(160).fill(1000)).toString('base64'))))

    const audio = toSession.find((m) => m.type === 'audio')
    expect(Buffer.from(audio?.data as string, 'base64')).toHaveLength(960)
  })
})

describe('inbound audio (caller -> OpenAI)', () => {
  beforeEach(() => {
    socket.emit('message', Buffer.from(startEvent()))
    toSession.length = 0
  })

  it('converts mu-law 8k media into PCM16 24k audio messages', () => {
    socket.emit('message', Buffer.from(mediaEvent(pcm16ToMuLaw(new Int16Array(160).fill(2000)).toString('base64'))))

    expect(toSession).toHaveLength(1)
    expect(toSession[0].type).toBe('audio')
    expect(Buffer.from(toSession[0].data as string, 'base64')).toHaveLength(960)
  })

  it('ignores a media event with no payload', () => {
    socket.emit('message', Buffer.from(JSON.stringify({ event: 'media', media: {} })))

    expect(toSession).toHaveLength(0)
  })

  it('survives a malformed frame instead of killing the call', () => {
    // One bad packet must not end a conversation.
    expect(() => socket.emit('message', Buffer.from('not json at all'))).not.toThrow()
    expect(toSession).toHaveLength(0)
  })

  it('ignores unknown Plivo events', () => {
    expect(() =>
      socket.emit('message', Buffer.from(JSON.stringify({ event: 'someFutureEvent' })))
    ).not.toThrow()
    expect(toSession).toHaveLength(0)
  })
})

describe('outbound audio (OpenAI -> caller)', () => {
  beforeEach(() => {
    socket.emit('message', Buffer.from(startEvent()))
    socket.sent.length = 0
  })

  it('wraps agent audio in playAudio, converted back to the stream format', () => {
    adapter.send(JSON.stringify({ type: 'audio', data: pcm16ToBuffer(new Int16Array(480).fill(2000)).toString('base64') }))

    const [event] = socket.sentEvents()
    expect(event.event).toBe('playAudio')
    expect(event.media).toMatchObject({ contentType: 'audio/x-mulaw', sampleRate: 8000 })
    // 480 samples at 24k -> 160 at 8k -> 160 mu-law bytes
    expect(Buffer.from((event.media as { payload: string }).payload, 'base64')).toHaveLength(160)
  })

  // Barge-in is the difference between an agent that can be interrupted and
  // one that talks over the caller for seconds after being cut off.
  it('clears queued audio at Plivo on barge-in', () => {
    adapter.send(JSON.stringify({ type: 'barge-in' }))

    expect(socket.sentEvents()).toEqual([{ event: 'clearAudio', streamId: 'stream-1' }])
  })

  it('drops transcript, pong, and error, which have no telephony equivalent', () => {
    adapter.send(JSON.stringify({ type: 'transcript', text: 'hello' }))
    adapter.send(JSON.stringify({ type: 'pong' }))
    adapter.send(JSON.stringify({ type: 'error', message: 'boom' }))

    expect(socket.sent).toHaveLength(0)
  })

  it('does not write to a closed socket', () => {
    socket.readyState = 3
    adapter.send(JSON.stringify({ type: 'audio', data: pcm16ToBuffer(new Int16Array(480)).toString('base64') }))

    expect(socket.sent).toHaveLength(0)
  })

  it('ignores a malformed send payload', () => {
    expect(() => adapter.send('not json')).not.toThrow()
    expect(socket.sent).toHaveLength(0)
  })

  it('logs and continues when conversion fails, rather than throwing into the session', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // A payload that decodes to an unaligned/odd buffer must not escalate.
    adapter.send(JSON.stringify({ type: 'audio', data: '!!!not-base64!!!' }))

    expect(() => adapter.send(JSON.stringify({ type: 'audio', data: '!!!' }))).not.toThrow()
    consoleError.mockRestore()
  })
})

describe('transport surface used by VoiceSession', () => {
  it('mirrors the underlying socket readyState', () => {
    expect(adapter.readyState).toBe(1)
    socket.readyState = 3
    expect(adapter.readyState).toBe(3)
  })

  it('closes the Plivo socket', () => {
    adapter.close()
    expect(socket.closed).toBe(true)
  })

  it('closes when the caller hangs up (stop event)', () => {
    socket.emit('message', Buffer.from(JSON.stringify({ event: 'stop', streamId: 'stream-1' })))
    expect(socket.closed).toBe(true)
  })

  it('does not re-close an already closed socket', () => {
    socket.readyState = 3
    adapter.close()
    expect(socket.closed).toBe(false)
  })

  it('re-emits close and error so the relay can clean up the session', () => {
    const onClose = vi.fn()
    const onError = vi.fn()
    adapter.on('close', onClose)
    adapter.on('error', onError)

    socket.emit('close')
    socket.emit('error', new Error('socket died'))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })
})
