import { motion, useReducedMotion, type Variants } from 'motion/react'
import type { ReactNode } from 'react'

// Shared motion tokens for the landing page. They live here rather than inline
// per section so a duration is never copy-pasted -- one duration reused for
// every transition is the thing that makes a page feel mechanical, and it is
// what the UI/UX Pro Max animation rules call out first.
//
// EASE_OUT is the expo-out curve used for anything that travels a distance
// (section reveals). EASE_BACK is the overshoot curve used for things that
// pop into place (grid cards, badges) -- the framer equivalent of GSAP's
// back.out(1.4) that the design-system query returned for stagger grids.
export const EASE_OUT = [0.22, 1, 0.36, 1] as const
export const EASE_BACK = [0.34, 1.56, 0.64, 1] as const

export const DURATION = {
  /** Micro feedback: badges, dots, small state flips. */
  fast: 0.25,
  /** The default reveal. Short travel, reads as a fade with intent. */
  base: 0.45,
  /** Hero-scale entrances only. */
  slow: 0.7,
} as const

/** Distance a revealing element travels. Kept small so it reads as a fade. */
const TRAVEL = 18

/** Fires once, slightly before the element is fully on screen. */
const VIEWPORT = { once: true, amount: 0.25, margin: '0px 0px -80px 0px' } as const

interface RevealProps {
  children: ReactNode
  className?: string
}

/**
 * Reveals its children once when scrolled into view.
 *
 * Under `prefers-reduced-motion` this renders the final state immediately with
 * no transition at all -- not a shortened one. The content is always in the DOM
 * either way, so crawlers and no-JS readers see it regardless.
 */
export function Reveal({ children, className }: RevealProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    return <motion.div className={className}>{children}</motion.div>
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: TRAVEL }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

interface RevealGroupProps {
  children: ReactNode
  className?: string
  /** Seconds between each child. 0.06 keeps an 8-card grid under half a second. */
  stagger?: number
}

/**
 * Staggers its direct `RevealItem` children into view as one wave.
 *
 * Prefer this over hand-tuned `delay` props on individual Reveals: the stagger
 * stays correct when cards are added or reordered, and the whole group shares
 * one viewport trigger instead of one observer per card.
 *
 * Keep groups to roughly 8 items. Past that the tail of the wave lands late
 * enough that it reads as lag rather than choreography.
 */
export function RevealGroup({ children, className, stagger = 0.06 }: RevealGroupProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    return <motion.div className={className}>{children}</motion.div>
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={{ visible: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  )
}

const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.base, ease: EASE_BACK },
  },
}

interface RevealItemProps {
  children: ReactNode
  className?: string
}

/** A single card in a `RevealGroup`. Inert on its own outside one. */
export function RevealItem({ children, className }: RevealItemProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    return <motion.div className={className}>{children}</motion.div>
  }

  return (
    <motion.div className={className} variants={ITEM_VARIANTS}>
      {children}
    </motion.div>
  )
}
