import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { bootedFromPrerender } from '../../lib/prerender-boot'
import { ArrowRight, ChevronRight } from 'lucide-react'
import AuroraCanvas from './AuroraCanvas'
import DemoChat from './DemoChat'
import { DURATION, EASE_OUT, EASE_BACK, useStaticMotion } from './motion-primitives'

interface HeroSectionProps {
  onOpenDemo: () => void
}

/** The channels an agent answers on, which is a fact about the build. */
const CHANNEL_CHIPS = ['Website chat', 'Voice', 'WhatsApp', 'Built-in lead CRM']

export default function HeroSection({ onOpenDemo }: HeroSectionProps) {
  const navigate = useNavigate()
  // Also static when this page booted from prerendered HTML: the hero was
  // already on screen, and replaying its entrance would blink it out and back.
  const reduced = useStaticMotion() || bootedFromPrerender()

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
      {/* One canvas replaces the four blur-3xl orbs and the static grid that
          used to live here. Not an addition: four large blurred layers each got
          their own promoted compositor layer, so the swap is close to cost
          neutral, and the hero's motion budget only has room for one ambient
          loop. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <AuroraCanvas />
      </div>

      <div className="relative max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <motion.div {...container}>
          <motion.div
            {...item}
            className="inline-flex items-center gap-2 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-semibold px-3.5 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-violet-500 rounded-full inline-block" />
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

          {/* A row of stars over invented initials claimed reviews and customers
              that do not exist -- structured-data.ts deliberately publishes no
              aggregateRating for the same reason. What replaces it is checkable:
              these are the channels the product answers on. */}
          <motion.div {...item} className="flex flex-wrap items-center gap-2">
            {CHANNEL_CHIPS.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-semibold text-gray-600"
              >
                {chip}
              </span>
            ))}
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
