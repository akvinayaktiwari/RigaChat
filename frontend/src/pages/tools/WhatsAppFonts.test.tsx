import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../../lib/analytics'
import { FONTS_FAQ, WhatsAppFontsTool } from './WhatsAppFonts'

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  vi.mocked(trackEvent).mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(cleanup)

function type(text: string): void {
  fireEvent.change(screen.getByLabelText('Your text'), { target: { value: text } })
}

describe('WhatsAppFontsTool', () => {
  it('offers an example before anything is typed', () => {
    render(<WhatsAppFontsTool />)
    expect(screen.getByText('Type some text to see it in every style.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try an example' }))
    expect((screen.getByLabelText('Your text') as HTMLTextAreaElement).value).toBe('Grand Opening 2026')
  })

  it('shows the text in every style', () => {
    render(<WhatsAppFontsTool />)
    type('Hi')
    expect(screen.getAllByRole('listitem')).toHaveLength(16)
    expect(screen.getByText('𝐇𝐢')).toBeTruthy()
  })

  it('copies the styled text of the style pressed', async () => {
    render(<WhatsAppFontsTool />)
    type('Hi')
    fireEvent.click(screen.getByRole('button', { name: 'Copy Bold serif' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('𝐇𝐢')
  })

  // The page promises the text never leaves the browser. The one event it
  // sends must therefore name the tool and nothing else.
  it('reports a copy to analytics with the tool name only', async () => {
    render(<WhatsAppFontsTool />)
    type('private words')
    fireEvent.click(screen.getByRole('button', { name: 'Copy Script' }))
    await screen.findByRole('button', { name: 'Copied' })
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['tool_used', { tool: 'whatsapp_fonts' }]])
  })

  it('clears the text and goes back to the prompt', () => {
    render(<WhatsAppFontsTool />)
    type('Hi')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Type some text to see it in every style.')).toBeTruthy()
  })
})

describe('FONTS_FAQ', () => {
  it('asks each question once, answers every one, and states the accessibility limit', () => {
    const questions = FONTS_FAQ.map((item) => item.question)
    expect(new Set(questions).size).toBe(questions.length)
    expect(FONTS_FAQ.length).toBeGreaterThanOrEqual(5)
    expect(FONTS_FAQ.filter((item) => item.answer.length < 40)).toEqual([])
    expect(FONTS_FAQ.some((item) => /screen reader/i.test(item.answer))).toBe(true)
  })
})
