import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import styles from './WidgetTestPreviewPage.module.css'

export default function WidgetTestPreviewPage() {
  const [searchParams] = useSearchParams()
  const src = searchParams.get('src')
  const botId = searchParams.get('botId')
  const injected = useRef(false)

  useEffect(() => {
    if (injected.current || !src || !botId) return
    injected.current = true

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
          appear in the corner — open it and talk to the bot with real AI-generated
          answers.
        </p>
      </div>
      <footer className={styles.siteFooter}>
        &copy; 2026 Acme Real Estate (fake, for widget testing only) — Bot ID: {botId}
      </footer>
    </div>
  )
}
