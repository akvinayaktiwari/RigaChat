import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Calendar,
  Info,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { addVoiceKBEntry, getVoiceAgent, getVoiceKBEntries, removeVoiceKBEntry, updateVoiceKBEntry } from '../services/api'
import type { VoiceKnowledgeBaseEntry } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }
const PREVIEW_LENGTH = 150

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
  }, [agentId])

  function openAdd() {
    setAddForm(EMPTY_FORM)
    setShowAddModal(true)
  }

  function openEdit(entry: VoiceKnowledgeBaseEntry) {
    setEntryToEdit(entry)
    setEditForm({ title: entry.title, content: entry.content })
    setShowEditModal(true)
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
          {entries.map((entry) => (
            <div
              key={entry.entryId}
              className="bg-white rounded-2xl border border-black/5 p-5 hover:shadow-md transition-all duration-200 flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-violet-500" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm mb-1">{entry.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                    {entry.content.length > PREVIEW_LENGTH
                      ? `${entry.content.slice(0, PREVIEW_LENGTH)}...`
                      : entry.content}
                  </p>
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
          ))}
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
