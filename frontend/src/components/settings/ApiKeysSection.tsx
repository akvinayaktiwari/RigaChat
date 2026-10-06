import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Copy, KeyRound, Pencil, Trash2 } from 'lucide-react'
import { createApiKey, getApiKeys, revokeApiKey, updateApiKeyScopes } from '../../services/api'
import type { ApiKeySummary, ApiScope, CreatedApiKey } from '../../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

// The docs deliberately print no API host; this is where a developer gets it.
const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? ''

const SCOPE_LABELS: Record<ApiScope, string> = {
  'leads:read': 'Read leads',
  'bots:read': 'Read chatbots',
  'forms:read': 'Read forms',
  'forms:write': 'Create forms',
  'voice_agents:read': 'Read voice agents',
}
const ALL_SCOPES = Object.keys(SCOPE_LABELS) as ApiScope[]
// A new key starts able to read everything and change nothing: a permission
// that writes is one somebody ticks on purpose.
const DEFAULT_SCOPES = ALL_SCOPES.filter((scope) => !scope.endsWith(':write'))

function formatDate(iso: string | undefined): string {
  if (!iso) return 'never'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toLocaleDateString()
}

interface NewKeyNoticeProps {
  created: CreatedApiKey
  onDismiss: () => void
}

// The only time the secret is on screen. It is not stored server-side, so
// there is no "show again" -- the copy has to happen here.
function NewKeyNotice({ created, onDismiss }: NewKeyNoticeProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(created.key)
      setCopied(true)
    } catch {
      // Clipboard access can be refused; the key is selectable on screen.
      setCopied(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">
        Copy “{created.name}” now. You will not be able to see it again.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-white px-3 py-2 text-xs text-gray-900 select-all">
          {created.key}
        </code>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button type="button" onClick={onDismiss} className="mt-3 text-xs font-medium text-amber-900 underline">
        I have saved it
      </button>
    </div>
  )
}

interface CreateKeyFormProps {
  onCreated: (created: CreatedApiKey) => void
  onError: (message: string) => void
}

function CreateKeyForm({ onCreated, onError }: CreateKeyFormProps) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiScope[]>(DEFAULT_SCOPES)
  const [saving, setSaving] = useState(false)

  function toggleScope(scope: ApiScope) {
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await createApiKey(name.trim(), scopes)
    if (result.success && result.data) {
      onCreated(result.data)
      setName('')
    } else {
      onError(result.error ?? 'Could not create the key.')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 rounded-xl border border-gray-100 p-4">
      <label className="block text-xs font-medium text-gray-700" htmlFor="api-key-name">
        Key name
      </label>
      <input
        id="api-key-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={60}
        placeholder="e.g. CRM sync"
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {ALL_SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
            {SCOPE_LABELS[scope]}
          </label>
        ))}
      </div>
      <button
        type="submit"
        disabled={saving || name.trim().length === 0 || scopes.length === 0}
        className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Creating…' : 'Create key'}
      </button>
    </form>
  )
}

interface ScopeEditorProps {
  apiKey: ApiKeySummary
  onSaved: (updated: ApiKeySummary) => void
  onCancel: () => void
  onError: (message: string) => void
}

