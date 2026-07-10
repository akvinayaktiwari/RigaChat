import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'

export default function Testimonials() {
  const navigate = useNavigate()

  return (
    <section className="py-24 px-6 lg:px-8 bg-background" id="testimonials">
      <div className="max-w-7xl mx-auto">
        {/* Header Title */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight mb-4">
            What our early users are saying
          </h2>
          <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
            We are collecting testimonials from our first users. Want to be featured here?
          </p>
        </div>

        {/* Early Access CTA Card */}
        <motion.div
          whileHover={{ y: -6 }}
          className="landing-glass-card p-8 md:p-10 rounded-3xl border border-outline-variant/30 relative max-w-2xl mx-auto text-center"
          id="testimonial-early-access-cta"
        >
          <p className="text-xl md:text-2xl font-bold leading-relaxed text-on-background">
            🚀 Be an early BeepBoop user
          </p>
          <p className="text-on-surface-variant text-sm mt-2 max-w-lg mx-auto">
            Join businesses already using BeepBoop to capture leads, send WhatsApp alerts, and sync to their CRM
            automatically.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 mt-6">
            <button
              type="button"
              onClick={() => navigate('/signup')}
              className="cta-accent text-white hover:shadow-lg hover:-translate-y-0.5 font-semibold px-6 py-3 rounded-xl transition-all"
              id="testimonial-cta-primary"
            >
              Get Started Free
            </button>
            <a
              href="mailto:admin@drsyeta.in"
              className="border border-outline text-on-surface font-semibold px-6 py-3 rounded-xl hover:bg-surface-container transition-colors"
              id="testimonial-cta-secondary"
            >
              Book a Demo
            </a>
          </div>

          <div className="flex items-center justify-center gap-4 text-outline text-xs font-semibold uppercase tracking-widest mt-6">
            <span>Free to start</span>
            <span className="w-1.5 h-1.5 bg-outline rounded-full" />
            <span>No credit card required</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
