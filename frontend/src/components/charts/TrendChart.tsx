import { useId } from 'react'

export interface TrendChartPoint {
  date: string
  value: number
}

interface TrendChartProps {
  /** Primary series, oldest point first. */
  data: TrendChartPoint[]
  /** Optional secondary series, rendered as a lighter line with no fill (must be same length/order as `data`). */
  secondaryData?: TrendChartPoint[]
  color?: string
  secondaryColor?: string
  height?: number
  /** Formats a point's date for the x-axis-less tooltip-free label under the chart (first/last only). */
  formatLabel?: (date: string) => string
}

const VIEW_WIDTH = 600
const GRIDLINE_COUNT = 4
const DEFAULT_COLOR = '#7c3aed' // violet-600
const DEFAULT_SECONDARY_COLOR = '#c4b5fd' // violet-300

function buildPath(values: number[], width: number, height: number, min: number, range: number): string {
  return values
    .map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * width : 0
      const y = height - ((value - min) / range) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function defaultFormatLabel(date: string): string {
  // `date` is a plain "YYYY-MM-DD" calendar-day key (see bucketLeadsByDay).
  // Parsed bare, the spec treats it as UTC midnight, but toLocaleDateString
  // below renders in the viewer's local timezone — for any timezone behind
  // UTC that silently shows the wrong day (e.g. a bucket keyed "2026-07-24"
  // displaying as "Jul 23"). Appending a local-midnight time component makes
  // the parse match the local calendar day the key actually represents.
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Small hand-rolled SVG area + line chart for a daily time series.
 * Renders a few horizontal gridlines, the filled area under the primary
 * series, an optional lighter secondary line, and an emphasized dot on the
 * latest point of the primary series. Not a general-purpose chart library —
 * built for the "leads over time" use case only.
 */
export default function TrendChart({
  data,
  secondaryData,
  color = DEFAULT_COLOR,
  secondaryColor = DEFAULT_SECONDARY_COLOR,
  height = 160,
  formatLabel = defaultFormatLabel,
}: TrendChartProps) {
  // SVG <linearGradient id> is global to the document, not scoped to this
  // component instance — a second <TrendChart> on the same page would
  // silently pick up the first one's gradient stops via url(#...) collision
  // without useId() giving each instance its own id.
  const gradientId = `trend-chart-fill-${useId()}`

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-400" style={{ height }}>
        Not enough data yet
      </div>
    )
  }

  const values = data.map((d) => d.value)
  const secondaryValues = secondaryData?.map((d) => d.value) ?? []
  const allValues = [...values, ...secondaryValues]
  const min = Math.min(0, ...allValues)
  const max = Math.max(...allValues, 1)
  const range = max - min || 1

  const linePath = buildPath(values, VIEW_WIDTH, height, min, range)
  const areaPath = `${linePath} L${VIEW_WIDTH},${height} L0,${height} Z`
  const secondaryPath = secondaryValues.length > 1 ? buildPath(secondaryValues, VIEW_WIDTH, height, min, range) : null

  const lastIndex = data.length - 1
  const lastX = VIEW_WIDTH
  const lastY = height - ((values[lastIndex] - min) / range) * height

  const gridlines = Array.from({ length: GRIDLINE_COUNT + 1 }, (_, i) => (i / GRIDLINE_COUNT) * height)

  return (
    <div>
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {gridlines.map((y) => (
          <line key={y} x1={0} y1={y} x2={VIEW_WIDTH} y2={y} stroke="#f1f0f5" strokeWidth={1} />
        ))}

        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {secondaryPath && (
          <path d={secondaryPath} fill="none" stroke={secondaryColor} strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" />
        )}

        <circle cx={lastX} cy={lastY} r={4} fill="#ffffff" stroke={color} strokeWidth={2} />
      </svg>
      <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
        <span>{formatLabel(data[0].date)}</span>
        <span>{formatLabel(data[lastIndex].date)}</span>
      </div>
    </div>
  )
}
