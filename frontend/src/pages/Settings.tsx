import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast/Toast'
import UserProfileSection from '../components/settings/UserProfileSection'
import SubscriptionSection from '../components/settings/SubscriptionSection'
import PreferencesSection from '../components/settings/PreferencesSection'
import MobileAppSection from '../components/settings/MobileAppSection'
import IntegrationsSection from '../components/settings/IntegrationsSection'
import DangerZoneSection from '../components/settings/DangerZoneSection'
import EditProfileModal from '../components/settings/EditProfileModal'
import DeleteConfirmModal from '../components/settings/DeleteConfirmModal'
import UpgradeModal from '../components/billing/UpgradeModal'
import {
  connectCalCom,
  connectZoho,
  disconnectCalCom,
  disconnectCRM,
  getCalComEventTypes,
  getCalComStatus,
  getIntegrationStatus,
  getMe,
  setCalComDefaultEventType,
  updateNotificationPreferences,
  updateProfile,
} from '../services/api'
import type { CalComEventType, ClientRecord, NotificationPreferences } from '../types/index'
import { useSubscription } from '../hooks/useSubscription'

// Preferences moved to the CLIENT RECORD on 2026-08-27. They used to live in
// sessionStorage under 'vyostra_prefs' (with a 'beepboop_prefs' legacy key) and
// were read by nothing: a grep of backend/src returned zero hits for all four
// of the old toggles. Nothing is migrated from the old keys, deliberately --
// the three channels that replaced them are different switches, and defaulting
// everyone to "all on" matches the server, which treats an absent field as on.

// Absent, or partly absent, means on. Mirrors resolveNotificationPreferences on
// the backend.
function resolvePreferences(stored: NotificationPreferences | undefined): NotificationPreferences {
  return {
    push: stored?.push ?? true,
    whatsapp: stored?.whatsapp ?? true,
    email: stored?.email ?? true,
  }
}

export default function Settings() {
  const { logout } = useAuth()
  const toast = useToast()

  const [profile, setProfile] = useState<ClientRecord | null>(null)
  // Shared subscription. Settings renders the plan card and the upgrade CTA,
  // so it benefits most from the cache: this page is where users land right
  // after upgrading, and refresh() has already run by the time they arrive.
  const { subscription, error: subscriptionError } = useSubscription()
  const [isLoading, setIsLoading] = useState(true)
  const [zohoStatus, setZohoStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading')
  const [calComStatus, setCalComStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading')
  const [calComEventTypes, setCalComEventTypes] = useState<CalComEventType[]>([])
  const [calComDefaultEventTypeId, setCalComDefaultEventTypeId] = useState<number | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => resolvePreferences(undefined))
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  // The shared provider owns the subscription fetch now, so its failure has
  // to be surfaced here instead of by the local try/catch this page used to
  // have. Without it a failed load leaves the page on its loading state with
  // no explanation, because the render below waits on `subscription`.
  useEffect(() => {
    if (subscriptionError) toast.show(subscriptionError, 'error')
  }, [subscriptionError, toast])

  useEffect(() => {
    async function load() {
      try {
        const res = await getMe()
        if (res.success && res.data) {
          setProfile(res.data)
          // Seeded from the client record, not from local storage. The initial
          // all-on state above is only what renders for the moment before this
          // resolves; without this line a client who had turned WhatsApp off
          // would see it back on every time they opened Settings.
          setPreferences(resolvePreferences(res.data.notificationPreferences))
        }
        else toast.show(res.error ?? 'Failed to load profile', 'error')
      } catch {
        toast.show('Failed to load profile', 'error')
      }

      try {
        const crmRes = await getIntegrationStatus()
        setZohoStatus(crmRes.success && crmRes.data?.connected ? 'connected' : 'disconnected')
      } catch {
        setZohoStatus('disconnected')
      }

      try {
        const calComRes = await getCalComStatus()
        const connected = calComRes.success && calComRes.data?.connected
        setCalComStatus(connected ? 'connected' : 'disconnected')
        setCalComDefaultEventTypeId(calComRes.data?.defaultEventTypeId ?? null)

        if (connected) {
          const eventTypesRes = await getCalComEventTypes()
          setCalComEventTypes(eventTypesRes.data ?? [])
        }
      } catch {
        setCalComStatus('disconnected')
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

    const calComParam = params.get('cal_com')
    if (calComParam === 'connected') {
      toast.show('Cal.com connected — choose a booking event type below', 'success')
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (calComParam === 'error') {
      toast.show('Failed to connect Cal.com. Please try again.', 'error')
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

  function handleConnectCalCom() {
    connectCalCom()
  }

  async function handleDisconnectCalCom() {
    try {
      const res = await disconnectCalCom()
      if (res.success) {
        setCalComStatus('disconnected')
        setCalComEventTypes([])
        setCalComDefaultEventTypeId(null)
        toast.show('Cal.com disconnected', 'success')
      } else {
        toast.show(res.error ?? 'Failed to disconnect Cal.com', 'error')
      }
    } catch {
      toast.show('Failed to disconnect Cal.com', 'error')
    }
  }

  async function handleSelectCalComEventType(eventTypeId: number) {
    const previous = calComDefaultEventTypeId
    setCalComDefaultEventTypeId(eventTypeId)
    try {
      const res = await setCalComDefaultEventType(eventTypeId)
      if (res.success) {
        toast.show('Booking event type updated', 'success')
      } else {
        setCalComDefaultEventTypeId(previous)
        toast.show(res.error ?? 'Failed to update booking event type', 'error')
      }
    } catch {
      setCalComDefaultEventTypeId(previous)
      toast.show('Failed to update booking event type', 'error')
    }
  }

  // Optimistic, then reverted on failure. A toggle that does not move until a
  // round trip completes feels broken; one that moves and stays moved after a
  // failed save is a lie. Returns success so the section can show its own
  // inline error rather than a toast that scrolls away.
  async function handleTogglePreference(
    key: keyof NotificationPreferences,
    value: boolean
  ): Promise<boolean> {
    const previous = preferences
    setPreferences({ ...previous, [key]: value })
    try {
      const res = await updateNotificationPreferences({ [key]: value })
      if (res.success && res.data) {
        setPreferences(resolvePreferences(res.data.notificationPreferences))
        return true
      }
      setPreferences(previous)
      return false
    } catch {
      setPreferences(previous)
      return false
    }
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
            calComStatus={calComStatus}
            onConnectCalCom={handleConnectCalCom}
            onDisconnectCalCom={handleDisconnectCalCom}
            calComEventTypes={calComEventTypes}
            calComDefaultEventTypeId={calComDefaultEventTypeId}
            onSelectCalComEventType={handleSelectCalComEventType}
          />
        </div>

        <MobileAppSection />

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
        currentPlan={subscription.plan}
      />
    </div>
  )
}
