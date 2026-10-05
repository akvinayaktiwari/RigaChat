import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../../lib/analytics'
import { LINK_GENERATOR_FAQ, LinkBuilder } from './WhatsAppLinkGenerator'

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  vi.mocked(trackEvent).mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(cleanup)

function type(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('LinkBuilder', () => {
  it('asks for a number before it shows a link', () => {
    render(<LinkBuilder />)
    expect(screen.getByText('Enter a phone number to build the link.')).toBeTruthy()
    expect(screen.queryByText(/wa\.me/)).toBeNull()
  })

  it('builds the link as the number and message are typed', () => {
    render(<LinkBuilder />)
    type(/WhatsApp number/, '(415) 555-0132')
    type(/Pre-filled message/, 'Hi there')
    expect(screen.getByText('https://wa.me/14155550132?text=Hi%20there')).toBeTruthy()
  })

  it('uses the country that was picked', () => {
    render(<LinkBuilder />)
    type(/Country/, '971')
    type(/WhatsApp number/, '050 123 4567')
    expect(screen.getByText('https://wa.me/971501234567')).toBeTruthy()
  })

  it('offers the same link to test in WhatsApp', () => {
    render(<LinkBuilder />)
    type(/WhatsApp number/, '9876543210')
    expect(screen.getByRole('link', { name: 'Test the link' }).getAttribute('href')).toBe('https://wa.me/19876543210')
  })

  it('copies the link', async () => {
    render(<LinkBuilder />)
    type(/WhatsApp number/, '9876543210')
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('https://wa.me/19876543210')
  })

  // The page promises the number never leaves the browser. The one event it
  // sends must therefore carry nothing at all.
  it('reports a copy to analytics with no parameters', async () => {
    render(<LinkBuilder />)
    type(/WhatsApp number/, '9876543210')
    type(/Pre-filled message/, 'private text')
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await screen.findByRole('button', { name: 'Copied' })
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['whatsapp_link_copy']])
  })
})

describe('LINK_GENERATOR_FAQ', () => {
  it('asks each question once and answers every one', () => {
    const questions = LINK_GENERATOR_FAQ.map((item) => item.question)
    expect(new Set(questions).size).toBe(questions.length)
    expect(LINK_GENERATOR_FAQ.filter((item) => item.answer.length < 40)).toEqual([])
  })
})
