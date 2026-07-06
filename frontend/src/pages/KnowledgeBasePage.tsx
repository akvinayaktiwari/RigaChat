import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { addKBEntry, deleteKBEntry, getBotById, getKBEntries, updateKBEntry } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import type { BotConfig, KnowledgeBaseEntry } from '../types/index'
import { Card } from '../components/Card/Card'
import { Button } from '../components/Button/Button'
import { Input } from '../components/Input/Input'
import { Textarea } from '../components/Textarea/Textarea'
import { Modal } from '../components/Modal/Modal'
import { Spinner } from '../components/Spinner/Spinner'
import { EmptyState } from '../components/EmptyState/EmptyState'
import styles from './KnowledgeBasePage.module.css'

const PREVIEW_LENGTH = 100

export default function KnowledgeBasePage() {
  const { botId } = useParams<{ botId: string }>()
  const { show } = useToast()

  const [bot, setBot] = useState<BotConfig | null>(null)
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<KnowledgeBaseEntry | null>(null)
  const [deleteEntry, setDeleteEntry] = useState<KnowledgeBaseEntry | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useEffect(() => {
    if (!botId) return
    Promise.all([getBotById(botId), getKBEntries(botId)]).then(([botRes, kbRes]) => {
      if (botRes.success && botRes.data) setBot(botRes.data)
      if (kbRes.success && kbRes.data) setEntries(kbRes.data)
      setLoading(false)
    })
  }, [botId])

  async function reloadEntries() {
    if (!botId) return
    const res = await getKBEntries(botId)
    if (res.success && res.data) setEntries(res.data)
  }

  function openAdd() {
    setTitle('')
    setContent('')
    setAddOpen(true)
  }

  function openEdit(entry: KnowledgeBaseEntry) {
    setTitle(entry.title)
    setContent(entry.content)
    setEditEntry(entry)
  }

  async function handleAdd() {
    if (!botId || !title.trim() || !content.trim()) return
    setSaving(true)
    const res = await addKBEntry({ botId, title, content })
    setSaving(false)
    if (res.success) {
      show('Entry added', 'success')
      setAddOpen(false)
      reloadEntries()
    } else {
      show(res.error ?? 'Failed to add entry', 'error')
    }
  }

  async function handleEditSave() {
    if (!botId || !editEntry || !title.trim() || !content.trim()) return
    setSaving(true)
    const res = await updateKBEntry(botId, editEntry.entryId, { title, content })
    setSaving(false)
    if (res.success) {
      show('Entry updated', 'success')
      setEditEntry(null)
      reloadEntries()
    } else {
      show(res.error ?? 'Failed to update entry', 'error')
    }
  }

  async function handleDelete() {
    if (!botId || !deleteEntry) return
    const res = await deleteKBEntry(botId, deleteEntry.entryId)
    setDeleteEntry(null)
    if (res.success) {
      show('Entry deleted', 'success')
      reloadEntries()
    } else {
      show(res.error ?? 'Failed to delete entry', 'error')
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div>
      <div className={styles.header}>
        <h1 className={styles.title}>Knowledge Base{bot ? ` — ${bot.name}` : ''}</h1>
        <Button onClick={openAdd}>Add Entry</Button>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No knowledge base entries yet"
          description="Add information your chatbot should know that is not on your website"
          action={<Button onClick={openAdd}>Add Entry</Button>}
        />
      ) : (
        <div className={styles.list}>
          {entries.map((entry) => (
            <Card key={entry.entryId}>
              <h3 className={styles.entryTitle}>{entry.title}</h3>
              <p className={styles.entryPreview}>
                {entry.content.slice(0, PREVIEW_LENGTH)}
                {entry.content.length > PREVIEW_LENGTH ? '…' : ''}
              </p>
              <div className={styles.actions}>
                <Button size="sm" variant="secondary" onClick={() => openEdit(entry)}>
                  Edit
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteEntry(entry)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add Knowledge Base Entry">
        <Input label="Title" value={title} onChange={setTitle} required />
        <Textarea label="Content" value={content} onChange={setContent} rows={8} required />
        <Button onClick={handleAdd} loading={saving}>
          Save
        </Button>
      </Modal>

      <Modal isOpen={!!editEntry} onClose={() => setEditEntry(null)} title="Edit Knowledge Base Entry">
        <Input label="Title" value={title} onChange={setTitle} required />
        <Textarea label="Content" value={content} onChange={setContent} rows={8} required />
        <Button onClick={handleEditSave} loading={saving}>
          Save
        </Button>
      </Modal>

      <Modal isOpen={!!deleteEntry} onClose={() => setDeleteEntry(null)} title="Delete entry?" size="sm">
        <p className={styles.confirmText}>
          Are you sure you want to delete "{deleteEntry?.title}"? This cannot be undone.
        </p>
        <div className={styles.confirmActions}>
          <Button variant="secondary" onClick={() => setDeleteEntry(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
