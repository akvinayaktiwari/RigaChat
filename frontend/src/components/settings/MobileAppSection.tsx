import { useEffect, useState } from 'react'
import { Smartphone, Trash2 } from 'lucide-react'
import { getLinkedDevices, revokeDevice } from '../../services/api'
import type { LinkedDevice } from '../../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'unknown'
  const minutes = Math.floor((Date.now() - then) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(then).toLocaleDateString()
}

// A phone that has not checked in for this long is probably gone: uninstalled
// without ever calling DELETE /api/devices/:deviceId. Called out rather than
// auto-removed, because "probably" is not "certainly" and a client on holiday
// should not lose their registration.
const STALE_AFTER_DAYS = 30

function isStale(device: LinkedDevice): boolean {
  return Date.now() - new Date(device.lastSeenAt).getTime() > STALE_AFTER_DAYS * 86_400_000
}

export default function MobileAppSection() {
  const [devices, setDevices] = useState<LinkedDevice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function load() {
    const result = await getLinkedDevices()
    if (result.success && result.data) {
      setDevices(result.data)
      setError(null)
    } else {
      setError(result.error ?? 'Could not load your devices.')
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleRevoke(deviceId: string) {
    setRevoking(deviceId)
    setError(null)
    const result = await revokeDevice(deviceId)
    if (result.success) {
      // Optimistic removal, then reconcile. The row is gone server-side either
      // way; leaving it on screen until a refetch lands makes the button feel
      // broken.
      setDevices((current) => current?.filter((d) => d.deviceId !== deviceId) ?? null)
      void load()
    } else {
      setError(result.error ?? 'Could not remove that device.')
    }
    setRevoking(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-4 mb-6">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
            Mobile app
          </h4>
          <p className="text-xs text-gray-500">Phones signed in to your account and receiving lead alerts.</p>
        </div>
      </div>

      {devices === null && !error ? <p className="text-sm text-gray-500">Loading…</p> : null}

      {devices !== null && devices.length === 0 ? (
        <p className="text-sm text-gray-500 leading-relaxed">
          No devices yet. Install the Vyostra app and sign in with these same credentials — there is no
          separate account to create.
        </p>
      ) : null}

      <div className="space-y-3">
        {(devices ?? []).map((device) => (
          <div
            key={device.deviceId}
            className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 capitalize">
                {device.platform} · v{device.appVersion}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Last seen {relativeTime(device.lastSeenAt)} · added {relativeTime(device.registeredAt)}
                {isStale(device) ? (
                  <span className="text-amber-600"> · may have been uninstalled</span>
                ) : null}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleRevoke(device.deviceId)}
              disabled={revoking !== null}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 shrink-0"
              title="Stop sending lead alerts to this device"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {revoking === device.deviceId ? 'Removing…' : 'Remove'}
            </button>
          </div>
        ))}
      </div>

      {error ? <p className="mt-4 text-xs text-red-600">{error}</p> : null}

      {devices !== null && devices.length > 0 ? (
        <p className="mt-4 text-xs text-gray-400 leading-relaxed">
          Removing a device stops lead alerts reaching it. Do this if you lose a phone — the person
          holding it stays signed out of alerts even if the app is still installed.
        </p>
      ) : null}
    </div>
  )
}
