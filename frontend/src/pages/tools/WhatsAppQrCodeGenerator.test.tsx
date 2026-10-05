import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../../lib/analytics'
import { QR_CREDIT_TEXT } from '../../lib/qr-code'
import { qrPngBlob, saveBlob } from '../../lib/qr-download'
import { QR_GENERATOR_FAQ, QrBuilder } from './WhatsAppQrCodeGenerator'

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))
// jsdom has no canvas and no object URLs; the drawing itself is covered in lib/qr-code.test.ts.
vi.mock('../../lib/qr-download', () => ({
  qrPngBlob: vi.fn(),
  qrSvgBlob: vi.fn(() => new Blob(['<svg/>'], { type: 'image/svg+xml' })),
  saveBlob: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(trackEvent).mockReset()
  vi.mocked(saveBlob).mockReset()
  vi.mocked(qrPngBlob).mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
})

afterEach(cleanup)

interface HandedOver {
  countryCode: string
  phone: string
  message: string
}

function renderBuilder(state?: HandedOver): void {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/tools/whatsapp-qr-code-generator', state }]}>
      <QrBuilder />
    </MemoryRouter>,
  )
}

function type(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

/** The preview is an SVG data address, so the drawing can be read back out of it. */
async function previewSvg(): Promise<string> {
  const image = await screen.findByRole('img')
  return decodeURIComponent(image.getAttribute('src') ?? '')
}

describe('QrBuilder', () => {
  it('asks for a number before it draws a code', () => {
    renderBuilder()
    expect(screen.getByText('Enter a phone number to build the QR code.')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('draws a code for the number, and says whose it is', async () => {
    renderBuilder()
    type(/WhatsApp number/, '(415) 555-0132')
    const image = await screen.findByRole('img')
    expect(image.getAttribute('alt')).toBe('QR code that opens a WhatsApp chat with +14155550132')
  })

  it('draws a denser code when a message is added', async () => {
    renderBuilder()
    type(/WhatsApp number/, '4155550132')
    const before = (await previewSvg()).match(/viewBox="0 0 (\d+)/)?.[1]
    type(/Pre-filled message/, 'Hello, I would like a price list and your opening hours please')
    await waitFor(async () => expect((await previewSvg()).match(/viewBox="0 0 (\d+)/)?.[1]).not.toBe(before))
  })

  it('starts from the number the link generator handed over', async () => {
    renderBuilder({ countryCode: '44', phone: '07700 900123', message: 'Hi' })
    const image = await screen.findByRole('img')
    expect(image.getAttribute('alt')).toBe('QR code that opens a WhatsApp chat with +447700900123')
    expect((screen.getByLabelText(/Pre-filled message/) as HTMLTextAreaElement).value).toBe('Hi')
  })

  it('carries the credit line until it is switched off', async () => {
    renderBuilder()
    type(/WhatsApp number/, '4155550132')
    expect(await previewSvg()).toContain(QR_CREDIT_TEXT)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(await previewSvg()).not.toContain(QR_CREDIT_TEXT)
  })

  it('draws the colours that were picked', async () => {
    renderBuilder()
    type(/WhatsApp number/, '4155550132')
    type('Code colour', '#075e54')
    expect(await previewSvg()).toContain('<path fill="#075e54"')
  })

  it('warns when the code is lighter than its background', async () => {
    renderBuilder()
    type(/WhatsApp number/, '4155550132')
    type('Code colour', '#ffffff')
    type('Background', '#000000')
    expect(await screen.findByText(/light code on a dark background/)).toBeTruthy()
  })

  it('saves a PNG named after the number', async () => {
    renderBuilder()
    type(/WhatsApp number/, '4155550132')
    fireEvent.click(await screen.findByRole('button', { name: 'Download PNG' }))
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1))
    expect(vi.mocked(saveBlob).mock.calls[0]?.[1]).toBe('whatsapp-qr-14155550132.png')
  })

  it('saves an SVG named after the number', async () => {
    renderBuilder()
    type(/WhatsApp number/, '4155550132')
    fireEvent.click(await screen.findByRole('button', { name: 'Download SVG' }))
    await waitFor(() => expect(saveBlob).toHaveBeenCalledTimes(1))
    expect(vi.mocked(saveBlob).mock.calls[0]?.[1]).toBe('whatsapp-qr-14155550132.svg')
  })

  // The page promises the number never leaves the browser. The one event a
  // download sends must therefore name the tool and nothing else.
  it('reports a download to analytics with the tool name only', async () => {
    renderBuilder()
    type(/WhatsApp number/, '4155550132')
    type(/Pre-filled message/, 'private text')
    fireEvent.click(await screen.findByRole('button', { name: 'Download SVG' }))
    await waitFor(() => expect(trackEvent).toHaveBeenCalledTimes(1))
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['tool_used', { tool: 'whatsapp_qr_code_generator' }]])
  })

  it('says so when the browser cannot save the PNG, and reports nothing', async () => {
    vi.mocked(qrPngBlob).mockRejectedValue(new Error('no canvas'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderBuilder()
    type(/WhatsApp number/, '4155550132')
    fireEvent.click(await screen.findByRole('button', { name: 'Download PNG' }))
    expect(await screen.findByText('Your browser could not save the PNG. Try the SVG instead.')).toBeTruthy()
    expect(saveBlob).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })
})

describe('QR_GENERATOR_FAQ', () => {
  it('asks each question once and answers every one', () => {
    const questions = QR_GENERATOR_FAQ.map((item) => item.question)
    expect(new Set(questions).size).toBe(questions.length)
    expect(QR_GENERATOR_FAQ.length).toBeGreaterThanOrEqual(5)
    expect(QR_GENERATOR_FAQ.filter((item) => item.answer.length < 40)).toEqual([])
  })
})
