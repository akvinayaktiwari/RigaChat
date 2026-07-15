import { VoiceConfig, VoiceSession } from '../types/index.js'

export type AudioCallback = (audioChunk: ArrayBuffer) => void
export type TranscriptCallback = (transcript: string, role: 'user' | 'assistant') => void

export interface VoiceProvider {
  connect(config: VoiceConfig): Promise<VoiceSession>
  disconnect(sessionId: string): Promise<void>
  sendAudio(sessionId: string, audioChunk: ArrayBuffer): Promise<void>
  onAudioResponse(sessionId: string, callback: AudioCallback): void
  onTranscript(sessionId: string, callback: TranscriptCallback): void
  isConnected(sessionId: string): boolean
}
