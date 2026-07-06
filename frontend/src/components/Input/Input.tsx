import styles from './Input.module.css'

interface InputProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  error?: string
  type?: 'text' | 'email' | 'tel' | 'password' | 'url' | 'number' | 'color'
  required?: boolean
  disabled?: boolean
  hint?: string
  min?: number
  max?: number
}

export function Input({
  label,
  placeholder,
  value,
  onChange,
  error,
  type = 'text',
  required = false,
  disabled = false,
  hint,
  min,
  max,
}: InputProps) {
  return (
    <div className={styles.field}>
      {label && (
        <label className={styles.label}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}
      <input
        className={`${styles.input} ${error ? styles.inputError : ''}`}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
      />
      {error && <p className={styles.error}>{error}</p>}
      {!error && hint && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}
