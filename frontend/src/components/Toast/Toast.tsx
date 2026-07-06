import { useEffect, useState } from 'react'
import styles from './Toast.module.css'

type ToastType = 'success' | 'error' | 'warning'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

const DISMISS_AFTER_MS = 3000

let toasts: ToastItem[] = []
let listeners: Array<(toasts: ToastItem[]) => void> = []
let nextId = 1

function emit(): void {
  listeners.forEach((listener) => listener(toasts))
}

function addToast(message: string, type: ToastType): void {
  const id = nextId++
  toasts = [...toasts, { id, message, type }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, DISMISS_AFTER_MS)
}

export function useToast() {
  return {
    show: (message: string, type: ToastType = 'success') => addToast(message, type),
  }
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>(toasts)

  useEffect(() => {
    listeners.push(setItems)
    return () => {
      listeners = listeners.filter((listener) => listener !== setItems)
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div className={styles.container}>
      {items.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
