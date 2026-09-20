import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SignupPage from './SignupPage'
import { useAuth } from '../hooks/useAuth'
import { trackEvent } from '../lib/analytics'

vi.mock('../lib/analytics', () => ({ trackEvent: vi.fn() }))
vi.mock('../hooks/useAuth', () => ({ useAuth: vi.fn() }))
const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

const trackMock = vi.mocked(trackEvent)
const signUpMock = vi.fn()

function renderPage() {
  vi.mocked(useAuth).mockReturnValue({ signUp: signUpMock } as unknown as ReturnType<typeof useAuth>)
  render(
    <HelmetProvider>
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

function fillAndSubmit(password = 'sufficiently-long-pass') {
  fireEvent.change(screen.getByPlaceholderText(/vinayak/i), { target: { value: 'Asha' } })
  fireEvent.change(screen.getByPlaceholderText(/you@company/i), { target: { value: 'asha@example.com' } })
  fireEvent.change(screen.getByPlaceholderText(/min\. 8 characters/i), { target: { value: password } })
  fireEvent.change(screen.getByPlaceholderText(/repeat your password/i), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: /create account/i }))
}

describe('signup conversion tracking', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('reports sign_up once the account exists', async () => {
    signUpMock.mockResolvedValue(undefined)
    renderPage()
    fillAndSubmit()

    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('sign_up', { method: 'email' }))
    expect(trackMock).toHaveBeenCalledTimes(1)
  })

  // A duplicate email or a password Cognito rejects is not a signup.
  it('reports nothing when signup is rejected', async () => {
    signUpMock.mockRejectedValue(new Error('An account with this email already exists'))
    renderPage()
    fillAndSubmit()

    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy())
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('reports nothing when the form fails its own validation', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    expect(signUpMock).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
  })
})
