import { useState } from 'react'
import { X } from 'lucide-react'

interface EditProfileModalProps {
  name: string
  onClose: () => void
  onSave: (name: string) => void
  saving: boolean
}

export default function EditProfileModal({ name, onClose, onSave, saving }: EditProfileModalProps) {
  const [value, setValue] = useState(name)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    onSave(value.trim())
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
          title="Close"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-bold text-on-surface">Edit Profile</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="edit-profile-name" className="block text-xs font-bold text-on-surface-variant mb-2">
              Display Name
            </label>
            <input
              id="edit-profile-name"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-4 py-2.5 border border-outline-variant rounded-xl text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-on-surface-variant hover:text-on-surface transition-colors px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !value.trim()}
              className="bg-primary hover:bg-primary-container text-on-primary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
