import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../../lib/analytics'
import { TEXT_FORMATTER_FAQ, TextFormatter } from './WhatsAppTextFormatter'

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  vi.mocked(trackEvent).mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(cleanup)

function box(): HTMLTextAreaElement {
  return screen.getByLabelText('Your message') as HTMLTextAreaElement
}

/** Types a message and selects the part between the two offsets. */
function typeAndSelect(text: string, start: number, end: number): void {
  fireEvent.change(box(), { target: { value: text } })
  box().setSelectionRange(start, end)
}

function press(label: string): void {
  fireEvent.click(screen.getByRole('button', { name: label }))
}

describe('TextFormatter', () => {
  it('offers an example before anything is typed', () => {
    render(<TextFormatter />)
    expect(screen.getByText('Type a message to see how it will look in WhatsApp.')).toBeTruthy()
    press('Try an example')
    expect(box().value).toContain('*Weekend opening hours*')
    expect(screen.getByText('Weekend opening hours').closest('strong')).not.toBeNull()
  })

  it('wraps the selected words and keeps them selected', () => {
    render(<TextFormatter />)
    typeAndSelect('Sale ends Friday', 10, 16)
    press('Bold')
    expect(box().value).toBe('Sale ends *Friday*')
    expect([box().selectionStart, box().selectionEnd]).toEqual([10, 18])
  })

  it('previews the format instead of the symbols', () => {
    render(<TextFormatter />)
    typeAndSelect('was 40 now 30', 0, 6)
    press('Strikethrough')
    expect(screen.getByText('was 40').closest('s')).not.toBeNull()
    expect(screen.queryByText(/~/, { selector: 's span' })).toBeNull()
  })

  it('turns the selected lines into a list', () => {
    render(<TextFormatter />)
    typeAndSelect('apples\npears', 0, 12)
    press('Bulleted list')
    expect(box().value).toBe('- apples\n- pears')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['apples', 'pears'])
  })

  it('formats with the keyboard shortcut', () => {
    render(<TextFormatter />)
    typeAndSelect('hello', 0, 5)
    fireEvent.keyDown(box(), { key: 'i', ctrlKey: true })
    expect(box().value).toBe('_hello_')
  })

  it('copies the message with its symbols, which is what WhatsApp reads', async () => {
    render(<TextFormatter />)
    typeAndSelect('hello', 0, 5)
    press('Bold')
    press('Copy message')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('*hello*')
  })

  // The page promises the message never leaves the browser. The one event it
  // sends must therefore name the tool and nothing else.
  it('reports a copy to analytics with the tool name only', async () => {
    render(<TextFormatter />)
    typeAndSelect('private text', 0, 7)
    press('Copy message')
    await screen.findByRole('button', { name: 'Copied' })
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['tool_used', { tool: 'whatsapp_text_formatter' }]])
  })

  it('clears the message', () => {
    render(<TextFormatter />)
    typeAndSelect('hello', 0, 0)
    press('Clear')
    expect(box().value).toBe('')
  })
})

describe('TEXT_FORMATTER_FAQ', () => {
  it('asks each question once and answers every one', () => {
    const questions = TEXT_FORMATTER_FAQ.map((item) => item.question)
    expect(new Set(questions).size).toBe(questions.length)
    expect(TEXT_FORMATTER_FAQ.length).toBeGreaterThanOrEqual(5)
    expect(TEXT_FORMATTER_FAQ.filter((item) => item.answer.length < 40)).toEqual([])
  })
})
