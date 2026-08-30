import { motion, useReducedMotion } from 'motion/react'
import { Reveal, RevealGroup, RevealItem, DURATION, EASE_OUT } from './motion-primitives'

const STEPS = [
  {
    step: '01',
    title: 'Create your bot',
    description:
      'Add your website URL. Our AI crawler visits every page, extracts content, and builds your AI agent’s knowledge base in minutes.',
  },
  {
    step: '02',
    title: 'Configure & embed',
    description:
      'Customize your AI agent’s appearance, set up lead capture fields, and embed with one line of code. Connect WhatsApp or your CRM in one click.',
  },
  {
    step: '03',
    title: 'Go live and let it follow up',
    description:
      'Your AI agent answers questions 24/7 and syncs every lead to your CRM in real time — then a journey takes over, following up on WhatsApp until they book or your team steps in.',
  },
]

export default function HowItWorksSection() {
  const reduced = useReducedMotion()

  return (
    <section id="how-it-works" className="py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <Reveal className="text-center mb-16">
          <p className="text-sm font-semibold text-violet-600 uppercase tracking-widest mb-3">How it works</p>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            From zero to live <br className="hidden sm:block" />
            in three steps
          </h2>
        </Reveal>

        <RevealGroup className="grid grid-cols-1 md:grid-cols-3 gap-8 relative" stagger={0.12}>
          {/* The connector draws itself left-to-right as the steps land, so the
              line reads as the path between them rather than as a static rule
              that happened to be there first. */}
          <motion.div
            aria-hidden="true"
            className="hidden md:block absolute top-10 left-1/3 right-1/3 h-px bg-linear-to-r from-transparent via-violet-300 to-transparent origin-left"
            initial={reduced ? false : { scaleX: 0, opacity: 0 }}
            whileInView={reduced ? undefined : { scaleX: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: DURATION.slow, delay: 0.25, ease: EASE_OUT }}
          />

          {STEPS.map((item, i) => (
            <RevealItem key={item.step} className="relative">
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-violet-600 to-purple-500 flex items-center justify-center mb-5 shadow-lg shadow-violet-200/60 ring-4 ring-white">
                <span
                  className="text-white font-extrabold text-sm"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {item.step}
                </span>
              </div>

              <h3
                className="font-bold text-gray-900 text-xl mb-3"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                {item.title}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>

              {i < STEPS.length - 1 && (
                <div className="md:hidden flex items-center justify-center py-4">
                  <div className="w-px h-8 bg-violet-200" />
                </div>
              )}
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  )
}
