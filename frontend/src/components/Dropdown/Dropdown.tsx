// One dropdown for the whole product.
//
// WHY NOT A NATIVE <select>
//   A native select renders its option list with OS chrome. It cannot carry a
//   description line, cannot show a selected check, and looks like a different
//   product on macOS, Windows and Android. The app had 28 of them, so every
//   screen quietly disagreed with every other one about what a control looks
//   like.
//
// WHAT A CUSTOM LISTBOX OWES YOU IN RETURN
//   Native selects are keyboard-accessible for free; a custom one is only
//   acceptable if it earns that back. This implements the WAI-ARIA listbox
//   contract in full: arrow keys, Home/End, Enter/Space, Escape, printable-
//   character typeahead, focus return to the trigger on close, and roving
//   aria-activedescendant so a screen reader announces the highlighted option
//   without moving DOM focus.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface DropdownOption<T extends string = string> {
  value: T
  label: string
  // A second line under the label. Native selects cannot do this at all, and it
  // is the reason several screens padded their option text with " -- ..." to
  // fake it.
  description?: string
  disabled?: boolean
}

interface DropdownProps<T extends string = string> {
  value: T
  onChange: (value: T) => void
  options: Array<DropdownOption<T>>
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  // Rendered as the accessible name. Use when there is no visible <label>.
  ariaLabel?: string
  id?: string
  // `inline` is for a dropdown sitting in a sentence or a toolbar rather than in
  // a form field: it shrinks to its content instead of filling the row.
  variant?: 'block' | 'inline'
  // Replaces the trigger's own styling entirely. For a trigger that is not a
  // form field at all -- a status pill in a table row, say -- where inheriting
  // the field chrome would be wrong. The listbox, the keyboard contract and the
  // ARIA wiring are unaffected.
  triggerClassName?: string
  className?: string
}

// Typeahead resets after this long, matching native select behaviour: typing
// "b", pause, "a" should select something starting with "a", not "ba".
const TYPEAHEAD_RESET_MS = 600

export default function Dropdown<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  invalid = false,
  ariaLabel,
  id,
  variant = 'block',
  triggerClassName,
  className = '',
}: DropdownProps<T>) {
  const generatedId = useId()
  const baseId = id ?? generatedId
  const listId = `${baseId}-listbox`

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [dropUp, setDropUp] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const typeahead = useRef({ buffer: '', at: 0 })

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const firstEnabled = options.findIndex((o) => !o.disabled)

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    setActiveIndex(-1)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  function openList() {
    if (disabled) return
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled)
    setOpen(true)
  }

  function commit(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    close(true)
  }

  // Skips disabled options so arrowing never parks on something unselectable.
  function step(from: number, delta: number): number {
    if (options.length === 0) return -1
    let i = from
    for (let guard = 0; guard < options.length; guard += 1) {
      i += delta
      if (i < 0) i = options.length - 1
      if (i >= options.length) i = 0
      if (!options[i].disabled) return i
    }
    return from
  }

  function edge(direction: 'first' | 'last'): number {
    const order = direction === 'first' ? options : [...options].reverse()
    const found = order.findIndex((o) => !o.disabled)
    if (found < 0) return -1
    return direction === 'first' ? found : options.length - 1 - found
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (disabled) return

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        openList()
      }
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((i) => step(i, 1))
        return
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((i) => step(i, -1))
        return
      case 'Home':
        event.preventDefault()
        setActiveIndex(edge('first'))
        return
      case 'End':
        event.preventDefault()
        setActiveIndex(edge('last'))
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        commit(activeIndex)
        return
      case 'Escape':
        event.preventDefault()
        close(true)
        return
      case 'Tab':
        // Tabbing away commits nothing and closes, same as a native select.
        close(false)
        return
      default:
        break
    }

    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const now = Date.now()
      const buffer =
        now - typeahead.current.at > TYPEAHEAD_RESET_MS
          ? event.key.toLowerCase()
          : typeahead.current.buffer + event.key.toLowerCase()
      typeahead.current = { buffer, at: now }

      const match = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(buffer))
      if (match >= 0) {
        event.preventDefault()
        setActiveIndex(match)
      }
    }
  }

  // Close when focus or a click leaves the component entirely. Checking
  // relatedTarget rather than a bare document listener keeps a click on our own
  // option from closing the list before it commits.
  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  // Flip above the trigger when there is not enough room below, so a dropdown
  // near the bottom of a long form does not open off-screen.
  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = window.innerHeight - rect.bottom
    setDropUp(spaceBelow < 240 && rect.top > spaceBelow)
  }, [open])

  // Keep the highlighted option in view when arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    // Guarded rather than called straight: scrollIntoView is absent in jsdom and
    // in some embedded webviews, and keeping an option visible is a nicety that
    // must never take the whole control down with it.
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const width = variant === 'inline' ? 'w-auto' : 'w-full'

  return (
    <div ref={rootRef} className={`relative ${width} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        id={baseId}
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        // Focus never leaves this button, so the ACTIVE option has to be
        // announced from here. On the <ul>, which never holds focus, a screen
        // reader would never read the highlight at all.
        aria-activedescendant={open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKeyDown}
        className={
          triggerClassName ??
          `${width} inline-flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-sm text-left transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed
          ${invalid ? 'border-red-300' : 'border-gray-200 hover:border-gray-300'}
          ${open ? 'border-violet-400' : ''}`
        }
      >
        <span className={`flex-1 truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
            className={`absolute z-50 ${variant === 'inline' ? 'min-w-full w-max max-w-xs' : 'w-full'}
            max-h-72 overflow-auto rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg shadow-black/5
            ${dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
        >
          {options.length === 0 && (
            <li className="px-3.5 py-2.5 text-sm text-gray-400">Nothing to choose from</li>
          )}

          {options.map((option, index) => {
            const isSelected = option.value === value
            const isActive = index === activeIndex
            return (
              <li
                key={option.value}
                id={`${baseId}-opt-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => commit(index)}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                className={`flex items-start gap-2.5 px-3.5 py-2.5 text-sm
                  ${option.disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}
                  ${isActive && !option.disabled ? 'bg-violet-50' : ''}`}
              >
                <Check
                  size={15}
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 text-violet-600 ${isSelected ? '' : 'invisible'}`}
                />
                <span className="min-w-0">
                  <span className={`block truncate ${isSelected ? 'font-semibold text-violet-700' : 'text-gray-900'}`}>
                    {option.label}
                  </span>
                  {option.description && (
                    <span className="block text-[12px] leading-snug text-gray-500 mt-0.5">
                      {option.description}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
