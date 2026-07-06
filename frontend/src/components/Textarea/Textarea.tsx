import styles from './Textarea.module.css'

interface TextareaProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  rows?: number
  required?: boolean
  disabled?: boolean
  hint?: string
}

export function Textarea({
  label,
  placeholder,
  value,
  onChange,
  error,
  rows = 4,
  required = false,
  disabled = false,
  hint,
}: TextareaProps) {
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}
      <textarea
        className={`${styles.textarea} ${error ? styles.textareaError : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        required={required}
        disabled={disabled}
      />
      {error && <p className={styles.error}>{error}</p>}
      {!error && hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}
