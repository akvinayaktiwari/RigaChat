import { describe, it, expect } from 'vitest'
import { buildVoiceInstructions, type VoiceInstructionSource } from './voice-instructions.js'

const AGENT: VoiceInstructionSource = {
  name: 'Ravi',
  greetingMessage: 'Hello, Acme Estates.',
}

describe('buildVoiceInstructions', () => {
  describe('without a disclosure (the default, and every agent that exists today)', () => {
    it('is identical whether the field is absent or explicitly undefined', () => {
      expect(buildVoiceInstructions(AGENT)).toBe(
        buildVoiceInstructions({ ...AGENT, recordingDisclosure: undefined })
      )
    })

    it('treats an empty or whitespace-only disclosure as absent', () => {
      const baseline = buildVoiceInstructions(AGENT)
      expect(buildVoiceInstructions({ ...AGENT, recordingDisclosure: '' })).toBe(baseline)
      expect(buildVoiceInstructions({ ...AGENT, recordingDisclosure: '   \n ' })).toBe(baseline)
    })

    it('mentions recording nowhere', () => {
      expect(buildVoiceInstructions(AGENT).toLowerCase()).not.toContain('record')
    })

    it('generates a greeting persona when there is no system prompt', () => {
      const instructions = buildVoiceInstructions(AGENT)
      expect(instructions).toContain('You are Ravi')
      expect(instructions).toContain('Hello, Acme Estates.')
      expect(instructions).toContain('2-3 sentences max')
    })

    it('prefers the system prompt, trimmed, over the generated persona', () => {
      const instructions = buildVoiceInstructions({ ...AGENT, systemPrompt: '  You are a leasing agent.  ' })
      expect(instructions.startsWith('You are a leasing agent.')).toBe(true)
      expect(instructions).not.toContain('Hello, Acme Estates.')
    })

    it('falls back to the persona for a whitespace-only system prompt', () => {
      // The two paths disagreed here before they shared this function: the
      // context route used a whitespace prompt verbatim (length > 0), leaving
      // the model with no persona at all, while the relay generated one.
      expect(buildVoiceInstructions({ ...AGENT, systemPrompt: '   ' })).toBe(buildVoiceInstructions(AGENT))
    })
  })

  describe('with a disclosure', () => {
    const DISCLOSURE = 'This call is recorded for quality purposes.'
    const withDisclosure = buildVoiceInstructions({
      ...AGENT,
      systemPrompt: 'You are a leasing agent. Be warm and conversational.',
      recordingDisclosure: DISCLOSURE,
    })

    it('carries the line verbatim', () => {
      expect(withDisclosure).toContain(`"${DISCLOSURE}"`)
    })

    it('puts it before the persona, not after', () => {
      // Order is the point. A persona ending "be warm and conversational"
      // followed by a legal line gets softened into a paraphrase; the
      // disclosure has to be the first thing the model reads.
      expect(withDisclosure.indexOf(DISCLOSURE)).toBeLessThan(withDisclosure.indexOf('You are a leasing agent.'))
      expect(withDisclosure.startsWith('BEFORE ANYTHING ELSE')).toBe(true)
    })

    it('tells the model to speak it first and not to reword or skip it', () => {
      expect(withDisclosure).toContain('before any greeting')
      expect(withDisclosure).toContain('Do not paraphrase')
      expect(withDisclosure).toContain('even if the caller speaks first')
    })

    it('trims the configured line rather than embedding its whitespace', () => {
      const padded = buildVoiceInstructions({ ...AGENT, recordingDisclosure: `  ${DISCLOSURE}  ` })
      expect(padded).toContain(`"${DISCLOSURE}"`)
    })

    it('still carries the persona and the brevity guidance', () => {
      expect(withDisclosure).toContain('Be warm and conversational.')
      expect(withDisclosure).toContain('2-3 sentences max')
    })
  })
})
