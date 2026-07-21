import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast/Toast'
import UserProfileSection from '../components/settings/UserProfileSection'
import SubscriptionSection from '../components/settings/SubscriptionSection'
import PreferencesSection from '../components/settings/PreferencesSection'
import IntegrationsSection from '../components/settings/IntegrationsSection'
import DangerZoneSection from '../components/settings/DangerZoneSection'
import EditProfileModal from '../components/settings/EditProfileModal'
import DeleteConfirmModal from '../components/settings/DeleteConfirmModal'
import UpgradeModal from '../components/billing/UpgradeModal'
import {
  connectZoho,
  disconnectCRM,
  getIntegrationStatus,
  getMe,
  getMySubscription,
  updateProfile,
} from '../services/api'
import type { ClientRecord, Preferences, SubscriptionSummary } from '../types/index'
import type { BillableTier } from '../lib/pricingTiers'

// Suggests the next tier up from the account's current plan; agency has no
// tier above it, so there's nothing sensible to suggest.
const NEXT_TIER_UP: Record<SubscriptionSummary['plan'], BillableTier | undefined> = {
  free: 'starter',
  starter: 'growth',
  growth: 'agency',
  agency: undefined,
}

const PREFS_STORAGE_KEY = 'beepboop_prefs'

const DEFAULT_PREFS: Preferences = {
  emailNotifications: true,
  desktopAlerts: false,
  weeklySummary: true,
  leadAssignmentAlerts: true,
}

function loadPreferences(): Preferences {
  try {
    const saved = sessionStorage.getItem(PREFS_STORAGE_KEY)
    return saved ? { ...DEFAULT_PREFS, ...(JSON.parse(saved) as Partial<Preferences>) } : DEFAULT_PREFS
  } catch {
    return DEFAULT_PREFS
  }
}

export default function Settings() {
  const { logout } = useAuth()
  const toast = useToast()

  const [profile, setProfile] = useState<ClientRecord | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [zohoStatus, setZohoStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading')
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences)
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await getMe()
        if (res.success && res.data) setProfile(res.data)
        else toast.show(res.error ?? 'Failed to load profile', 'error')
      } catch {
        toast.show('Failed to load profile', 'error')
      }

      try {
        const subRes = await getMySubscription()
        if (subRes.success && subRes.data) setSubscription(subRes.data)
        else toast.show(subRes.error ?? 'Failed to load subscription', 'error')
      } catch {
        toast.show('Failed to load subscription', 'error')
      }

      try {
        const crmRes = await getIntegrationStatus()
        setZohoStatus(crmRes.success && crmRes.data?.connected ? 'connected' : 'disconnected')
      } catch {
        setZohoStatus('disconnected')
      }

      setIsLoading(false)
    }
    load()

    const params = new URLSearchParams(window.location.search)
    const zohoParam = params.get('zoho')
    if (zohoParam === 'connected') {
      toast.show('Zoho CRM connected successfully', 'success')
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (zohoParam === 'error') {
      toast.show('Failed to connect Zoho CRM. Please try again.', 'error')
      window.history.replaceState({}, '', '/dashboard/settings')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSaveProfile(name: string) {
    setSavingProfile(true)
    try {
      const res = await updateProfile(name)
      if (res.success && res.data) {
        setProfile(res.data)
        setShowEditProfile(false)
        toast.show('Profile updated successfully', 'success')
      } else {
        toast.show(res.error ?? 'Failed to update profile', 'error')
      }
    } catch {
      toast.show('Failed to update profile', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  function handleConnectZoho() {
    connectZoho()
  }

  async function handleDisconnectZoho() {
    try {
      const res = await disconnectCRM()
      if (res.success) {
        setZohoStatus('disconnected')
        toast.show('Zoho CRM disconnected', 'success')
      } else {
        toast.show(res.error ?? 'Failed to disconnect Zoho CRM', 'error')
      }
    } catch {
      toast.show('Failed to disconnect Zoho CRM', 'error')
    }
  }

  function handleTogglePreference(key: keyof Preferences) {
    setPreferences((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      sessionStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  function handleDeleteAccount() {
    logout()
  }

  if (isLoading || !profile || !subscription) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 bg-gray-100 rounded-2xl" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-extrabold text-2xl text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        Settings
      </h1>

      <div className="mt-6 space-y-4">
        <UserProfileSection
          profile={{ name: profile.name, email: profile.email }}
          onEditProfile={() => setShowEditProfile(true)}
        />

        <SubscriptionSection subscription={subscription} onUpgradeClick={() => setShowUpgradeModal(true)} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PreferencesSection preferences={preferences} onToggle={handleTogglePreference} />
          <IntegrationsSection
            zohoStatus={zohoStatus}
            onConnectZoho={handleConnectZoho}
            onDisconnectZoho={handleDisconnectZoho}
          />
        </div>

        <DangerZoneSection onSignOut={logout} onDeleteAccount={() => setShowDeleteConfirm(true)} />
      </div>

      {showEditProfile && (
        <EditProfileModal
          name={profile.name}
          saving={savingProfile}
          onClose={() => setShowEditProfile(false)}
          onSave={handleSaveProfile}
        />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmModal onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDeleteAccount} />
      )}

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        suggestedTier={NEXT_TIER_UP[subscription.plan]}
      />
    </div>
  )
}
