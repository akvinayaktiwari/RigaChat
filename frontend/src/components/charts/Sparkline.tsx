interface SparklineProps {
  /** Ordered series of values, oldest first. Needs at least 2 points to draw a line. */
  data: number[]
  /** Stroke color for the line (any valid SVG color, e.g. a Tailwind-resolved hex). */
  color: string
  /** Rendered height in px. Width always fills the parent container. */
  height?: number
}

const VIEW_WIDTH = 100

/**
 * A minimal inline trend line — no axes, no labels, no gridlines.
 * Scales the given values to fill the available width/height and renders
 * a single polyline. Intended to sit inside a stat card, ~26px tall.
 */
export default function Sparkline({ data, color, height = 26 }: SparklineProps) {
  if (data.length < 2) {
    return <div style={{ height }} aria-hidden="true" />
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * VIEW_WIDTH
      // Leave a hairline of padding top/bottom so the stroke doesn't clip.
      const y = height - 2 - ((value - min) / range) * (height - 4)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
