import styles from './Spinner.module.css'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: string
}

export function Spinner({ size = 'md', color }: SpinnerProps) {
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      style={color ? { borderTopColor: color, borderColor: `${color}33` } : undefined}
      role="status"
      aria-label="Loading"
    />
  )
}
