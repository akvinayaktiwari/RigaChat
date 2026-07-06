import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteBot, getBotById, resyncBot, updateBot } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import type { BotConfig } from '../types/index'
import { Card } from '../components/Card/Card'
import { Input } from '../components/Input/Input'
import { Textarea } from '../components/Textarea/Textarea'
import { Select } from '../components/Select/Select'
import { Button } from '../components/Button/Button'
import { Spinner } from '../components/Spinner/Spinner'
import { Modal } from '../components/Modal/Modal'
import { EmbedSnippet } from '../components/EmbedSnippet/EmbedSnippet'
import styles from './BotDetailPage.module.css'

const WIDGET_TRIGGER_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'delay_5s', label: '5 Second Delay' },
  { value: 'scroll_50', label: 'Scroll 50%' },
  { value: 'exit_intent', label: 'Exit Intent' },
]

export default function BotDetailPage() {
  const { botId } = useParams<{ botId: string }>()
  const navigate = useNavigate()
  const { show } = useToast()

  const [bot, setBot] = useState<BotConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resyncUrl, setResyncUrl] = useState('')
  const [resyncing, setResyncing] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)

  useEffect(() => {
    if (!botId) return
    getBotById(botId).then((res) => {
      if (res.success && res.data) setBot(res.data)
      setLoading(false)
    })
  }, [botId])

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
      </div>
    )
  }

  if (!bot || !botId) {
    return <p>Bot not found.</p>
  }

  async function handleSave() {
    if (!bot || !botId) return
    setSaving(true)
    const res = await updateBot(botId, {
      name: bot.name,
      greetingMessage: bot.greetingMessage,
      brandColor: bot.brandColor,
      widgetTrigger: bot.widgetTrigger,
      leadTriggerAfterMessages: bot.leadTriggerAfterMessages,
    })
    setSaving(false)
    if (res.success) {
      show('Bot settings saved', 'success')
    } else {
      show(res.error ?? 'Failed to save changes', 'error')
    }
  }

  async function handleResync() {
    if (!botId || !resyncUrl.trim()) return
    setResyncing(true)
    const res = await resyncBot(botId, resyncUrl.trim())
    setResyncing(false)
    if (res.success && res.data) {
      show(`Resynced — ${res.data.pagesIndexed} pages, ${res.data.chunksIndexed} chunks`, 'success')
    } else {
      show(res.error ?? 'Failed to resync website', 'error')
    }
  }

  async function handleDelete() {
    if (!botId) return
    const res = await deleteBot(botId)
    setDeleteModalOpen(false)
    if (res.success) {
      show('Bot deleted', 'success')
      navigate('/dashboard/bots')
    } else {
      show(res.error ?? 'Failed to delete bot', 'error')
    }
  }

  return (
    <div className={styles.page}>
      <Card padding="lg">
        <h2 className={styles.sectionTitle}>Bot Settings</h2>
        <Input label="Bot Name" value={bot.name} onChange={(v) => setBot({ ...bot, name: v })} />
        <Textarea
          label="Greeting Message"
          value={bot.greetingMessage}
          onChange={(v) => setBot({ ...bot, greetingMessage: v })}
        />
        <Input
          label="Brand Color"
          value={bot.brandColor}
          onChange={(v) => setBot({ ...bot, brandColor: v })}
        />
        <Select
          label="Widget Trigger"
          value={bot.widgetTrigger}
          onChange={(v) => setBot({ ...bot, widgetTrigger: v as BotConfig['widgetTrigger'] })}
          options={WIDGET_TRIGGER_OPTIONS}
        />
        <Input
          label="Lead Trigger After Messages"
          type="number"
          min={1}
          max={10}
          value={String(bot.leadTriggerAfterMessages)}
          onChange={(v) => setBot({ ...bot, leadTriggerAfterMessages: Math.min(10, Math.max(1, Number(v) || 1)) })}
        />
        <Button onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </Card>

      <Card padding="lg">
        <h2 className={styles.sectionTitle}>Embed Code</h2>
        <EmbedSnippet botId={bot.botId} />
        <a href="/widget-test" target="_blank" rel="noopener noreferrer" className={styles.testWidgetLink}>
          Test this snippet &rarr;
        </a>
      </Card>

      <Card padding="lg" className={styles.dangerZone}>
        <h2 className={styles.sectionTitle}>Danger Zone</h2>

        <div className={styles.resyncRow}>
          <Input
            label="Website URL to resync"
            placeholder="https://example.com"
            value={resyncUrl}
            onChange={setResyncUrl}
            hint="Re-crawls the site and rebuilds the bot's knowledge from scratch"
          />
          <Button variant="secondary" onClick={handleResync} loading={resyncing} disabled={!resyncUrl.trim()}>
            Resync Website
          </Button>
        </div>

        <Button variant="danger" onClick={() => setDeleteModalOpen(true)}>
          Delete Bot
        </Button>
      </Card>

      <Modal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete bot?" size="sm">
        <p className={styles.confirmText}>
          This will permanently delete "{bot.name}" and all of its indexed data. This cannot be undone.
        </p>
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete Bot
          </Button>
        </div>
      </Modal>
    </div>
  )
}
