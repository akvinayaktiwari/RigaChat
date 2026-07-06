import { useState } from 'react'
import { Card } from '../components/Card/Card'
import { Textarea } from '../components/Textarea/Textarea'
import { Button } from '../components/Button/Button'
import styles from './WidgetTestPage.module.css'

interface ParsedSnippet {
  src: string
  botId: string
}

function parseEmbedSnippet(snippet: string): ParsedSnippet | null {
  const doc = new DOMParser().parseFromString(snippet, 'text/html')
  const script = Array.from(doc.querySelectorAll('script')).find((el) =>
    (el.getAttribute('src') ?? '').includes('widget.js')
  )
  if (!script) return null

  const src = script.getAttribute('src')
  const botId = script.getAttribute('data-bot-id')
  if (!src || !botId) return null

  return { src, botId }
}

export default function WidgetTestPage() {
  const [snippet, setSnippet] = useState('')
  const [error, setError] = useState('')

  function handlePreview() {
    const parsed = parseEmbedSnippet(snippet)

    if (!parsed) {
      setError(
        'Could not find a widget script tag with both a src containing "widget.js" and a data-bot-id attribute. Paste the exact snippet copied from a bot\'s Embed Code section.'
      )
      return
    }

    const params = new URLSearchParams({ src: parsed.src, botId: parsed.botId })
    window.location.href = `/widget-test/preview?${params.toString()}`
  }

  return (
    <div className={styles.page}>
      <Card padding="lg" className={styles.card}>
        <h1 className={styles.title}>Test Widget Embed</h1>
        <p className={styles.subtitle}>
          Paste the embed snippet copied from a bot's "Embed Code" section. The next page
          loads it on a mock website exactly like a real visitor would see it, so you can
          chat with the bot live.
        </p>
        <Textarea
          label="Embed snippet"
          value={snippet}
          onChange={(value) => {
            setSnippet(value)
            setError('')
          }}
          rows={7}
          placeholder={'<script src="https://.../widget.js" data-bot-id="..." async></script>'}
          error={error}
        />
        <Button onClick={handlePreview} disabled={!snippet.trim()}>
          Preview Widget
        </Button>
      </Card>
    </div>
  )
}
