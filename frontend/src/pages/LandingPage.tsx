import { useState } from 'react'
import Navbar from '../components/landing/Navbar'
import Hero from '../components/landing/Hero'
import SocialProof from '../components/landing/SocialProof'
import FeatureOne from '../components/landing/FeatureOne'
import FeatureTwo from '../components/landing/FeatureTwo'
import Testimonials from '../components/landing/Testimonials'
import Pricing from '../components/landing/Pricing'
import FinalCTA from '../components/landing/FinalCTA'
import Footer from '../components/landing/Footer'
import ChatWidget from '../components/landing/ChatWidget'
import DemoModal from '../components/landing/modals/DemoModal'

export default function LandingPage() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />
      <Hero onOpenDemo={() => setIsDemoOpen(true)} />
      <SocialProof />
      <FeatureOne />
      <FeatureTwo />
      <Testimonials />
      <Pricing />
      <FinalCTA />
      <Footer />
      <ChatWidget />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
