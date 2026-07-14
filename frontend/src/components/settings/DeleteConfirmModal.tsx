const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface DeleteConfirmModalProps {
  onClose: () => void
  onConfirm: () => void
}

export default function DeleteConfirmModal({ onClose, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 max-w-sm w-full">
        <h2 className="font-bold text-xl text-red-600" style={JAKARTA_FONT}>
          Delete Account?
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          This will permanently erase all your chatbots, leads, conversations, and knowledge base entries. This
          action cannot be undone.
        </p>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="text-gray-600 font-medium px-3 py-2 rounded-xl text-sm hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-red-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm hover:bg-red-600 transition-colors"
          >
            Delete Account
          </button>
        </div>
      </div>
    </div>
  )
}
