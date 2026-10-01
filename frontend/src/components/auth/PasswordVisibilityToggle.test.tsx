import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PasswordVisibilityToggle from './PasswordVisibilityToggle'

afterEach(cleanup)

describe('PasswordVisibilityToggle', () => {
  it('names itself by what a press will do', () => {
    render(<PasswordVisibilityToggle visible={false} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy()

    cleanup()
    render(<PasswordVisibilityToggle visible onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy()
  })

  it('toggles on press and never submits the form it sits in', () => {
    const onToggle = vi.fn()
    const onSubmit = vi.fn()
    render(
      <form onSubmit={onSubmit}>
        <PasswordVisibilityToggle visible={false} onToggle={onToggle} />
      </form>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // The icon is 18px; the button around it is what a thumb has to hit.
  it('is at least 24px in both directions', () => {
    render(<PasswordVisibilityToggle visible={false} onToggle={vi.fn()} />)
    const classes = screen.getByRole('button').className
    expect(classes).toContain('h-9')
    expect(classes).toContain('w-9')
  })
})
