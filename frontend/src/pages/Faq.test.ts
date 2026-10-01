import { describe, expect, it } from 'vitest'
import { FAQ_SECTIONS } from './Faq'

const questions = FAQ_SECTIONS.flatMap((section) => section.items)

describe('faq page content', () => {
  it('phrases every section heading and every question as a question', () => {
    const headings = FAQ_SECTIONS.map((section) => section.heading)
    expect([...headings, ...questions.map((item) => item.question)].filter((text) => !text.endsWith('?'))).toEqual([])
  })

  // FAQPage schema with the same Question twice is rejected by validators.
  it('asks each question once', () => {
    const asked = questions.map((item) => item.question)
    expect(new Set(asked).size).toBe(asked.length)
  })

  // An answer engine quotes an answer without its question, so each has to
  // name the product itself and end as a sentence.
  it('gives every question a self-contained answer', () => {
    const weak = questions.filter((item) => item.answer.length < 60 || !item.answer.endsWith('.'))
    expect(weak.map((item) => item.question)).toEqual([])
  })
})
