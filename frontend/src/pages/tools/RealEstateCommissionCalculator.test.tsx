import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../../lib/analytics'
import { COMMISSION_FAQ, CommissionCalculator } from './RealEstateCommissionCalculator'

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined)
  vi.mocked(trackEvent).mockReset()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

afterEach(cleanup)

function enter(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

function rowAmount(label: string): string {
  return screen.getByRole('rowheader', { name: label }).nextElementSibling?.textContent ?? ''
}

describe('CommissionCalculator', () => {
  it('starts with nothing filled in and offers an example', () => {
    render(<CommissionCalculator />)
    expect((screen.getByLabelText('Commission rate') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('Enter a sale price and a commission to see the breakdown.')).toBeTruthy()
  })

  it('works out a result as the numbers are typed', () => {
    render(<CommissionCalculator />)
    enter('Sale price', '1000000')
    enter('Commission rate', '2')
    expect(rowAmount('Total commission on the sale')).toBe('$20,000.00')
    expect(rowAmount('Listing side commission')).toBe('$10,000.00')
    expect(rowAmount('Agent take-home')).toBe('$10,000.00')
  })

  it('shows deductions with a minus sign', () => {
    render(<CommissionCalculator />)
    enter('Sale price', '1000000')
    enter('Commission rate', '2')
    enter('Tax on the agent’s commission (optional)', '20')
    expect(rowAmount('Tax on commission')).toBe('−$2,000.00')
  })

  it('switches to a flat fee without needing a price', () => {
    render(<CommissionCalculator />)
    fireEvent.click(screen.getByRole('radio', { name: 'A flat fee' }))
    enter('Flat commission', '5000')
    expect(rowAmount('Total commission on the sale')).toBe('$5,000.00')
  })

  it('hides the side share when one agent acts for both sides', () => {
    render(<CommissionCalculator />)
    fireEvent.change(screen.getByLabelText('Which side do you act for?'), { target: { value: 'both' } })
    expect(screen.queryByLabelText('Listing side’s share of the commission')).toBeNull()
  })

  it('formats in the chosen currency', () => {
    render(<CommissionCalculator />)
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'GBP' } })
    enter('Sale price', '100000')
    enter('Commission rate', '1')
    expect(rowAmount('Total commission on the sale')).toBe('£1,000.00')
  })

  it('says what is wrong with a number instead of showing a result', () => {
    render(<CommissionCalculator />)
    enter('Sale price', '1000000')
    enter('Commission rate', '250')
    expect(screen.getByRole('alert').textContent).toContain('must be a number from 0 to 100')
  })

  it('fills the labelled example', () => {
    render(<CommissionCalculator />)
    fireEvent.click(screen.getByRole('button', { name: 'Try an example' }))
    expect(rowAmount('Total commission on the sale')).toBe('$15,000.00')
  })

  it('copies a plain-text summary', async () => {
    render(<CommissionCalculator />)
    enter('Sale price', '1000000')
    enter('Commission rate', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
    expect(writeText.mock.calls[0]?.[0]).toContain('Total commission on the sale: $20,000.00')
  })

  // The page promises the numbers never leave the browser. The one event it
  // sends must therefore name the tool and nothing else.
  it('reports a copy to analytics with the tool name only', async () => {
    render(<CommissionCalculator />)
    enter('Sale price', '987654')
    enter('Commission rate', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }))
    await screen.findByRole('button', { name: 'Copied' })
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['tool_used', { tool: 'real_estate_commission_calculator' }]])
  })

  it('clears every field', () => {
    render(<CommissionCalculator />)
    enter('Sale price', '1000000')
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect((screen.getByLabelText('Sale price') as HTMLInputElement).value).toBe('')
  })
})

describe('COMMISSION_FAQ', () => {
  it('asks each question once, answers every one, and denies there is a standard rate', () => {
    const questions = COMMISSION_FAQ.map((item) => item.question)
    expect(new Set(questions).size).toBe(questions.length)
    expect(COMMISSION_FAQ.length).toBeGreaterThanOrEqual(5)
    expect(COMMISSION_FAQ.filter((item) => item.answer.length < 40)).toEqual([])
    expect(COMMISSION_FAQ.find((item) => item.question.includes('standard'))?.answer).toContain('no single standard')
  })
})
