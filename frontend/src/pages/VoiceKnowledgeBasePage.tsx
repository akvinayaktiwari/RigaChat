import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calendar,
  FileText,
  Info,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  addVoiceKBEntry,
  confirmVoiceKBUpload,
  getMySubscription,
  getVoiceAgent,
  getVoiceKBEntries,
  getVoiceKBUploadUrl,
  removeVoiceKBEntry,
  updateVoiceKBEntry,
} from '../services/api'
import { uploadFileWithProgress } from '../lib/upload-file-with-progress'
import { translateEntitlementError } from '../lib/entitlementErrors'
import type { KBFileType, VoiceKnowledgeBaseEntry } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const PREVIEW_LENGTH = 150

const ACCEPTED_FILE_EXTENSIONS: Record<string, KBFileType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.txt': 'text',
}

// Must exactly match the Content-Type the backend used to sign the presigned
// PUT URL (kb-service.ts's KB_FILE_CONTENT_TYPES, reused as-is by
// voice-service.ts's getVoiceKBUploadUrl()) -- S3 rejects the upload if the
// header sent here doesn't match what was signed, so this can't just be the
// browser-reported file.type.
const KB_FILE_CONTENT_TYPES: Record<KBFileType, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  text: 'text/plain',
}

// Matches KnowledgeBasePage.tsx's polling convention (3s interval, 10
// attempts / ~30s cap).
const POLL_INTERVAL_MS = 3000
const POLL_MAX_ATTEMPTS = 10
const ACTIVE_FILE_STATUSES: ReadonlySet<VoiceKnowledgeBaseEntry['indexingStatus']> = new Set(['queued', 'processing'])

