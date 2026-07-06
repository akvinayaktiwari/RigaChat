import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast/Toast'
import { syncMe } from '../services/api'
import type { ClientRecord } from '../types/index'
import { Card } from '../components/Card/Card'
import { Input } from '../components/Input/Input'
import { Badge } from '../components/Badge/Badge'
import { Button } from '../components/Button/Button'
import styles from './SettingsPage.module.css'

interface PlanInfo {
  id: ClientRecord['plan']
  name: string
  features: string[]
}

const PLANS: PlanInfo[] = [
  { id: 'starter', name: 'Starter', features: ['1 bot', '500 messages/mo', 'Email support'] },
  { id: 'growth', name: 'Growth', features: ['5 bots', '5,000 messages/mo', 'Priority support'] },
  { id: 'agency', name: 'Agency', features: ['Unlimited bots', 'Unlimited messages', 'Dedicated support'] },
]

export default function SettingsPage() {
  const { user, token } = useAuth()
  const { show } = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSaveName() {
    if (!user || !token) return
    setSaving(true)
    // POST /api/clients/me syncs name/email from the auth token itself, so this call
    // won't actually persist an arbitrary typed name until real Cognito profile
    // editing (or a dedicated update-profile endpoint) exists.
    const res = await syncMe()
    setSaving(false)
    if (res.success) {
      show('Profile updated', 'success')
    } else {
      show(res.error ?? 'Failed to update profile', 'error')
    }
  }

  function handleUpgrade() {
    show('Coming Soon', 'warning')
  }

  return (
    <div className={styles.page}>
      <Card padding="lg">
        <h2 className={styles.sectionTitle}>Profile</h2>
        <Input label="Name" value={name} onChange={setName} />
        <p className={styles.email}>{user?.email}</p>
        <div className={styles.planBadge}>
          <Badge variant="default">{user?.plan}</Badge>
        </div>
        <Button onClick={handleSaveName} loading={saving}>
          Save
        </Button>
      </Card>

      <Card padding="lg">
        <h2 className={styles.sectionTitle}>Plan</h2>
        <div className={styles.plans}>
          {PLANS.map((plan) => (
            <Card key={plan.id} className={plan.id === user?.plan ? styles.currentPlan : ''}>
              <h3 className={styles.planName}>{plan.name}</h3>
              <ul className={styles.featureList}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {plan.id === user?.plan ? (
                <Badge variant="success">Current Plan</Badge>
              ) : (
                <Button variant="secondary" size="sm" onClick={handleUpgrade}>
                  Upgrade
                </Button>
              )}
            </Card>
          ))}
        </div>
      </Card>
    </div>
  )
}
