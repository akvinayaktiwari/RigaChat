import type { ReactNode } from 'react'
import styles from './Card.module.css'

interface CardProps {
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg'
  shadow?: boolean
  className?: string
}

export function Card({ children, padding = 'md', shadow = false, className = '' }: CardProps) {
  return (
    <div
      className={`${styles.card} ${styles[`padding-${padding}`]} ${shadow ? styles.shadow : ''} ${className}`}
    >
      {children}
    </div>
  )
}
