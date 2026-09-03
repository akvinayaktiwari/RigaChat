import { describe, expect, it } from 'vitest'
import {
  muLawDecodeSample,
  muLawEncodeSample,
  muLawToPcm16,
  pcm16ToMuLaw,
  pcm16FromBuffer,
  pcm16ToBuffer,
  resamplePcm16,
  telephonyToOpenAI,
  openAIToTelephony,
  OPENAI_SAMPLE_RATE,
} from './audio-codec.js'

describe('mu-law codec', () => {
  // Fixed vectors traced through the G.711 reference implementation
  // (Sun g711.c ulaw2linear). The regression net: if someone "simplifies" the
  // bit-twiddling, silence and full scale must still land where the standard
  // says.
  //
  // Note the polarity, which is the easy thing to get backwards: mu-law
  // inverts the byte before decoding, so 0x00 is the most NEGATIVE sample and
  // 0x80 the most positive -- the opposite of the intuition that 0x00 is
  // "zero" and 0xFF is "loud".
  it.each([
    [0xff, 0], // encoded silence (the idle byte) decodes to zero
    [0x7f, 0], // negative zero encodes distinctly, decodes to the same zero
    [0x80, 32124], // full-scale positive
    [0x00, -32124], // full-scale negative
  ])('decodes 0x%s to the reference sample', (byte, expected) => {
    expect(muLawDecodeSample(byte)).toBe(expected)
  })

  it('encodes silence to the standard idle byte', () => {
    expect(muLawEncodeSample(0)).toBe(0xff)
  })

  // mu-law is 16 bits -> 8, so a round trip is lossy BY DESIGN. Asserting
  // equality here would be asserting something false about the codec; what
  // matters is that the error stays small relative to the signal.
  it('round-trips samples within mu-law quantisation error', () => {
    const originals = [0, 100, -100, 1000, -1000, 8000, -8000, 20000, -20000, 32767, -32768]
    for (const original of originals) {
      const decoded = muLawDecodeSample(muLawEncodeSample(original))
      const tolerance = Math.max(256, Math.abs(original) * 0.09)
      expect(Math.abs(decoded - original)).toBeLessThanOrEqual(tolerance)
    }
  })

  it('clamps beyond full scale instead of wrapping', () => {
    // Wrapping would turn a loud sample into a loud sample of the OPPOSITE
    // sign -- an audible click on every peak rather than gentle clipping.
    const loud = muLawDecodeSample(muLawEncodeSample(32767))
    const quiet = muLawDecodeSample(muLawEncodeSample(-32768))
    expect(loud).toBeGreaterThan(7000)
    expect(quiet).toBeLessThan(-7000)
  })

  it('converts whole buffers in both directions', () => {
    const samples = Int16Array.from([0, 1000, -1000, 5000])
    const encoded = pcm16ToMuLaw(samples)
    expect(encoded).toHaveLength(4)
    expect(muLawToPcm16(encoded)).toHaveLength(4)
  })
})

describe('pcm16 buffer conversion', () => {
  it('round-trips exactly (this leg is lossless)', () => {
    const samples = Int16Array.from([0, 1, -1, 32767, -32768, 1234])
    expect(Array.from(pcm16FromBuffer(pcm16ToBuffer(samples)))).toEqual(Array.from(samples))
  })

  it('reads little-endian, matching both OpenAI audio/pcm and Plivo audio/x-l16', () => {
    // 0x0100 little-endian is 1, not 256. Getting this backwards produces
    // audio that is loud, wrong, and still "works" end to end.
    expect(pcm16FromBuffer(Buffer.from([0x01, 0x00]))[0]).toBe(1)
    expect(pcm16FromBuffer(Buffer.from([0x00, 0x01]))[0]).toBe(256)
  })

  it('survives an odd-length buffer instead of throwing', () => {
    // A truncated frame is a network artefact, not a reason to kill a live call.
    expect(pcm16FromBuffer(Buffer.from([0x01, 0x00, 0x02]))).toHaveLength(1)
  })

  it('handles an unaligned buffer slice', () => {
    // Buffers off the socket are often views into a shared pool at an odd
    // byteOffset. A naive Int16Array view would throw here; the copy does not.
    const pool = Buffer.from([0xff, 0x01, 0x00, 0x02, 0x00])
    expect(() => pcm16FromBuffer(pool.subarray(1))).not.toThrow()
  })
})

