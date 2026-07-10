import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/landing/Navbar'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

export default function About() {
  const navigate = useNavigate()
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Hero */}
          <div className="text-center mb-20">
            <h1 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight mb-4">
              Built to help businesses never miss a lead
            </h1>
            <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
              BeepBoop is an AI-powered lead generation platform built by Drsyeta Corp, Bangalore.
            </p>
          </div>

          {/* Mission */}
          <section className="mb-16">
            <h2 className="text-2xl font-bold text-on-surface mb-4">Our Mission</h2>
            <p className="text-lg text-on-surface-variant leading-relaxed">
              Every business deserves to capture every lead. We built BeepBoop because we saw too many businesses
              losing leads to slow response times, missed form submissions, and disconnected tools. BeepBoop fixes
              that with AI, WhatsApp automation, and CRM sync — all in one platform.
            </p>
          </section>

          {/* Built by */}
          <section className="mb-20 bg-surface-container-low/60 rounded-2xl border border-outline-variant/30 p-8">
            <h2 className="text-2xl font-bold text-on-surface mb-4">Built by Drsyeta Corp</h2>
            <p className="text-lg text-on-surface-variant leading-relaxed mb-4">
              Drsyeta Corp is a performance marketing and technology company based in Bangalore, India. We build
              tools that help businesses grow faster.
            </p>
            <a href="mailto:admin@drsyeta.in" className="text-primary font-semibold hover:underline">
              admin@drsyeta.in
            </a>
          </section>

          {/* CTA */}
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-extrabold text-on-background tracking-tight mb-6">
              Start capturing leads today
            </h2>
            <button
              onClick={() => navigate('/signup')}
              className="cta-accent text-white font-bold text-base px-8 py-4.5 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
