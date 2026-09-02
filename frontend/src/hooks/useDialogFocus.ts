import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * The behaviour that makes `aria-modal="true"` true.
 *
 * Without it the attribute is a claim the DOM does not honour: a keyboard user
 * Tabs straight out of the dialog into the page behind it, while a screen
 * reader has been told that page is inert. Escape closes, focus starts inside,
 * and focus returns to whatever opened the dialog when it unmounts -- otherwise
 * closing drops the caret back at the top of the document.
 *
 * Extracted from Modal so the two dialogs in this app share one implementation
 * rather than one having the behaviour and the other only the attribute.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, isOpen = true): void {
  // Callers pass `onClose` as an inline arrow, so its identity changes on every
  // parent render. Depending on it directly would tear down and re-run this
  // effect each time -- restoring focus outside the dialog and then yanking it
  // back to the first control, on renders that have nothing to do with the
  // dialog. Held in a ref so the effect runs once per open and still calls the
  // current callback.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = ref.current
    const focusable = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    focusable?.[0]?.focus()

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return

      // Re-queried on every Tab: the picker's focusable set changes as rows
      // become disabled at the cap, so a list captured on mount goes stale.
      const current = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (!current || current.length === 0) return

      const first = current[0]
      const last = current[current.length - 1]
      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [ref, isOpen])
}
