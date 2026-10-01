import type { ReactNode } from 'react'
import { LazyMotion } from 'motion/react'

async function loadMotionFeatures() {
  const features = await import('../lib/motion-features')
  return features.default
}

interface MotionProviderProps {
  children: ReactNode
}

/**
 * Keeps the animation engine out of the main bundle.
 *
 * Every animated element is an `m.*` component, which is a thin shell until
 * the features arrive from their own chunk. `strict` makes a stray `motion.*`
 * import throw in development, because one of those silently drags the whole
 * engine back into the main bundle.
 */
export function MotionProvider({ children }: MotionProviderProps) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      {children}
    </LazyMotion>
  )
}
