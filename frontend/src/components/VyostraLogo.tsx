import { useId } from 'react'

interface VyostraLogoProps {
  size?: number
  animate?: boolean
  className?: string
}

export default function VyostraLogo({ size = 36, animate = true, className = '' }: VyostraLogoProps) {
  const id = useId().replace(/:/g, '')

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${animate ? 'vyostra-logo-glow' : ''} ${className}`}
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#grad-${id})`} />
      <path
        d="M10 13C10 11.3 11.3 10 13 10H51C52.7 10 54 11.3 54 13V38C54 39.7 52.7 41 51 41H38L32 50L26 41H13C11.3 41 10 39.7 10 38V13Z"
        fill="white"
        fillOpacity="0.18"
      />
      <path d="M19 19L32 39L45 19H37.5L32 31L26.5 19H19Z" fill="white" />
    </svg>
  )
}
