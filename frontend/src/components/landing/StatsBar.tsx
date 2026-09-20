import { useEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { RevealGroup, RevealItem, useStaticMotion } from './motion-primitives'

interface Stat {
  /** The numeric part that counts up. */
  value: number
  /** Rendered before the number, e.g. a currency symbol. */
  prefix?: string
  /** Rendered after the number, e.g. '+', '%', ' min'. */
  suffix?: string
  label: string
}

/**
 * What the product IS, not how it has performed.
 *
 * This bar used to claim "50,000+ leads captured", "94% resolution rate" and
 * "500+ businesses live". Production held 181 leads across all three lead
 * tables and 16 client records, and nothing in the product measures a
 * resolution rate at all -- the figure had no source to be wrong about. A
 * traction number on a page built to be quoted by answer engines is a number
 * that gets quoted, so every value here is instead true by construction:
 * three channels because three are built, $49 because PRICING_TIERS says so,
 * one inbox because every channel writes to the same CRM.
 *
 * Anything added here must be checkable against the product or the price list.
 * A performance claim needs a measurement behind it first.
 */
const STATS: Stat[] = [
  { value: 3, label: 'Channels: chat, voice, WhatsApp' },
  { value: 24, suffix: '/7', label: 'Answering, every day' },
  { value: 49, prefix: '$', label: 'Plans start at, per month' },
  { value: 1, label: 'Inbox for every lead' },
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
function useCountUp(target: number, active: boolean, reduced: boolean): number {
  const [current, setCurrent] = useState(reduced ? target : 0)

  useEffect(() => {
    // Reduced motion gets the final value and NO animation -- not a shortened
    // one. `reduced` has to stay a separate signal from `active`: collapsing
    // them (active = reduced || inView) still let this effect schedule a frame,
    // which snapped the seeded value back to 0 and counted up anyway, doing
    // the exact opposite of what the preference asks for.
    if (reduced) {
      setCurrent(target)
      return
    }

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

function StatValue({ stat, active, reduced }: { stat: Stat; active: boolean; reduced: boolean }) {
  const current = useCountUp(stat.value, active, reduced)

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
  const reduced = useStaticMotion()
  const inView = useInView(sectionRef, { once: true, amount: 0.5 })

  // `reduced` and `inView` stay separate signals all the way down. Folding
  // them into one boolean here is what broke the reduced-motion path: it made
  // the counter "active", which is what schedules the animation.

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
            <StatValue stat={stat} active={inView} reduced={reduced ?? false} />
            <p className="text-sm text-gray-500">{stat.label}</p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  )
}
