interface DeleteConfirmModalProps {
  onClose: () => void
  onConfirm: () => void
}

export default function DeleteConfirmModal({ onClose, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
        <h2 className="text-lg font-bold text-rose-600">Delete Account?</h2>
        <p className="text-sm text-on-surface-variant mt-2">
          This will permanently erase all your chatbots, leads, conversations, and knowledge base entries. This
          action cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )
}
