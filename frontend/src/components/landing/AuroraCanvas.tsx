import { useEffect, useRef, useState } from 'react'
import { createLatticeRenderer } from './aurora/gl'
import { useAuroraGuards } from './aurora/useAuroraGuards'

/**
 * 30fps. At this motion speed 60 is indistinguishable and costs twice the GPU.
 * Expressed as a frame budget so the RAF loop can skip rather than throttle.
 */
const FRAME_MS = 1000 / 30

/** Guards against a tab left in the background for an hour returning with a huge dt. */
const MAX_DELTA_S = 0.05

/**
 * The hero's animated background: a violet/cyan lattice field on a single
 * WebGL quad.
 *
 * Decorative only. It renders inside a pointer-events-none, aria-hidden layer
 * and never carries content, so every failure path below simply leaves the CSS
 * gradient showing -- which is also what a user who asked for reduced motion,
 * or is on a phone, or has no WebGL, sees by design rather than by accident.
 */
export default function AuroraCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const allowed = useAuroraGuards()
  const [painted, setPainted] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!allowed || !canvas) return

    const renderer = createLatticeRenderer(canvas)
    if (!renderer) return

    let frame: number | null = null
    let clock = 0
    let last = 0
    let onScreen = true

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < FRAME_MS) return

      const delta = last === 0 ? 0 : Math.min((now - last) / 1000, MAX_DELTA_S)
      last = now
      clock += delta
      renderer.draw(clock)
    }

    const start = () => {
      if (frame !== null) return
      last = 0
      frame = requestAnimationFrame(tick)
    }

    const stop = () => {
      if (frame === null) return
      cancelAnimationFrame(frame)
      frame = null
    }

    // Two independent reasons to hold: the tab is hidden, or the hero has been
    // scrolled past. Either one alone should pause it, so they are combined
    // rather than each calling start() and fighting the other.
    const sync = () => {
      if (onScreen && !document.hidden) start()
      else stop()
    }

    const observer = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting)
      sync()
    })
    observer.observe(canvas)

    const onResize = () => {
      renderer.resize()
      renderer.draw(clock)
    }

    renderer.resize()
    renderer.draw(0)
    setPainted(true)

    document.addEventListener('visibilitychange', sync)
    window.addEventListener('resize', onResize)
    sync()

    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      setPainted(false)
    }
  }, [allowed])

  return (
    <>
      {/* The fallback IS the background: it paints first, the canvas composites
          over it, and it is what remains on every path where the canvas never
          starts. Keeping it mounted is why the fade-in cannot flash. */}
      <div className="aurora-ground absolute inset-0" />
      {allowed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full transition-opacity duration-700"
          style={{ opacity: painted ? 1 : 0 }}
        />
      )}
    </>
  )
}
