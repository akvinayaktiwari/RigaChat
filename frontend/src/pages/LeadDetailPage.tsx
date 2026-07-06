import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getBotById, getLeadById } from '../services/api'
import type { Lead } from '../types/index'
import { Card } from '../components/Card/Card'
import { Button } from '../components/Button/Button'
import { Spinner } from '../components/Spinner/Spinner'
import styles from './LeadDetailPage.module.css'

interface TranscriptLine {
  speaker: 'user' | 'bot'
  text: string
}

function parseTranscript(transcript: string): TranscriptLine[] {
  return transcript
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const userMatch = line.match(/^user:\s*/i)
      if (userMatch) {
        return { speaker: 'user', text: line.slice(userMatch[0].length) }
      }
      const botMatch = line.match(/^(bot|assistant):\s*/i)
      if (botMatch) {
        return { speaker: 'bot', text: line.slice(botMatch[0].length) }
      }
      return { speaker: 'bot', text: line }
    })
}

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const botId = searchParams.get('botId')

  const [lead, setLead] = useState<Lead | null>(null)
  const [botName, setBotName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!botId || !leadId) {
      setLoading(false)
      return
    }

    Promise.all([getLeadById(botId, leadId), getBotById(botId)]).then(([leadRes, botRes]) => {
      if (leadRes.success && leadRes.data) setLead(leadRes.data)
      if (botRes.success && botRes.data) setBotName(botRes.data.name)
      setLoading(false)
    })
  }, [botId, leadId])

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
      </div>
    )
  }

  if (!lead) {
    return <p>Lead not found.</p>
  }

  const transcriptLines = parseTranscript(lead.chatTranscript)

  return (
    <div>
      <Button variant="ghost" onClick={() => navigate('/dashboard/leads')}>
        ← Back
      </Button>

      <div className={styles.columns}>
        <div className={styles.left}>
          <Card padding="lg">
            <h2 className={styles.name}>{lead.name}</h2>
            <dl className={styles.info}>
              <dt>Email</dt>
              <dd>{lead.email}</dd>
              <dt>Phone</dt>
              <dd>{lead.phone}</dd>
              <dt>Date</dt>
              <dd>{new Date(lead.createdAt).toLocaleString()}</dd>
              {lead.propertyInterest && (
                <>
                  <dt>Property Interest</dt>
                  <dd>{lead.propertyInterest}</dd>
                </>
              )}
              {lead.budgetRange && (
                <>
                  <dt>Budget Range</dt>
                  <dd>{lead.budgetRange}</dd>
                </>
              )}
              <dt>Source URL</dt>
              <dd>{lead.sourceUrl}</dd>
              <dt>Bot</dt>
              <dd>{botName || 'Unknown'}</dd>
            </dl>
          </Card>
        </div>

        <div className={styles.right}>
          <Card padding="lg">
            <h3 className={styles.transcriptTitle}>Chat Transcript</h3>
            <div className={styles.transcript}>
              {transcriptLines.length === 0 ? (
                <p className={styles.noTranscript}>No transcript available.</p>
              ) : (
                transcriptLines.map((line, i) => (
                  <div
                    key={i}
                    className={`${styles.bubble} ${line.speaker === 'user' ? styles.userBubble : styles.botBubble}`}
                  >
                    {line.text}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
