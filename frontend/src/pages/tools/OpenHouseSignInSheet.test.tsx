import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../../lib/analytics'
import { DEFAULT_CONSENT_TEXT } from '../../lib/sign-in-sheet'
import { SIGN_IN_FAQ, SignInSheetTool } from './OpenHouseSignInSheet'

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

const print = vi.fn()
const createObjectURL = vi.fn<(file: Blob) => string>()
const revokeObjectURL = vi.fn<(url: string) => void>()

beforeEach(() => {
  print.mockReset()
  createObjectURL.mockReset().mockReturnValue('blob:logo')
  revokeObjectURL.mockReset()
  vi.mocked(trackEvent).mockReset()
  vi.stubGlobal('print', print)
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function sheet(): HTMLElement {
  const element = document.getElementById('sign-in-sheet')
  if (!element) throw new Error('the sheet is not on the page')
  return element
}

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('SignInSheetTool', () => {
  it('previews the details as they are typed', () => {
    render(<SignInSheetTool />)
    type('Your name', 'Sam Rivera')
    type('Brokerage or agency', 'Harbor Realty')
    type('Property address', '12 Example Street')
    type('Date of the open house', '2026-10-17')
    const preview = within(sheet())
    expect(preview.getByText('12 Example Street')).toBeTruthy()
    expect(preview.getByText('17 October 2026')).toBeTruthy()
    expect(preview.getByText('Sam Rivera, Harbor Realty')).toBeTruthy()
  })

  it('starts with name, phone, email and “working with an agent” as columns', () => {
    render(<SignInSheetTool />)
    const headings = within(sheet()).getAllByRole('columnheader').map((heading) => heading.textContent)
    expect(headings).toEqual(['Number', 'Name', 'Phone', 'Email', 'Working with an agent?'])
  })

  it('adds and removes columns, and cannot remove the name', () => {
    render(<SignInSheetTool />)
    fireEvent.click(screen.getByLabelText('Comments'))
    expect(within(sheet()).getByRole('columnheader', { name: 'Comments' })).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Phone'))
    expect(within(sheet()).queryByRole('columnheader', { name: 'Phone' })).toBeNull()
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true)
  })

  it('draws the number of rows chosen', () => {
    render(<SignInSheetTool />)
    expect(within(sheet()).getAllByRole('row')).toHaveLength(16)
    fireEvent.change(screen.getByLabelText('Rows for visitors'), { target: { value: '10' } })
    expect(within(sheet()).getAllByRole('row')).toHaveLength(11)
  })

  it('shows the consent line, which can be edited or removed', () => {
    render(<SignInSheetTool />)
    expect(within(sheet()).getByText(DEFAULT_CONSENT_TEXT)).toBeTruthy()
    type('Consent line', 'Our own wording.')
    expect(within(sheet()).getByText('Our own wording.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Add a consent line'))
    expect(within(sheet()).queryByText('Our own wording.')).toBeNull()
  })

  it('draws a WhatsApp QR code only once there is a usable number', async () => {
    render(<SignInSheetTool />)
    fireEvent.click(screen.getByLabelText('Add a QR code that opens my WhatsApp'))
    expect(within(sheet()).queryByRole('img')).toBeNull()
    type('Your name', 'Sam Rivera')
    type('WhatsApp number', '202 555 0147')
    expect(await within(sheet()).findByAltText('QR code that opens a WhatsApp chat with Sam Rivera')).toBeTruthy()
  })

  it('takes a logo, and refuses a file that is not an image', () => {
    render(<SignInSheetTool />)
    const input = screen.getByLabelText('Logo file')
    fireEvent.change(input, { target: { files: [new File(['x'], 'plan.pdf', { type: 'application/pdf' })] } })
    expect(screen.getByRole('alert').textContent).toContain('PNG, JPEG, WebP or SVG')
    expect(within(sheet()).queryByAltText('Your logo')).toBeNull()
    fireEvent.change(input, { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } })
    expect(within(sheet()).getByAltText('Your logo').getAttribute('src')).toBe('blob:logo')
  })

  it('removes the logo and releases it from memory', () => {
    render(<SignInSheetTool />)
    fireEvent.change(screen.getByLabelText('Logo file'), { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(within(sheet()).queryByAltText('Your logo')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:logo')
  })

  it('can leave off the credit line', () => {
    render(<SignInSheetTool />)
    expect(within(sheet()).getByText('Made with vyostra.com')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Add “Made with vyostra.com” to the sheet'))
    expect(within(sheet()).queryByText('Made with vyostra.com')).toBeNull()
  })

  // The page promises nothing typed leaves the browser. The one event it sends
  // must therefore name the tool and nothing else.
  it('prints, and reports the print with the tool name only', () => {
    render(<SignInSheetTool />)
    type('Property address', '12 Private Lane')
    fireEvent.click(screen.getByRole('button', { name: 'Print the sheet' }))
    expect(print).toHaveBeenCalledOnce()
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['tool_used', { tool: 'open_house_sign_in_sheet' }]])
  })

  it('includes a print rule that shows nothing but the sheet', () => {
    const { container } = render(<SignInSheetTool />)
    const css = container.querySelector('style')?.textContent ?? ''
    expect(css).toContain('@media print')
    expect(css).toContain('#sign-in-sheet')
  })
})

describe('SIGN_IN_FAQ', () => {
  it('asks each question once, answers every one, and sends consent to the brokerage', () => {
    const questions = SIGN_IN_FAQ.map((item) => item.question)
    expect(new Set(questions).size).toBe(questions.length)
    expect(SIGN_IN_FAQ.length).toBeGreaterThanOrEqual(5)
    expect(SIGN_IN_FAQ.filter((item) => item.answer.length < 40)).toEqual([])
    expect(SIGN_IN_FAQ.find((item) => item.question.includes('consent'))?.answer).toContain('not legal advice')
  })
})
