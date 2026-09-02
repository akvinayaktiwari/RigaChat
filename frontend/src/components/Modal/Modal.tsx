import { useRef } from 'react'
import type { ReactNode } from 'react'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import styles from './Modal.module.css'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Shared with MetaPagePicker: one focus trap, two dialogs.
  useDialogFocus(dialogRef, onClose, isOpen)

  if (!isOpen) return null

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={dialogRef}
        className={`${styles.dialog} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  )
}
