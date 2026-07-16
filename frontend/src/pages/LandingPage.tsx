import { useEffect, useRef, useState } from 'react'
import Navbar from '../components/landing/Navbar'
import HeroSection from '../components/landing/HeroSection'
import StatsBar from '../components/landing/StatsBar'
import FeaturesSection from '../components/landing/FeaturesSection'
import IntegrationsSection from '../components/landing/IntegrationsSection'
import HowItWorksSection from '../components/landing/HowItWorksSection'
import TestimonialsSection from '../components/landing/TestimonialsSection'
import CTASection from '../components/landing/CTASection'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'

const VOICE_AGENT_ID = 'b5b88f4b-3a4d-41cc-b590-9324655c341f'

export default function LandingPage() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const voiceWidgetInjected = useRef(false)

  useEffect(() => {
    if (!window.location.hash) return
    const id = window.location.hash.slice(1)
    const timeout = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
    return () => clearTimeout(timeout)
  }, [])

  useEffect(() => {
    if (voiceWidgetInjected.current) return
    voiceWidgetInjected.current = true

    const cdnUrl = import.meta.env.VITE_CDN_URL
    const widgetSrc = import.meta.env.DEV ? '/voice-widget.js' : `${cdnUrl}/voice-widget.js`
    const script = document.createElement('script')
    script.src = widgetSrc
    script.setAttribute('data-agent-id', VOICE_AGENT_ID)
    script.async = true
    document.body.appendChild(script)
  }, [])

  return (
    <div className="landing-page bg-white overflow-x-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />
      <HeroSection onOpenDemo={() => setIsDemoOpen(true)} />
      <StatsBar />
      <FeaturesSection />
      <IntegrationsSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <CTASection />
      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