const FILE_STATUS_BADGES: Record<'queued' | 'processing' | 'complete' | 'failed', { label: string; classes: string }> = {
  queued: { label: 'Indexing...', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  processing: { label: 'Indexing...', classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  complete: { label: 'Ready', classes: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  failed: { label: 'Failed', classes: 'bg-red-50 text-red-700 border-red-200' },
}

function fileTypeFromName(filename: string): KBFileType | null {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot < 0) return null
  return ACCEPTED_FILE_EXTENSIONS[filename.slice(lastDot).toLowerCase()] ?? null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface EntryFormState {
  title: string
  content: string
}

const EMPTY_FORM: EntryFormState = { title: '', content: '' }

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputClasses =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-50'
const secondaryButtonClasses =
  'bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50'
const dangerButtonClasses = 'bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50'

function CardsSkeleton() {
  return (
    <div className="flex flex-col gap-3 mt-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-5 border border-black/5 animate-pulse">
          <div className="h-5 w-48 bg-gray-200 rounded mb-3" />
          <div className="h-4 w-full bg-gray-100 rounded mb-2" />
          <div className="h-4 w-2/3 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

interface EntryModalProps {
  title: string
  form: EntryFormState
  onChange: (form: EntryFormState) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
  saveLabel: string
  savingLabel: string
}

function EntryModal({ title, form, onChange, onCancel, onSave, saving, saveLabel, savingLabel }: EntryModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 w-full max-w-lg relative">
        <button
          type="button"
          onClick={onCancel}
          title="Close"
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="font-bold text-xl text-gray-900 mb-5" style={JAKARTA_FONT}>
          {title}
        </h2>

        <div className="space-y-4">
          <div>
            <label className={labelClasses}>Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
              placeholder="e.g. Pricing Information"
              className={inputClasses}
            />
          </div>
          <div>
            <label className={labelClasses}>Content</label>
            <textarea
              rows={8}
              value={form.content}
              onChange={(e) => onChange({ ...form, content: e.target.value })}
              placeholder="Enter any information you want your voice agent to know. This could be pricing details, FAQs, policies, or any other information about your business."
              className={`${inputClasses} min-h-35 resize-y`}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onCancel} disabled={saving} className={`px-4 py-2.5 text-sm ${secondaryButtonClasses}`}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !form.title.trim() || !form.content.trim()}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? savingLabel : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function VoiceKnowledgeBasePage() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()

  const [entries, setEntries] = useState<VoiceKnowledgeBaseEntry[]>([])
  const [agentName, setAgentName] = useState('')
  const [loading, setLoading] = useState(true)

  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [entryToEdit, setEntryToEdit] = useState<VoiceKnowledgeBaseEntry | null>(null)
  const [entryToDelete, setEntryToDelete] = useState<VoiceKnowledgeBaseEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [addForm, setAddForm] = useState<EntryFormState>(EMPTY_FORM)
  const [editForm, setEditForm] = useState<EntryFormState>(EMPTY_FORM)

  const [kbFileSizeLimit, setKbFileSizeLimit] = useState<number | null>(null)
  const [entitlementsLoaded, setEntitlementsLoaded] = useState(false)

  const [dragActive, setDragActive] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'confirming' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [upsellMessage, setUpsellMessage] = useState<string | null>(null)
  const [pollPaused, setPollPaused] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!agentId) {
      setLoading(false)
      return
    }

    Promise.all([getVoiceKBEntries(agentId), getVoiceAgent(agentId)]).then(([kbRes, agentRes]) => {
      setEntries(kbRes.data ?? [])
      setAgentName(agentRes.data?.name ?? 'Unknown Voice Agent')
      setLoading(false)
    })

    getMySubscription().then((res) => {
      if (res.success && res.data) {
        setKbFileSizeLimit(res.data.features.kbFileSize.limits.maxBytes)
      }
      setEntitlementsLoaded(true)
    })
  }, [agentId])

  // Shared poll loop over the whole list (GET /:agentId/kb is the only voice
  // KB read endpoint -- no lighter per-entry route exists) rather than one
  // poller per entry. Restarts (and resets its attempt budget) whenever the
  // set of active entryIds changes -- a status flip or a fresh upload both
  // count. Mirrors KnowledgeBasePage.tsx's identical loop.
  const activeEntryIds = entries
    .filter((e) => e.indexingStatus && ACTIVE_FILE_STATUSES.has(e.indexingStatus))
    .map((e) => e.entryId)
    .sort()
    .join(',')

  useEffect(() => {
    if (!agentId || !activeEntryIds) {
      setPollPaused(false)
      return
    }

    let cancelled = false
    let attempts = 0
    let timeoutId: ReturnType<typeof setTimeout>

    const poll = async () => {
      attempts += 1
      const res = await getVoiceKBEntries(agentId)
      if (cancelled) return
      if (res.success && res.data) setEntries(res.data)

      if (attempts >= POLL_MAX_ATTEMPTS) {
        setPollPaused(true)
        return
      }
      timeoutId = setTimeout(poll, POLL_INTERVAL_MS)
    }

    setPollPaused(false)
    poll()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, activeEntryIds, refreshNonce])

  function openAdd() {
    setAddForm(EMPTY_FORM)
    setShowAddModal(true)
  }

  function openEdit(entry: VoiceKnowledgeBaseEntry) {
    setEntryToEdit(entry)
    setEditForm({ title: entry.title, content: entry.content })
    setShowEditModal(true)
  }

  function resetUploadUi() {
    setPendingFile(null)
    setUploadProgress(0)
    setUploadStage('idle')
    setUploadError(null)
  }

  async function startUpload(file: File, fileType: KBFileType) {
    if (!agentId) return
    setPendingFile(file)
    setUploadError(null)
    setUploadStage('uploading')
    setUploadProgress(0)

    try {
      const urlRes = await getVoiceKBUploadUrl({ agentId, filename: file.name, fileType, fileSizeBytes: file.size })

      if (!urlRes.success || !urlRes.data) {
        const entitlementMessage = translateEntitlementError(urlRes)
        if (entitlementMessage) {
          setUpsellMessage(entitlementMessage)
          resetUploadUi()
        } else {
          setUploadError(urlRes.error ?? 'Could not start the upload. Please try again.')
          setUploadStage('error')
        }
        return
      }

      const { uploadUrl, key, entryId } = urlRes.data

      try {
        await uploadFileWithProgress(uploadUrl, file, KB_FILE_CONTENT_TYPES[fileType], setUploadProgress)
      } catch {
        setUploadError('The upload failed or the link expired. Please try again.')
        setUploadStage('error')
        return
      }

      setUploadStage('confirming')

      const confirmRes = await confirmVoiceKBUpload({
        agentId,
        entryId,
        filename: file.name,
        fileType,
        fileSizeBytes: file.size,
        s3Key: key,
      })

      if (!confirmRes.success || !confirmRes.data) {
        setUploadError(confirmRes.error ?? 'The file uploaded, but could not be queued for indexing.')
        setUploadStage('error')
        return
      }

      const newEntry = confirmRes.data
      setEntries((prev) => [newEntry, ...prev])
      resetUploadUi()
    } catch {
      setUploadError('Something went wrong. Please try again.')
      setUploadStage('error')
    }
  }

  function handleFileSelected(file: File) {
    setUpsellMessage(null)
    const fileType = fileTypeFromName(file.name)

    if (!fileType) {
      setPendingFile(file)
      setUploadError('Only .pdf, .docx, and .txt files are supported.')
      setUploadStage('error')
      return
    }

    if (kbFileSizeLimit !== null && file.size > kbFileSizeLimit) {
      setUpsellMessage(
        `This file (${formatFileSize(file.size)}) is larger than your plan's ${formatFileSize(
          kbFileSizeLimit
        )} limit. Upgrade for a higher limit.`
      )
      return
    }

    startUpload(file, fileType)
  }

  function handleBrowseClick() {
    fileInputRef.current?.click()
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleFileSelected(file)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelected(file)
  }

  function handleRetryUpload() {
    if (!pendingFile) return
    const fileType = fileTypeFromName(pendingFile.name)
    if (!fileType) return
    startUpload(pendingFile, fileType)
  }

  async function handleAdd() {
    if (!agentId) return
    setSaving(true)
    try {
      const res = await addVoiceKBEntry(agentId, addForm.title, addForm.content)
      if (res.success && res.data) {
        const newEntry = res.data
        setEntries((prev) => [newEntry, ...prev])
        setAddForm(EMPTY_FORM)
        setShowAddModal(false)
      }
    } catch (error) {
      console.error('Failed to add voice KB entry:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleEditSave() {
    if (!agentId || !entryToEdit) return
    setSaving(true)
    try {
      const res = await updateVoiceKBEntry(agentId, entryToEdit.entryId, editForm.title, editForm.content)
      if (res.success && res.data) {
        const updated = res.data
        setEntries((prev) => prev.map((e) => (e.entryId === updated.entryId ? updated : e)))
        setShowEditModal(false)
      }
    } catch (error) {
      console.error('Failed to update voice KB entry:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!agentId || !entryToDelete) return
    setSaving(true)
    try {
      const res = await removeVoiceKBEntry(agentId, entryToDelete.entryId)
      if (res.success) {
        setEntries((prev) => prev.filter((e) => e.entryId !== entryToDelete.entryId))
        setShowDeleteModal(false)
      }
    } catch (error) {
      console.error('Failed to delete voice KB entry:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!agentId) {
    return (
      <div className="flex flex-col items-center text-center py-16">
        <p className="text-gray-900 font-medium">No voice agent selected</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/voice-agents')}
          className={`mt-4 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
        >
          Back to Voice Agents
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/voice-agents')}
            className="flex items-center gap-1 text-gray-500 text-sm hover:text-gray-900 transition-colors mb-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
            Knowledge Base
          </h1>
          {agentName && <p className="text-sm text-gray-500">{agentName}</p>}
        </div>
        <button
          type="button"
          onClick={openAdd}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
        >
          <Plus size={16} />
          Add Entry
        </button>
      </div>

      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 mt-4 flex items-start gap-3">
        <Info size={18} className="text-violet-500 shrink-0 mt-0.5" />
        <p className="text-violet-700 text-sm">
          Entries added here will be used by your voice agent to answer questions not covered by your website
          content.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 p-5 mt-4">
        <h2 className="font-semibold text-sm text-gray-900 mb-3">Upload a file</h2>

        {upsellMessage ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Lock size={18} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-700">{upsellMessage}</p>
              <div className="flex items-center gap-3 mt-3">
                <a
                  href="mailto:support@vyostra.com?subject=Upgrade my BeepBoop plan"
                  className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
                >
                  <Mail size={14} />
                  Contact us to upgrade
                </a>
                <button
                  type="button"
                  onClick={() => setUpsellMessage(null)}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : uploadStage === 'uploading' || uploadStage === 'confirming' ? (
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <FileText size={18} className="text-violet-500 shrink-0" />
              <p className="text-sm text-gray-700 truncate">{pendingFile?.name}</p>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-linear-to-r from-violet-600 to-purple-500 transition-all duration-300"
                style={{ width: `${uploadStage === 'confirming' ? 100 : uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {uploadStage === 'confirming' ? 'Finishing up...' : `Uploading... ${uploadProgress}%`}
            </p>
          </div>
        ) : uploadStage === 'error' ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{uploadError}</p>
              <div className="flex items-center gap-3 mt-3">
                {pendingFile && fileTypeFromName(pendingFile.name) && (
                  <button
                    type="button"
                    onClick={handleRetryUpload}
                    className="text-sm font-medium text-violet-600 hover:text-violet-700 transition-colors"
                  >
                    Try again
                  </button>
                )}
                <button
                  type="button"
                  onClick={resetUploadUi}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${
              dragActive ? 'border-violet-400 bg-violet-50' : 'border-gray-200'
            } ${!entitlementsLoaded ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Upload className={`w-8 h-8 mb-2 ${dragActive ? 'text-violet-500' : 'text-gray-400'}`} />
            <p className="text-sm text-gray-600">
              Drag and drop a file here, or{' '}
              <button
                type="button"
                onClick={handleBrowseClick}
                className="text-violet-600 font-medium hover:text-violet-700 transition-colors"
              >
                browse
              </button>
            </p>
            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, or TXT</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        )}

        {pollPaused && (
          <p className="text-xs text-gray-400 mt-3">
            Still indexing one or more files — this can take longer for larger documents.{' '}
            <button
              type="button"
              onClick={() => setRefreshNonce((n) => n + 1)}
              className="text-violet-600 hover:text-violet-700 font-medium transition-colors"
            >
              Refresh
            </button>
          </p>
        )}
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            No knowledge base entries
          </h2>
          <p className="text-sm text-gray-500 text-center max-w-xs mb-6">
            Add your first entry to help your voice agent answer questions accurately.
          </p>
          <button
            type="button"
            onClick={openAdd}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm ${primaryButtonClasses}`}
          >
            <Plus size={16} />
            Add Entry
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-6">
          {entries.map((entry) => {
            const isFileEntry = entry.indexingStatus !== undefined
            const badge = entry.indexingStatus ? FILE_STATUS_BADGES[entry.indexingStatus] : null

            return (
              <div
                key={entry.entryId}
                className="bg-white rounded-2xl border border-black/5 p-5 hover:shadow-md transition-all duration-200 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                    {isFileEntry ? (
                      <FileText className="w-5 h-5 text-violet-500" />
                    ) : (
                      <BookOpen className="w-5 h-5 text-violet-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 text-sm">{entry.title}</h3>
                      {badge && (
                        <span
                          title={entry.indexingStatus === 'failed' ? entry.indexingError : undefined}
                          className={`shrink-0 border text-xs font-semibold px-2.5 py-0.5 rounded-full ${badge.classes}`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>

                    {isFileEntry && (
                      <p className="text-xs text-gray-400 mb-1">
                        {entry.fileType?.toUpperCase()}
                        {entry.fileSizeBytes !== undefined && ` · ${formatFileSize(entry.fileSizeBytes)}`}
                      </p>
                    )}

                    {entry.indexingStatus === 'failed' && entry.indexingError ? (
                      <p className="text-sm text-red-600 leading-relaxed">{entry.indexingError}</p>
                    ) : entry.content ? (
                      <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                        {entry.content.length > PREVIEW_LENGTH
                          ? `${entry.content.slice(0, PREVIEW_LENGTH)}...`
                          : entry.content}
                      </p>
                    ) : null}

                    <div className="flex items-center gap-1 mt-2 text-gray-400 text-xs">
                      <Calendar size={12} />
                      Added {formatRelativeDate(new Date(entry.createdAt))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(entry)}
                    title="Edit entry"
                    className="text-gray-400 hover:text-violet-600 transition-colors p-2 rounded-lg hover:bg-gray-50"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEntryToDelete(entry)
                      setShowDeleteModal(true)
                    }}
                    title="Delete entry"
                    className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-gray-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAddModal && (
        <EntryModal
          title="Add Knowledge Base Entry"
          form={addForm}
          onChange={setAddForm}
          onCancel={() => setShowAddModal(false)}
          onSave={handleAdd}
          saving={saving}
          saveLabel="Save Entry"
          savingLabel="Saving..."
        />
      )}

      {showEditModal && (
        <EntryModal
          title="Edit Knowledge Base Entry"
          form={editForm}
          onChange={setEditForm}
          onCancel={() => setShowEditModal(false)}
          onSave={handleEditSave}
          saving={saving}
          saveLabel="Update Entry"
          savingLabel="Updating..."
        />
      )}

      {showDeleteModal && entryToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 max-w-sm w-full">
            <AlertTriangle className="text-red-500 mx-auto w-10 h-10 mb-3" />
            <h2 className="text-lg font-bold text-gray-900 text-center" style={JAKARTA_FONT}>
              Delete this entry?
            </h2>
            <p className="text-sm text-gray-500 text-center mt-1">This action cannot be undone.</p>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={saving}
                className={`flex-1 px-4 py-2.5 text-sm ${secondaryButtonClasses}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className={`flex-1 px-4 py-2.5 text-sm ${dangerButtonClasses}`}
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
