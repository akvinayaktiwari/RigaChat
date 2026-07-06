import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getAllLeads, getMyBots } from '../services/api'
import type { BotConfig, Lead } from '../types/index'
import { Select } from '../components/Select/Select'
import { Button } from '../components/Button/Button'
import { Spinner } from '../components/Spinner/Spinner'
import { EmptyState } from '../components/EmptyState/EmptyState'
import styles from './LeadsPage.module.css'

export default function LeadsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [bots, setBots] = useState<BotConfig[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  const selectedBotId = searchParams.get('botId') ?? ''

  useEffect(() => {
    Promise.all([getMyBots(), getAllLeads()]).then(([botsRes, leadsRes]) => {
      if (botsRes.success && botsRes.data) setBots(botsRes.data)
      if (leadsRes.success && leadsRes.data) setLeads(leadsRes.data)
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

  function botName(botId: string): string {
    return bots.find((bot) => bot.botId === botId)?.name ?? 'Unknown'
  }

  const filtered = selectedBotId ? leads.filter((lead) => lead.botId === selectedBotId) : leads
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <div>
      <h1 className={styles.title}>Leads</h1>

      <div className={styles.filterRow}>
        <Select
          label="Bot"
          value={selectedBotId}
          onChange={(value) => setSearchParams(value ? { botId: value } : {})}
          options={[{ value: '', label: 'All Bots' }, ...bots.map((bot) => ({ value: bot.botId, label: bot.name }))]}
        />
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon="📋" title="No leads yet" description="Leads captured by your chatbots will show up here" />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Bot Name</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((lead) => (
              <tr key={lead.leadId}>
                <td>{lead.name}</td>
                <td>{lead.email}</td>
                <td>{lead.phone}</td>
                <td>{botName(lead.botId)}</td>
                <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                <td>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => navigate(`/dashboard/leads/${lead.leadId}?botId=${lead.botId}`)}
                  >
                    View
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
