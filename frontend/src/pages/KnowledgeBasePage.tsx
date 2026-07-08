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
import { addKBEntry, deleteKBEntry, getKBEntries, getMyBots, updateKBEntry } from '../services/api'
import type { KnowledgeBaseEntry } from '../types/index'

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
  'w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all'
const labelClasses = 'block text-sm font-medium text-slate-700 mb-2'

function CardsSkeleton() {
  return (
    <div className="space-y-4 mt-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 animate-pulse">
          <div className="h-5 w-48 bg-slate-200 rounded mb-3" />
          <div className="h-4 w-full bg-slate-100 rounded mb-2" />
          <div className="h-4 w-2/3 bg-slate-100 rounded" />
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl mx-4 relative">
        <button
          type="button"
          onClick={onCancel}
          title="Close"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-bold text-slate-800 mb-4">{title}</h2>

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
              placeholder="Enter any information you want your chatbot to know. This could be pricing details, FAQs, policies, or any other information about your business."
              className={inputClasses}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !form.title.trim() || !form.content.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? savingLabel : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function KnowledgeBasePage() {
  const { botId } = useParams<{ botId: string }>()
  const navigate = useNavigate()

  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([])
  const [botName, setBotName] = useState('')
  const [loading, setLoading] = useState(true)

  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [entryToEdit, setEntryToEdit] = useState<KnowledgeBaseEntry | null>(null)
  const [entryToDelete, setEntryToDelete] = useState<KnowledgeBaseEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [addForm, setAddForm] = useState<EntryFormState>(EMPTY_FORM)
  const [editForm, setEditForm] = useState<EntryFormState>(EMPTY_FORM)

  useEffect(() => {
    if (!botId) {
      setLoading(false)
      return
    }

    Promise.all([getKBEntries(botId), getMyBots()]).then(([kbRes, botsRes]) => {
      setEntries(kbRes.data ?? [])
      const bots = botsRes.data ?? []
      setBotName(bots.find((b) => b.botId === botId)?.name ?? 'Unknown Bot')
      setLoading(false)
    })
  }, [botId])

  function openAdd() {
    setAddForm(EMPTY_FORM)
    setShowAddModal(true)
  }

  function openEdit(entry: KnowledgeBaseEntry) {
    setEntryToEdit(entry)
    setEditForm({ title: entry.title, content: entry.content })
    setShowEditModal(true)
  }

  async function handleAdd() {
    if (!botId) return
    setSaving(true)
    try {
      const res = await addKBEntry({ botId, title: addForm.title, content: addForm.content })
      if (res.success && res.data) {
        const newEntry = res.data
        setEntries((prev) => [newEntry, ...prev])
        setAddForm(EMPTY_FORM)
        setShowAddModal(false)
      }
    } catch (error) {
      console.error('Failed to add KB entry:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleEditSave() {
    if (!botId || !entryToEdit) return
    setSaving(true)
    try {
      const res = await updateKBEntry(botId, entryToEdit.entryId, editForm)
      if (res.success && res.data) {
        const updated = res.data
        setEntries((prev) => prev.map((e) => (e.entryId === updated.entryId ? updated : e)))
        setShowEditModal(false)
      }
    } catch (error) {
      console.error('Failed to update KB entry:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!botId || !entryToDelete) return
    setSaving(true)
    try {
      const res = await deleteKBEntry(botId, entryToDelete.entryId)
      if (res.success) {
        setEntries((prev) => prev.filter((e) => e.entryId !== entryToDelete.entryId))
        setShowDeleteModal(false)
      }
    } catch (error) {
      console.error('Failed to delete KB entry:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!botId) {
    return (
      <div className="flex flex-col items-center text-center py-16">
        <p className="text-slate-800 font-medium">No chatbot selected</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/bots')}
          className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition-colors"
        >
          Back to Chatbots
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
            onClick={() => navigate('/dashboard/bots')}
            className="flex items-center gap-1 text-slate-500 text-sm hover:text-slate-700 transition-colors mb-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <h1 className="font-bold text-2xl text-slate-800">Knowledge Base</h1>
          {botName && <p className="text-slate-500 text-sm">{botName}</p>}
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          Add Entry
        </button>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mt-4 flex items-start gap-3">
        <Info size={18} className="text-indigo-500 shrink-0 mt-0.5" />
        <p className="text-indigo-700 text-sm">
          Entries added here will be used by your chatbot to answer questions not covered by your website content.
        </p>
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : entries.length === 0 ? (
        <div className="py-20 flex flex-col items-center text-center">
          <BookOpen className="text-indigo-300 mb-4" size={64} />
          <h2 className="text-2xl font-bold text-slate-700 mb-2">No knowledge base entries yet</h2>
          <p className="text-slate-500 text-sm mb-6 text-center max-w-md">
            Add information your chatbot should know that is not on your website
          </p>
          <button
            type="button"
            onClick={openAdd}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-indigo-700 transition-colors"
          >
            + Add Your First Entry
          </button>
        </div>
      ) : (
        <div className="mt-6">
          {entries.map((entry) => (
            <div
              key={entry.entryId}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow mb-4"
            >
              <div className="flex items-center gap-3">
                <BookOpen size={18} className="text-indigo-500 shrink-0" />
                <h3 className="font-semibold text-slate-800 flex-1">{entry.title}</h3>
                <button
                  type="button"
                  onClick={() => openEdit(entry)}
                  title="Edit entry"
                  className="text-slate-400 hover:text-indigo-600 transition-colors"
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
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <p className="text-slate-600 text-sm mt-2 line-clamp-2">
                {entry.content.length > PREVIEW_LENGTH
                  ? `${entry.content.slice(0, PREVIEW_LENGTH)}...`
                  : entry.content}
              </p>

              <div className="flex items-center gap-1 mt-3 text-slate-400 text-xs">
                <Calendar size={12} />
                Added {formatRelativeDate(new Date(entry.createdAt))}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <AlertTriangle className="text-red-500 mx-auto" size={32} />
            <h2 className="text-xl font-bold text-slate-800 text-center mt-3">Delete this entry?</h2>
            <p className="text-slate-500 text-sm text-center mt-2">
              This will permanently remove this knowledge base entry from your chatbot.
            </p>
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={saving}
                className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
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
