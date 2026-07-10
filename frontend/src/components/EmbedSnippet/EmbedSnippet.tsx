import { Button } from '../Button/Button'
import { useToast } from '../Toast/Toast'
import styles from './EmbedSnippet.module.css'

interface EmbedSnippetProps {
  botId: string
}

export function EmbedSnippet({ botId }: EmbedSnippetProps) {
  const { show } = useToast()
  const cdnUrl = import.meta.env.VITE_CDN_URL

  const snippet = `<!-- BeepBoop Widget -->
<script
  src="${cdnUrl}/widget.js"
  data-bot-id="${botId}"
  async>
</script>`

  async function handleCopy() {
    await navigator.clipboard.writeText(snippet)
    show('Copied to clipboard', 'success')
  }

  return (
    <div className={styles.wrapper}>
      <pre className={styles.snippet}>{snippet}</pre>
      <Button variant="secondary" size="sm" onClick={handleCopy}>
        Copy to Clipboard
      </Button>
    </div>
  )
}
