import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DemoChat from './DemoChat'
import { trackEvent } from '../../lib/analytics'

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

const trackMock = vi.mocked(trackEvent)

/* The component starts a conversation on mount and streams replies; both are
   plain fetch calls, so one stub covers it. The stream body is left empty:
   these tests are about what is reported, not what is rendered. */
function stubFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('/api/chat/start')) {
      return {
        ok: true,
        json: async () => ({ success: true, data: { conversationId: 'c-1', greeting: 'Hi' } }),
      } as unknown as Response
    }
    return { ok: true, body: null, text: async () => '' } as unknown as Response
  })
}

async function sendMessage(text: string) {
  const input = await screen.findByPlaceholderText(/ask anything/i)
  fireEvent.change(input, { target: { value: text } })
  fireEvent.keyDown(input, { key: 'Enter' })
}

describe('demo chat usage tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', stubFetch())
    // jsdom implements no scrolling; the thread auto-scrolls on every update.
    Element.prototype.scrollTo = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('reports nothing just for rendering, because the chat opens itself', async () => {
    render(<DemoChat />)
    await waitFor(() => expect(screen.getByText('Hi')).toBeTruthy())
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('numbers each message the visitor sends', async () => {
    render(<DemoChat />)
    await waitFor(() => expect(screen.getByText('Hi')).toBeTruthy())

    await sendMessage('what does it cost?')
    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('demo_chat_message', { message_index: 1 }))

    await sendMessage('and on WhatsApp?')
    await waitFor(() => expect(trackMock).toHaveBeenCalledWith('demo_chat_message', { message_index: 2 }))
  })

  it('reports nothing for an empty message', async () => {
    render(<DemoChat />)
    await waitFor(() => expect(screen.getByText('Hi')).toBeTruthy())

    await sendMessage('   ')
    expect(trackMock).not.toHaveBeenCalled()
  })
})
