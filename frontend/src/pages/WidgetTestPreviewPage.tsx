import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import styles from './WidgetTestPreviewPage.module.css'

const MOCK_REPLY =
  'This is a static test reply — no OpenAI API call was made. Every other part of this ' +
  'flow (bot config, conversation, lead capture) is hitting the real backend; only the ' +
  'AI-generated reply text is mocked here to avoid burning OpenAI quota during widget testing.'

function createMockChatResponse(): Response {
  const encoder = new TextEncoder()
  const words = MOCK_REPLY.split(' ')
  let i = 0

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= words.length) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode((i === 0 ? '' : ' ') + words[i]))
      i += 1
      return new Promise((resolve) => setTimeout(resolve, 35))
    },
  })

  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

// Only /api/chat/message actually calls OpenAI (embeddings + chat completion) —
// bot config, conversation start, lead-trigger checks, and lead capture are all
// OpenAI-free DynamoDB reads/writes. Intercepting just this one endpoint at the
// fetch layer lets the test still exercise the real embed snippet and real
// backend for everything else, without spending OpenAI quota on every reply.
function installMockChatFetch(): void {
  const originalFetch = window.fetch.bind(window)

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/api/chat/message')) {
      return Promise.resolve(createMockChatResponse())
    }
    return originalFetch(input, init)
  }
}

export default function WidgetTestPreviewPage() {
  const [searchParams] = useSearchParams()
  const src = searchParams.get('src')
  const botId = searchParams.get('botId')
  const injected = useRef(false)

  useEffect(() => {
    if (injected.current || !src || !botId) return
    injected.current = true

    installMockChatFetch()

    const script = document.createElement('script')
    script.src = src
    script.setAttribute('data-bot-id', botId)
    script.async = true
    document.body.appendChild(script)
  }, [src, botId])

  if (!src || !botId) {
    return (
      <div className={styles.page}>
        <div className={styles.errorCard}>
          <p>No embed snippet was provided.</p>
          <a href="/widget-test">&larr; Back to paste a snippet</a>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <a href="/widget-test" className={styles.backLink}>
        &larr; Test another snippet
      </a>

      <header className={styles.siteHeader}>Acme Real Estate — Example Client Website</header>
      <div className={styles.hero}>
        <h1>Find your next home with Acme</h1>
        <p>
          This is a mock client website, used only to verify that the embed snippet you
          copied actually works when dropped onto a real page. The chat bubble should
          appear in the corner — open it and talk to the bot.
        </p>
        <p className={styles.mockNotice}>
          Note: chat replies here are a static canned message, not real OpenAI-generated
          answers — this avoids spending OpenAI quota on every test message. Bot config,
          conversation, and lead capture are all still hitting the real backend.
        </p>
      </div>
      <footer className={styles.siteFooter}>
        &copy; 2026 Acme Real Estate (fake, for widget testing only) — Bot ID: {botId}
      </footer>
    </div>
  )
}
