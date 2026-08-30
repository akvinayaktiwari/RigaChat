import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ChevronRight, Star } from 'lucide-react'
import DemoChat from './DemoChat'
import { DURATION, EASE_OUT, EASE_BACK } from './motion-primitives'

interface HeroSectionProps {
  onOpenDemo: () => void
}

const AVATARS = [
  { gradient: 'from-violet-500 to-purple-600', initial: 'V' },
  { gradient: 'from-amber-400 to-orange-500', initial: 'A' },
  { gradient: 'from-emerald-400 to-teal-500', initial: 'S' },
  { gradient: 'from-sky-400 to-blue-500', initial: 'M' },
]

export default function HeroSection({ onOpenDemo }: HeroSectionProps) {
  const navigate = useNavigate()
  const reduced = useReducedMotion()

  // The hero is above the fold, so it animates on mount rather than on scroll
  // -- a whileInView trigger here would either fire instantly anyway or, worse,
  // leave the headline invisible on a short viewport.
  const container = reduced
    ? {}
    : {
        initial: 'hidden',
        animate: 'visible',
        variants: { visible: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } } },
      }

  const item = reduced
    ? {}
    : {
        variants: {
          hidden: { opacity: 0, y: 20 },
          visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
        },
      }

  return (
    <section className="relative flex items-center pt-32 pb-20 px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="tech-grid absolute inset-0" />
        <div className="aurora-drift absolute top-32 left-1/4 w-96 h-96 bg-violet-200/30 rounded-full blur-3xl" />
        <div className="aurora-drift aurora-drift-slow absolute top-48 right-1/4 w-80 h-80 bg-pink-200/25 rounded-full blur-3xl" />
        <div className="aurora-drift aurora-drift-slower absolute bottom-32 left-1/3 w-64 h-64 bg-sky-200/20 rounded-full blur-3xl" />
        {/* Cyan second-light. One small, low-alpha source is what separates
            "purple gradient SaaS page" from something that reads as lit. */}
        <div className="aurora-drift aurora-drift-slow absolute top-24 right-1/3 w-72 h-72 bg-cyan-200/20 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <motion.div {...container}>
          <motion.div
            {...item}
            className="inline-flex items-center gap-2 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-violet-500 rounded-full inline-block animate-pulse" />
            New: self-running follow-up journeys
            <ChevronRight className="w-3.5 h-3.5" />
          </motion.div>

          {/* NOT part of the mount stagger. This h1 is the page's LCP element;
              animating it in means the most important thing on the page is
              invisible until motion/react hydrates, so a slow chunk or a failed
              bundle shows a blank headline rather than an un-animated one.
              design.md's own rule is 1-2 animated elements per viewport, and
              this is the wrong one to spend it on. */}
          <h1
            className="text-5xl sm:text-6xl font-extrabold text-gray-900 leading-[1.1] tracking-tight mb-6"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Deploy AI agents your customers{' '}
            <span className="bg-linear-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent">
              love to talk to.
            </span>
          </h1>

          <motion.p {...item} className="text-lg text-gray-500 leading-relaxed mb-8 max-w-lg">
            Train on your website content, capture leads automatically, then let your agent follow up on WhatsApp until
            they book — all in one platform.
          </motion.p>

          <motion.div {...item} className="flex flex-col sm:flex-row gap-3 mb-10">
            <button
              onClick={() => navigate('/signup')}
              className="cta-sheen w-full sm:w-auto inline-flex items-center justify-center gap-2 text-white font-semibold bg-linear-to-r from-violet-600 to-purple-500 px-6 py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-violet-200/70 hover:shadow-xl hover:shadow-violet-300/60 text-sm"
            >
              Start free — no card needed
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenDemo}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-gray-700 font-semibold bg-white border border-gray-200 px-6 py-3.5 rounded-xl hover:bg-gray-50 transition-colors text-sm shadow-sm"
            >
              See it in action
            </button>
          </motion.div>

          <motion.div {...item} className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {AVATARS.map((avatar, i) => (
                <motion.div
                  key={avatar.initial}
                  initial={reduced ? false : { opacity: 0, scale: 0.5 }}
                  animate={reduced ? undefined : { opacity: 1, scale: 1 }}
                  transition={{ duration: DURATION.fast, delay: 0.55 + i * 0.07, ease: EASE_BACK }}
                  className={`w-8 h-8 rounded-full bg-linear-to-br ${avatar.gradient} border-2 border-white flex items-center justify-center text-white text-xs font-bold`}
                >
                  {avatar.initial}
                </motion.div>
              ))}
            </div>
            <div>
              <div className="flex gap-0.5 mb-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Loved by <span className="text-gray-800 font-semibold">500+ businesses</span>
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* id is the scroll target the walkthrough's "try the live agent" action
            hands off to, since this chat is the real streaming agent and the
            walkthrough is scripted. */}
        <motion.div
          id="hero-demo-chat"
          initial={reduced ? false : { opacity: 0, y: 28, scale: 0.97 }}
          animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: DURATION.slow, delay: 0.2, ease: EASE_OUT }}
          className="flex justify-center lg:justify-end mt-8 lg:mt-0 scroll-mt-28"
        >
          <DemoChat />
        </motion.div>
      </div>
    </section>
  )
}