// Changes what a key may do and keeps the key: whatever is using it carries on
// with the new permissions from its next request, with nothing to redeploy.
function ScopeEditor({ apiKey, onSaved, onCancel, onError }: ScopeEditorProps) {
  const [scopes, setScopes] = useState<ApiScope[]>(apiKey.scopes)
  const [saving, setSaving] = useState(false)

  function toggleScope(scope: ApiScope) {
    setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]))
  }

  async function handleSave() {
    setSaving(true)
    const result = await updateApiKeyScopes(apiKey.keyId, scopes)
    if (result.success && result.data) {
      onSaved(result.data)
    } else {
      onError(result.error ?? 'Could not change the permissions of that key.')
    }
    setSaving(false)
  }

  return (
    <fieldset aria-label={`Permissions for ${apiKey.name}`} className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {ALL_SCOPES.map((scope) => (
          <label key={scope} className="flex items-center gap-2 text-xs text-gray-700">
            <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
            {SCOPE_LABELS[scope]}
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        The key stays the same. Anything using it gets these permissions from its next request.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || scopes.length === 0}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save permissions'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600">
          Cancel
        </button>
      </div>
    </fieldset>
  )
}

interface KeyRowProps {
  apiKey: ApiKeySummary
  disabled: boolean
  revoking: boolean
  // False when the plan has no API access: there is nothing useful to grant.
  canEdit: boolean
  onRevoke: () => void
  onUpdated: (updated: ApiKeySummary) => void
  onError: (message: string) => void
}

function KeyRow({ apiKey, disabled, revoking, canEdit, onRevoke, onUpdated, onError }: KeyRowProps) {
  const [editing, setEditing] = useState(false)

  function handleSaved(updated: ApiKeySummary) {
    onUpdated(updated)
    setEditing(false)
  }

  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {apiKey.name} <span className="font-mono text-xs text-gray-500">vy_live_…{apiKey.last4}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {apiKey.scopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join(', ')} · created{' '}
            {formatDate(apiKey.createdAt)} · last used {formatDate(apiKey.lastUsedAt)}
            {apiKey.scopesUpdatedAt ? ` · permissions changed ${formatDate(apiKey.scopesUpdatedAt)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canEdit && !editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit permissions
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRevoke}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Anything using this key stops working immediately"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {revoking ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </div>
      {editing ? (
        <ScopeEditor apiKey={apiKey} onSaved={handleSaved} onCancel={() => setEditing(false)} onError={onError} />
      ) : null}
    </div>
  )
}

interface ApiKeysSectionProps {
  apiEnabled: boolean
  onUpgradeClick: () => void
}

export default function ApiKeysSection({ apiEnabled, onUpgradeClick }: ApiKeysSectionProps) {
  const [keys, setKeys] = useState<ApiKeySummary[] | null>(null)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)

  async function load() {
    const result = await getApiKeys()
    if (result.success && result.data) setKeys(result.data)
    else setError(result.error ?? 'Could not load your API keys.')
  }

  // Loaded even when the plan has no API access: an account that downgraded
  // may still hold keys, and it should be able to see and revoke them.
  useEffect(() => {
    void load()
  }, [])

  function handleCreated(key: CreatedApiKey) {
    setError(null)
    setCreated(key)
    // Added from the response rather than refetched: the list is read from an
    // eventually consistent index and may not include the new key yet.
    const { key: _secret, ...summary } = key
    setKeys((current) => [summary, ...(current ?? [])])
  }

  function handleUpdated(updated: ApiKeySummary) {
    setError(null)
    setKeys((current) => current?.map((k) => (k.keyId === updated.keyId ? updated : k)) ?? null)
  }

  async function handleRevoke(keyId: string) {
    setRevoking(keyId)
    setError(null)
    const result = await revokeApiKey(keyId)
    if (result.success) {
      setKeys((current) => current?.filter((k) => k.keyId !== keyId) ?? null)
      if (created?.keyId === keyId) setCreated(null)
    } else {
      setError(result.error ?? 'Could not revoke that key.')
    }
    setRevoking(null)
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-50 pb-4 mb-6">
        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
          <KeyRound className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
            API keys
          </h4>
          <p className="text-xs text-gray-500">Read your leads, chatbots, forms and voice agents from your own code.</p>
        </div>
      </div>

      {created ? <NewKeyNotice created={created} onDismiss={() => setCreated(null)} /> : null}

      {keys === null && !error ? <p className="text-sm text-gray-500">Loading…</p> : null}

      <div className="space-y-3">
        {(keys ?? []).map((apiKey) => (
          <KeyRow
            key={apiKey.keyId}
            apiKey={apiKey}
            disabled={revoking !== null}
            revoking={revoking === apiKey.keyId}
            canEdit={apiEnabled}
            onRevoke={() => void handleRevoke(apiKey.keyId)}
            onUpdated={handleUpdated}
            onError={setError}
          />
        ))}
      </div>

      {apiEnabled ? (
        <CreateKeyForm onCreated={handleCreated} onError={setError} />
      ) : (
        <div className="mt-4 rounded-xl border border-gray-100 p-4">
          <p className="text-sm text-gray-600">
            API access is included in the Starter, Growth and Agency plans.
            {keys && keys.length > 0 ? ' Your existing keys will not work until you upgrade.' : ''}
          </p>
          <button type="button" onClick={onUpgradeClick} className="mt-3 text-xs font-medium text-blue-600 underline">
            See plans
          </button>
        </div>
      )}

      {error ? <p className="mt-4 text-xs text-red-600">{error}</p> : null}

      <div className="mt-4 rounded-xl border border-gray-100 p-4">
        <p className="text-xs font-medium text-gray-700">API base URL</p>
        <code className="mt-1 block break-all text-xs text-gray-900 select-all">{API_BASE_URL}</code>
        <p className="mt-2 text-xs text-gray-500">
          Add a path such as <code>/v1/leads</code> to this. Read it from configuration rather than typing it into
          your code.
        </p>
      </div>

      <p className="mt-4 text-xs text-gray-500 leading-relaxed">
        Keys are secrets: use them from a server, never in a web page or a mobile app. Send one as{' '}
        <code>Authorization: Bearer &lt;key&gt;</code>.{' '}
        <a href="/docs/" className="font-medium text-blue-600 underline">
          Read the developer docs
        </a>
        .
      </p>
    </div>
  )
}