describe('resampling', () => {
  it('returns the input untouched when rates match', () => {
    const samples = Int16Array.from([1, 2, 3])
    expect(resamplePcm16(samples, 8000, 8000)).toBe(samples)
  })

  it('upsamples 8k to 24k at exactly 3x length', () => {
    const samples = Int16Array.from([0, 300, 600, 900])
    expect(resamplePcm16(samples, 8000, OPENAI_SAMPLE_RATE)).toHaveLength(12)
  })

  it('downsamples 24k to 8k at exactly a third of the length', () => {
    const samples = new Int16Array(24).fill(1000)
    expect(resamplePcm16(samples, OPENAI_SAMPLE_RATE, 8000)).toHaveLength(8)
  })

  it('preserves a constant signal through both directions', () => {
    // A DC level is the simplest thing a resampler can get wrong: if it drifts
    // here, it is attenuating or amplifying every call.
    const constant = new Int16Array(30).fill(4000)
    for (const sample of resamplePcm16(constant, 8000, OPENAI_SAMPLE_RATE)) {
      expect(Math.abs(sample - 4000)).toBeLessThanOrEqual(1)
    }
    for (const sample of resamplePcm16(constant, OPENAI_SAMPLE_RATE, 8000)) {
      expect(Math.abs(sample - 4000)).toBeLessThanOrEqual(1)
    }
  })

  it('averages rather than decimating when downsampling', () => {
    // Decimation would return the first sample of each window (0); averaging
    // returns the window mean. This is the anti-aliasing behaviour, pinned so
    // a "simplification" to every-third-sample cannot land silently.
    const ramp = Int16Array.from([0, 300, 600, 0, 300, 600])
    const result = resamplePcm16(ramp, OPENAI_SAMPLE_RATE, 8000)
    expect(result[0]).toBe(300)
  })

  it('handles empty input', () => {
    expect(resamplePcm16(new Int16Array(0), 8000, 24000)).toHaveLength(0)
    expect(resamplePcm16(new Int16Array(0), 24000, 8000)).toHaveLength(0)
  })

  it('rejects a nonsense sample rate rather than producing silent garbage', () => {
    expect(() => resamplePcm16(Int16Array.from([1]), 0, 24000)).toThrow(/Invalid sample rate/)
  })
})

describe('end-to-end format bridging', () => {
  it('converts mu-law 8k telephony audio into PCM16 24k for OpenAI', () => {
    const muLaw = pcm16ToMuLaw(Int16Array.from(new Array(160).fill(2000)))
    const openAiBase64 = telephonyToOpenAI(muLaw.toString('base64'), 'audio/x-mulaw', 8000)

    // 160 mu-law bytes -> 160 samples -> 480 samples at 24k -> 960 bytes
    expect(Buffer.from(openAiBase64, 'base64')).toHaveLength(960)
  })

  it('converts PCM16 24k OpenAI audio back to mu-law 8k for the caller', () => {
    const pcm24k = pcm16ToBuffer(new Int16Array(480).fill(2000))
    const telephonyBase64 = openAIToTelephony(pcm24k.toString('base64'), 'audio/x-mulaw', 8000)

    // 480 samples at 24k -> 160 samples at 8k -> 160 mu-law bytes
    expect(Buffer.from(telephonyBase64, 'base64')).toHaveLength(160)
  })

  it('supports L16 telephony without mu-law conversion', () => {
    const pcm8k = pcm16ToBuffer(new Int16Array(160).fill(1500))
    const openAiBase64 = telephonyToOpenAI(pcm8k.toString('base64'), 'audio/x-l16', 8000)

    expect(Buffer.from(openAiBase64, 'base64')).toHaveLength(960)
  })

  it('supports L16 at 16k, where only resampling applies', () => {
    const pcm16k = pcm16ToBuffer(new Int16Array(320).fill(1500))
    const openAiBase64 = telephonyToOpenAI(pcm16k.toString('base64'), 'audio/x-l16', 16000)

    // 320 samples at 16k -> 480 at 24k -> 960 bytes
    expect(Buffer.from(openAiBase64, 'base64')).toHaveLength(960)
  })

  it('keeps a recognisable signal through a full round trip', () => {
    // The real assertion: a tone that goes out to the caller and comes back
    // should still be that tone. Catches sign flips, endianness swaps, and
    // off-by-one resampling that unit-level length checks all pass.
    const tone = new Int16Array(480)
    for (let i = 0; i < tone.length; i += 1) {
      tone[i] = Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / OPENAI_SAMPLE_RATE))
    }

    const toCaller = openAIToTelephony(pcm16ToBuffer(tone).toString('base64'), 'audio/x-mulaw', 8000)
    const backToOpenAI = telephonyToOpenAI(toCaller, 'audio/x-mulaw', 8000)
    const recovered = pcm16FromBuffer(Buffer.from(backToOpenAI, 'base64'))

    expect(recovered).toHaveLength(tone.length)

    const originalPeak = Math.max(...Array.from(tone, Math.abs))
    const recoveredPeak = Math.max(...Array.from(recovered, Math.abs))
    // Band-limiting at 8k plus mu-law quantisation costs amplitude; losing
    // more than half of it would mean something is broken, not merely lossy.
    expect(recoveredPeak).toBeGreaterThan(originalPeak * 0.5)
  })

  it('produces silence, not noise, from silence', () => {
    const silence = pcm16ToBuffer(new Int16Array(480).fill(0))
    const toCaller = openAIToTelephony(silence.toString('base64'), 'audio/x-mulaw', 8000)
    const recovered = pcm16FromBuffer(Buffer.from(telephonyToOpenAI(toCaller, 'audio/x-mulaw', 8000), 'base64'))

    for (const sample of recovered) {
      expect(Math.abs(sample)).toBeLessThanOrEqual(8)
    }
  })

  it('handles an empty payload without throwing', () => {
    expect(telephonyToOpenAI('', 'audio/x-mulaw', 8000)).toBe('')
    expect(openAIToTelephony('', 'audio/x-mulaw', 8000)).toBe('')
  })
})
