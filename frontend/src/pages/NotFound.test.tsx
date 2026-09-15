import { render, screen, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import NotFound from './NotFound'

describe('NotFound', () => {
  it('renders for an unmatched path and tells crawlers not to index it', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/pricing']}>
          <Routes>
            <Route path="/" element={<div>home</div>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    )

    expect(screen.getByRole('heading', { name: /couldn.t find that page/i })).toBeTruthy()
    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex')
    })
  })
})
