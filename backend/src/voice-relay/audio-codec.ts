// Audio format conversion between the telephony leg and the OpenAI Realtime leg.
//
// The two ends do not agree on anything and never will:
//
//   Plivo (telephony)        8 kHz, G.711 mu-law (or L16 if configured)
//   OpenAI Realtime         24 kHz, PCM16                (session.ts hardcodes
//                                                         audio/pcm rate 24000)
//
// Conversion lives here as pure functions rather than inside the adapter so it
// can be tested without a socket, a phone number, or a Plivo account. The
// adapter owns the envelope; this module owns the samples.
//
// Endianness: PCM16 here is little-endian throughout, which is what both
// OpenAI's audio/pcm and Plivo's audio/x-l16 use.

const MU_LAW_BIAS = 0x84
const MU_LAW_CLIP = 8159

// G.711 mu-law decode (ITU-T G.711, the Sun g711.c reference implementation).
// A byte maps to one 16-bit sample; the encoding is logarithmic, so this is a
// table-free bit-twiddle rather than arithmetic scaling.
export function muLawDecodeSample(muLawByte: number): number {
  const inverted = ~muLawByte & 0xff
  let magnitude = ((inverted & 0x0f) << 3) + MU_LAW_BIAS
  magnitude <<= (inverted & 0x70) >> 4
  return inverted & 0x80 ? MU_LAW_BIAS - magnitude : magnitude - MU_LAW_BIAS
}

const MU_LAW_SEGMENT_ENDS = [0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff]

function muLawSegment(value: number): number {
  for (let segment = 0; segment < MU_LAW_SEGMENT_ENDS.length; segment += 1) {
    if (value <= MU_LAW_SEGMENT_ENDS[segment]) {
      return segment
    }
  }
  return MU_LAW_SEGMENT_ENDS.length
}

// G.711 mu-law encode. Lossy by definition -- 16 bits down to 8 -- so
// round-tripping a sample returns a near neighbour, not the original. The
// tests assert closeness, never equality, because asserting equality here
// would be asserting something false about the codec.
export function muLawEncodeSample(pcmSample: number): number {
  let value = pcmSample >> 2 // mu-law works on 14-bit magnitudes
  let mask: number

  if (value < 0) {
    value = -value
    mask = 0x7f
  } else {
    mask = 0xff
  }

  if (value > MU_LAW_CLIP) {
    value = MU_LAW_CLIP
  }
  value += MU_LAW_BIAS >> 2

  const segment = muLawSegment(value)
  if (segment >= MU_LAW_SEGMENT_ENDS.length) {
    return 0x7f ^ mask
  }

  const quantised = (segment << 4) | ((value >> (segment + 1)) & 0x0f)
  return quantised ^ mask
}

export function muLawToPcm16(muLaw: Buffer): Int16Array {
  const samples = new Int16Array(muLaw.length)
  for (let i = 0; i < muLaw.length; i += 1) {
    samples[i] = muLawDecodeSample(muLaw[i])
  }
  return samples
}

export function pcm16ToMuLaw(samples: Int16Array): Buffer {
  const encoded = Buffer.allocUnsafe(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    encoded[i] = muLawEncodeSample(samples[i])
  }
  return encoded
}

export function pcm16FromBuffer(buffer: Buffer): Int16Array {
  // Copy rather than view: a Buffer from the socket may be a slice of a shared
  // pool whose byteOffset is not 2-byte aligned, and Int16Array demands
  // alignment. A view would throw on exactly the traffic that is hardest to
  // reproduce.
  const samples = new Int16Array(Math.floor(buffer.length / 2))
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = buffer.readInt16LE(i * 2)
  }
  return samples
}

export function pcm16ToBuffer(samples: Int16Array): Buffer {
  const buffer = Buffer.allocUnsafe(samples.length * 2)
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i], i * 2)
  }
  return buffer
}

function clampToInt16(value: number): number {
  if (value > 32767) return 32767
  if (value < -32768) return -32768
  return Math.round(value)
}

// Upsample by linear interpolation (8k -> 24k on the inbound leg).
//
// Interpolation, not sample-repetition: repeating samples injects harmonics
// that sound like a rasp on speech, and this audio is about to be transcribed
// by a model whose accuracy is the entire product. Linear is a deliberate
// stopping point -- a windowed-sinc filter would be measurably cleaner and is
// not worth its complexity until a real call proves the difference audible.
function upsample(samples: Int16Array, ratio: number): Int16Array {
  if (samples.length === 0) return new Int16Array(0)

  const output = new Int16Array(Math.floor(samples.length * ratio))
  for (let i = 0; i < output.length; i += 1) {
    const sourceIndex = i / ratio
    const lower = Math.floor(sourceIndex)
    const upper = Math.min(lower + 1, samples.length - 1)
    const fraction = sourceIndex - lower
    output[i] = clampToInt16(samples[lower] * (1 - fraction) + samples[upper] * fraction)
  }
  return output
}

// Downsample by averaging each output sample's source window (24k -> 8k on the
// outbound leg).
//
// Averaging, not decimation. Dropping 2 of every 3 samples folds everything
// above 4 kHz back down into the speech band as aliasing -- audible as a
// metallic edge on sibilants, and worst on exactly the consonants a caller
// needs to hear in a unit number. A box filter is not a good low-pass, but it
// is enormously better than none and costs one add per sample.
function downsample(samples: Int16Array, ratio: number): Int16Array {
  if (samples.length === 0) return new Int16Array(0)

  const output = new Int16Array(Math.floor(samples.length / ratio))
  for (let i = 0; i < output.length; i += 1) {
    const start = Math.floor(i * ratio)
    const end = Math.min(Math.floor((i + 1) * ratio), samples.length)
    let sum = 0
    for (let j = start; j < end; j += 1) {
      sum += samples[j]
    }
    output[i] = clampToInt16(sum / Math.max(end - start, 1))
  }
  return output
}

export function resamplePcm16(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate <= 0 || toRate <= 0) {
    throw new Error(`Invalid sample rates: ${fromRate} -> ${toRate}`)
  }
  if (fromRate === toRate) return samples
  return toRate > fromRate ? upsample(samples, toRate / fromRate) : downsample(samples, fromRate / toRate)
}

export const OPENAI_SAMPLE_RATE = 24000

export type TelephonyEncoding = 'audio/x-mulaw' | 'audio/x-l16'

// Telephony -> OpenAI. Base64 in, base64 out, because that is what both
// protocols carry on the wire.
export function telephonyToOpenAI(
  base64Payload: string,
  encoding: TelephonyEncoding,
  sampleRate: number
): string {
  const raw = Buffer.from(base64Payload, 'base64')
  const samples = encoding === 'audio/x-mulaw' ? muLawToPcm16(raw) : pcm16FromBuffer(raw)
  const resampled = resamplePcm16(samples, sampleRate, OPENAI_SAMPLE_RATE)
  return pcm16ToBuffer(resampled).toString('base64')
}

// OpenAI -> telephony.
export function openAIToTelephony(
  base64Pcm24k: string,
  encoding: TelephonyEncoding,
  sampleRate: number
): string {
  const samples = pcm16FromBuffer(Buffer.from(base64Pcm24k, 'base64'))
  const resampled = resamplePcm16(samples, OPENAI_SAMPLE_RATE, sampleRate)
  const encoded = encoding === 'audio/x-mulaw' ? pcm16ToMuLaw(resampled) : pcm16ToBuffer(resampled)
  return encoded.toString('base64')
}
