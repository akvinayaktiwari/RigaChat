import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import Dropdown from './Dropdown'
import type { DropdownOption } from './Dropdown'

afterEach(cleanup)

const OPTIONS: DropdownOption[] = [
  { value: 'lead_captured', label: 'When a lead is captured' },
  { value: 'manual_score', label: 'When manually scored by a human' },
  { value: 'site_visit_done', label: 'After a site visit is completed', description: 'Runs once the visit is marked done' },
]

function setup(props: Partial<React.ComponentProps<typeof Dropdown>> = {}) {
  const onChange = vi.fn()
  render(
    <Dropdown
      value="lead_captured"
      onChange={onChange}
      options={OPTIONS}
      ariaLabel="Trigger"
      {...props}
    />
  )
  return { onChange, trigger: screen.getByRole('combobox', { name: 'Trigger' }) }
}

describe('opening and closing', () => {
  it('starts closed and shows the selected label', () => {
    const { trigger } = setup()

    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(trigger.textContent).toContain('When a lead is captured')
  })

  it('opens on click', () => {
    const { trigger } = setup()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('shows a placeholder when nothing matches the value', () => {
    setup({ value: 'nonexistent', placeholder: 'Pick one' })

    expect(screen.getByRole('combobox').textContent).toContain('Pick one')
  })

  it('cannot be opened when disabled', () => {
    const { trigger } = setup({ disabled: true })

    fireEvent.click(trigger)

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

// A custom listbox is only acceptable if it earns back the keyboard access a
// native <select> gives for free. Each of these is a thing a native select does.
describe('keyboard, the whole contract', () => {
  it('opens on ArrowDown', () => {
    const { trigger } = setup()

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('opens on Enter and on Space', () => {
    const { trigger } = setup()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(screen.getByRole('listbox')).toBeTruthy()

    cleanup()
    const second = setup()
    fireEvent.keyDown(second.trigger, { key: ' ' })
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('moves the highlight with the arrow keys', () => {
    const { trigger } = setup()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    expect(trigger.getAttribute('aria-activedescendant')).toMatch(/-opt-1$/)
  })

  it('wraps around at the end of the list', () => {
    const { trigger } = setup()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })

    expect(trigger.getAttribute('aria-activedescendant')).toMatch(/-opt-2$/)
  })

  it('jumps to first and last with Home and End', () => {
    const { trigger } = setup()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    fireEvent.keyDown(trigger, { key: 'End' })
    expect(trigger.getAttribute('aria-activedescendant')).toMatch(/-opt-2$/)

    fireEvent.keyDown(trigger, { key: 'Home' })
    expect(trigger.getAttribute('aria-activedescendant')).toMatch(/-opt-0$/)
  })

  it('commits the highlighted option with Enter', () => {
    const { trigger, onChange } = setup()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    fireEvent.keyDown(trigger, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('manual_score')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on Escape without changing anything', () => {
    const { trigger, onChange } = setup()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    fireEvent.keyDown(trigger, { key: 'Escape' })

    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('jumps to an option by typing its first letters', () => {
    const { trigger } = setup()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    fireEvent.keyDown(trigger, { key: 'a' })

    expect(trigger.getAttribute('aria-activedescendant')).toMatch(/-opt-2$/)
  })
})

describe('disabled options', () => {
  const withDisabled: DropdownOption[] = [
    { value: 'a', label: 'Available' },
    { value: 'b', label: 'Blocked', disabled: true },
    { value: 'c', label: 'Also available' },
  ]

  it('is skipped when arrowing', () => {
    const onChange = vi.fn()
    render(<Dropdown value="a" onChange={onChange} options={withDisabled} ariaLabel="T" />)
    const trigger = screen.getByRole('combobox')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    expect(trigger.getAttribute('aria-activedescendant')).toMatch(/-opt-2$/)
  })

  it('cannot be committed by clicking', () => {
    const onChange = vi.fn()
    render(<Dropdown value="a" onChange={onChange} options={withDisabled} ariaLabel="T" />)
    fireEvent.click(screen.getByRole('combobox'))

    fireEvent.click(screen.getByText('Blocked'))

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('what a native select could not do', () => {
  it('renders a description line under an option', () => {
    setup()
    fireEvent.click(screen.getByRole('combobox'))

    expect(screen.getByText('Runs once the visit is marked done')).toBeTruthy()
  })

  it('marks the selected option for assistive tech, not by colour alone', () => {
    setup()
    fireEvent.click(screen.getByRole('combobox'))

    const selected = screen.getAllByRole('option').filter((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0].textContent).toContain('When a lead is captured')
  })
})

describe('selecting with the pointer', () => {
  it('commits on click and closes', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('combobox'))

    fireEvent.click(screen.getByText('When manually scored by a human'))

    expect(onChange).toHaveBeenCalledWith('manual_score')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes when a pointer goes down outside it', () => {
    setup()
    fireEvent.click(screen.getByRole('combobox'))

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})

describe('empty state', () => {
  it('says so rather than opening a blank box', () => {
    render(<Dropdown value="" onChange={vi.fn()} options={[]} ariaLabel="Empty" />)

    fireEvent.click(screen.getByRole('combobox'))

    expect(screen.getByText('Nothing to choose from')).toBeTruthy()
  })
})
