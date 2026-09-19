import { describe, expect, it } from 'vitest'
import { WHAT_IS_VYOSTRA } from './WhatIsVyostra'

const words = WHAT_IS_VYOSTRA.join(' ').split(/\s+/).filter(Boolean)

describe('the homepage definition block', () => {
  it('opens with the definition an engine can quote', () => {
    expect(WHAT_IS_VYOSTRA[0]?.startsWith('Vyostra AI is ')).toBe(true)
  })

  // The length answer engines most often lift whole. Past it, the block gets
  // truncated mid-thought; well under it, it is too thin to stand alone.
  it('stays in the 134-167 word citable range', () => {
    expect(words.length).toBeGreaterThanOrEqual(134)
    expect(words.length).toBeLessThanOrEqual(167)
  })
})
