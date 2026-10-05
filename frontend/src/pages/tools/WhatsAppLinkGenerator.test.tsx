import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
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

/** Stands in for the QR tool: prints the navigation state and address it was opened with. */
function QrToolProbe() {
  const location = useLocation()
  return <p data-testid="qr-tool">{`${location.pathname}${location.search} ${JSON.stringify(location.state)}`}</p>
}

function renderBuilder(): void {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<LinkBuilder />} />
        <Route path="/tools/whatsapp-qr-code-generator" element={<QrToolProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

function type(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('LinkBuilder', () => {
  it('asks for a number before it shows a link', () => {
    renderBuilder()
    expect(screen.getByText('Enter a phone number to build the link.')).toBeTruthy()
    expect(screen.queryByText(/wa\.me/)).toBeNull()
  })

  it('builds the link as the number and message are typed', () => {
    renderBuilder()
    type(/WhatsApp number/, '(415) 555-0132')
    type(/Pre-filled message/, 'Hi there')
    expect(screen.getByText('https://wa.me/14155550132?text=Hi%20there')).toBeTruthy()
  })

  it('uses the country that was picked', () => {
    renderBuilder()
    type(/Country/, '971')
    type(/WhatsApp number/, '050 123 4567')
    expect(screen.getByText('https://wa.me/971501234567')).toBeTruthy()
  })

  it('offers the same link to test in WhatsApp', () => {
    renderBuilder()
    type(/WhatsApp number/, '9876543210')
    expect(screen.getByRole('link', { name: 'Test the link' }).getAttribute('href')).toBe('https://wa.me/19876543210')
  })

  it('copies the link', async () => {
    renderBuilder()
    type(/WhatsApp number/, '9876543210')
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    expect(writeText).toHaveBeenCalledWith('https://wa.me/19876543210')
  })

  // The page promises the number never leaves the browser. The one event it
  // sends must therefore carry nothing at all.
  it('reports a copy to analytics with no parameters', async () => {
    renderBuilder()
    type(/WhatsApp number/, '9876543210')
    type(/Pre-filled message/, 'private text')
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await screen.findByRole('button', { name: 'Copied' })
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['whatsapp_link_copy']])
  })

  // The number is handed to the QR tool as navigation state. An address would
  // put it in server logs and in the page view analytics records.
  it('hands the number to the QR tool without putting it in the address', () => {
    renderBuilder()
    type(/Country/, '44')
    type(/WhatsApp number/, '07700 900123')
    type(/Pre-filled message/, 'Hi')
    fireEvent.click(screen.getByRole('link', { name: 'Get QR code' }))
    expect(screen.getByTestId('qr-tool').textContent).toBe(
      '/tools/whatsapp-qr-code-generator {"countryCode":"44","phone":"07700 900123","message":"Hi"}',
    )
  })
})

describe('LINK_GENERATOR_FAQ', () => {
  it('asks each question once and answers every one', () => {
    const questions = LINK_GENERATOR_FAQ.map((item) => item.question)
    expect(new Set(questions).size).toBe(questions.length)
    expect(LINK_GENERATOR_FAQ.filter((item) => item.answer.length < 40)).toEqual([])
  })
})
