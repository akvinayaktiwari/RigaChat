import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

const getApiKeys = vi.fn()
const createApiKey = vi.fn()
const revokeApiKey = vi.fn()

vi.mock('../../services/api', () => ({
  getApiKeys: (...a: unknown[]) => getApiKeys(...a),
  createApiKey: (...a: unknown[]) => createApiKey(...a),
  revokeApiKey: (...a: unknown[]) => revokeApiKey(...a),
}))

const ApiKeysSection = (await import('./ApiKeysSection')).default

const EXISTING = {
  keyId: 'key-1',
  name: 'CRM sync',
  last4: 'abcd',
  scopes: ['leads:read'],
  createdAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  getApiKeys.mockResolvedValue({ success: true, data: [EXISTING] })
})

describe('ApiKeysSection', () => {
  it('shows the secret once after creating, and lists the key without it', async () => {
    createApiKey.mockResolvedValue({
      success: true,
      data: { ...EXISTING, keyId: 'key-2', name: 'Reporting', last4: 'wxyz', key: 'vy_live_secretwxyz' },
    })
    render(<ApiKeysSection apiEnabled onUpgradeClick={vi.fn()} />)
    await screen.findByText('CRM sync')

    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Reporting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create key' }))

    expect(await screen.findByText('vy_live_secretwxyz')).toBeTruthy()
    expect(createApiKey).toHaveBeenCalledWith('Reporting', [
      'leads:read',
      'bots:read',
      'forms:read',
      'voice_agents:read',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'I have saved it' }))

    expect(screen.queryByText('vy_live_secretwxyz')).toBeNull()
    expect(screen.getByText('vy_live_…wxyz')).toBeTruthy()
  })

  it('removes a revoked key from the list', async () => {
    revokeApiKey.mockResolvedValue({ success: true, data: null })
    render(<ApiKeysSection apiEnabled onUpgradeClick={vi.fn()} />)
    await screen.findByText('CRM sync')

    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }))

    await waitFor(() => expect(screen.queryByText('CRM sync')).toBeNull())
    expect(revokeApiKey).toHaveBeenCalledWith('key-1')
  })

  it('on a plan without API access, offers an upgrade but still lets existing keys be revoked', async () => {
    const onUpgradeClick = vi.fn()
    render(<ApiKeysSection apiEnabled={false} onUpgradeClick={onUpgradeClick} />)
    await screen.findByText('CRM sync')

    expect(screen.queryByRole('button', { name: 'Create key' })).toBeNull()
    expect(screen.getByRole('button', { name: /Revoke/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'See plans' }))
    expect(onUpgradeClick).toHaveBeenCalled()
  })
})
