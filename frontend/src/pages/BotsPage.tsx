import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyBots } from '../services/api'
import type { BotConfig } from '../types/index'
import { Card } from '../components/Card/Card'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import { Spinner } from '../components/Spinner/Spinner'
import { EmptyState } from '../components/EmptyState/EmptyState'
import { Modal } from '../components/Modal/Modal'
import { EmbedSnippet } from '../components/EmbedSnippet/EmbedSnippet'
import styles from './BotsPage.module.css'

const WIDGET_TRIGGER_LABELS: Record<BotConfig['widgetTrigger'], string> = {
  immediate: 'Immediate',
  delay_5s: '5 Second Delay',
  scroll_50: 'Scroll 50%',
  exit_intent: 'Exit Intent',
}

export default function BotsPage() {
  const navigate = useNavigate()
  const [bots, setBots] = useState<BotConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [embedBot, setEmbedBot] = useState<BotConfig | null>(null)

  useEffect(() => {
    getMyBots().then((res) => {
      if (res.success && res.data) setBots(res.data)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>My Bots</h1>
        <Button onClick={() => navigate('/dashboard/bots/new')}>New Bot</Button>
      </div>

      {bots.length === 0 ? (
        <EmptyState
          icon="🤖"
          title="No bots yet"
          description="Create your first chatbot to start capturing leads"
          action={<Button onClick={() => navigate('/dashboard/bots/new')}>New Bot</Button>}
        />
      ) : (
        <div className={styles.grid}>
          {bots.map((bot) => (
            <Card key={bot.botId} shadow>
              <h3 className={styles.botName}>{bot.name}</h3>
              <div className={styles.badgeRow}>
                <Badge>{WIDGET_TRIGGER_LABELS[bot.widgetTrigger]}</Badge>
              </div>
              <div className={styles.links}>
                <Link to={`/dashboard/leads?botId=${bot.botId}`}>View Leads</Link>
                <Link to={`/dashboard/kb/${bot.botId}`}>Knowledge Base</Link>
                <Link to={`/dashboard/bots/${bot.botId}`}>Settings</Link>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setEmbedBot(bot)}>
                Get Embed Code
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={!!embedBot} onClose={() => setEmbedBot(null)} title="Embed Code">
        {embedBot && <EmbedSnippet botId={embedBot.botId} />}
      </Modal>
    </div>
  )
}
