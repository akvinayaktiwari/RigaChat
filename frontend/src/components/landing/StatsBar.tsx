import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'motion/react'
import { RevealGroup, RevealItem } from './motion-primitives'

interface Stat {
  /** The numeric part that counts up. */
  value: number
  /** Rendered before the number, e.g. a currency symbol. */
  prefix?: string
  /** Rendered after the number, e.g. '+', '%', ' min'. */
  suffix?: string
  label: string
}

const STATS: Stat[] = [
  { value: 50000, suffix: '+', label: 'Leads captured' },
  { value: 3, suffix: ' min', label: 'Average setup time' },
  { value: 94, suffix: '%', label: 'Resolution rate' },
  { value: 500, suffix: '+', label: 'Businesses live' },
]

const COUNT_DURATION_MS = 1400

/**
 * Counts from 0 to `target` once the element enters the viewport.
 *
 * The number is stored split into value/prefix/suffix rather than as a display
 * string ('50,000+') because the counter has to own the formatting -- a string
 * would have to be parsed back apart on every frame, and '3 min' has no single
 * correct parse.
 */
function useCountUp(target: number, active: boolean): number {
  const [current, setCurrent] = useState(active ? target : 0)

  useEffect(() => {
    if (!active) return

    let frame = 0
    const start = performance.now()

    function tick(now: number) {
      const progress = Math.min((now - start) / COUNT_DURATION_MS, 1)
      // Ease-out cubic: fast at first, settles into the real number. A linear
      // count reads like a loading spinner rather than a value landing.
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(target * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, active])

  return current
}

function StatValue({ stat, active }: { stat: Stat; active: boolean }) {
  const current = useCountUp(stat.value, active)

  return (
    <p
      className="text-3xl font-extrabold text-gray-900 mb-1 tabular-nums"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {stat.prefix}
      {current.toLocaleString('en-US')}
      {stat.suffix}
    </p>
  )
}

export default function StatsBar() {
  const sectionRef = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const inView = useInView(sectionRef, { once: true, amount: 0.5 })

  // Under reduced motion the counters are handed their final value from the
  // first render instead of ticking to it.
  const counting = reduced ? true : inView

  return (
    <section ref={sectionRef} className="py-12 px-4 border-y border-gray-100/80 relative overflow-hidden">
      {/* Hairline that picks up the hero's violet, so the stats bar reads as
          the continuation of the hero rather than a separate slab. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-violet-300/60 to-transparent"
      />

      <RevealGroup className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8" stagger={0.08}>
        {STATS.map((stat) => (
          <RevealItem key={stat.label} className="text-center">
            <StatValue stat={stat} active={counting} />
            <p className="text-sm text-gray-500">{stat.label}</p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  )
}
