interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  onLabel?: string
  offLabel?: string
  title?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, onLabel, offLabel, title, disabled = false }: ToggleProps) {
  const label = checked ? onLabel : (offLabel ?? onLabel)

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        title={title}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
          checked ? 'bg-indigo-600' : 'bg-slate-200'
        } ${disabled ? 'pointer-events-none opacity-75' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {label && (
        <span className={`text-sm font-medium ${checked ? 'text-indigo-600' : 'text-slate-400'}`}>{label}</span>
      )}
    </div>
  )
}
