import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'

export interface FilterChip {
  /** Unique key for the React list — also identifies which filter this chip clears. */
  key: string
  /** Full chip label, e.g. "Agent: Support Bot". */
  label: string
  onRemove: () => void
}

interface FilterBarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  /** Arbitrary filter controls (selects, etc.) rendered inline after the search input. */
  children?: ReactNode
  /** Currently active filters, shown as removable chips below the controls row. Omit/empty to hide the row. */
  chips: FilterChip[]
  onClearAll: () => void
}

/**
 * Generic filter bar: a controls row (search input + arbitrary filter
 * dropdowns passed as children) and, when any filter is active, a row of
 * removable chips plus a "Clear filters" action.
 */
export default function FilterBar({ searchValue, onSearchChange, searchPlaceholder, children, chips, onClearAll }: FilterBarProps) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-4 shadow-sm">
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? 'Search...'}
            className="border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm w-64 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors"
          />
        </div>

        {children}
      </div>

      {chips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gray-50">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 border border-violet-200 text-xs font-medium pl-2.5 pr-1.5 py-1 rounded-full"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={`Remove filter: ${chip.label}`}
                className="hover:bg-violet-100 rounded-full p-0.5 transition-colors"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onClearAll}
            className="text-gray-500 text-xs font-medium hover:text-gray-700 transition-colors px-2 py-1"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  )
}
