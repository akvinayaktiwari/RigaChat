import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllLeads, getMyBots } from '../services/api'
import type { BotConfig, Lead } from '../types/index'
import { Card } from '../components/Card/Card'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import { Spinner } from '../components/Spinner/Spinner'
import { EmptyState } from '../components/EmptyState/EmptyState'
import styles from './DashboardHome.module.css'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const RECENT_LEADS_COUNT = 5

export default function DashboardHome() {
  const navigate = useNavigate()
  const [bots, setBots] = useState<BotConfig[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [botsRes, leadsRes] = await Promise.all([getMyBots(), getAllLeads()])
      if (cancelled) return
      if (botsRes.success && botsRes.data) setBots(botsRes.data)
      if (leadsRes.success && leadsRes.data) setLeads(leadsRes.data)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
      </div>
    )
  }

  if (bots.length === 0) {
    return (
      <EmptyState
        icon="🤖"
        title="Set up your first chatbot"
        description="Connect your website and start capturing leads in minutes"
        action={<Button onClick={() => navigate('/dashboard/bots/new')}>New Bot</Button>}
      />
    )
  }

  const activeThisWeek = leads.filter(
    (lead) => Date.now() - new Date(lead.createdAt).getTime() <= WEEK_MS
  ).length

  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_LEADS_COUNT)

  function botName(botId: string): string {
    return bots.find((bot) => bot.botId === botId)?.name ?? 'Unknown'
  }

  return (
    <div>
      <div className={styles.statsRow}>
        <Card>
          <p className={styles.statLabel}>Total Bots</p>
          <p className={styles.statValue}>{bots.length}</p>
        </Card>
        <Card>
          <p className={styles.statLabel}>Total Leads</p>
          <p className={styles.statValue}>{leads.length}</p>
        </Card>
        <Card>
          <p className={styles.statLabel}>Active This Week</p>
          <p className={styles.statValue}>{activeThisWeek}</p>
        </Card>
      </div>

      <Card padding="lg">
        <h2 className={styles.sectionTitle}>Recent Leads</h2>
        {recentLeads.length === 0 ? (
          <EmptyState icon="📋" title="No leads yet" />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Bot</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentLeads.map((lead) => (
                <tr
                  key={lead.leadId}
                  className={styles.row}
                  onClick={() => navigate(`/dashboard/leads/${lead.leadId}?botId=${lead.botId}`)}
                >
                  <td>{lead.name}</td>
                  <td>{lead.email}</td>
                  <td>{botName(lead.botId)}</td>
                  <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Badge variant="success">New</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
