import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import Navbar from '../components/landing/Navbar'
import HeroSection from '../components/landing/HeroSection'
import StatsBar from '../components/landing/StatsBar'
import FeaturesSection from '../components/landing/FeaturesSection'
import IntegrationsSection from '../components/landing/IntegrationsSection'
import RoadmapSection from '../components/landing/RoadmapSection'
import HowItWorksSection from '../components/landing/HowItWorksSection'
import TestimonialsSection from '../components/landing/TestimonialsSection'
import PricingSection from '../components/landing/PricingSection'
import CTASection from '../components/landing/CTASection'
import Footer from '../components/landing/Footer'
import DemoModal from '../components/landing/modals/DemoModal'
import QuickSignupModal from '../components/auth/QuickSignupModal'
import { useAuth } from '../hooks/useAuth'
import type { AuthUser } from '../hooks/useAuth'
import { useTierCheckout } from '../hooks/useTierCheckout'
import type { BillableTier } from '../lib/pricingTiers'

const VOICE_AGENT_ID = 'b5b88f4b-3a4d-41cc-b590-9324655c341f'
const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

type SignupModalRequest = { mode: 'trial' } | { mode: 'checkout'; tier: BillableTier }

export default function LandingPage() {
  const [isDemoOpen, setIsDemoOpen] = useState(false)
  const [signupModal, setSignupModal] = useState<SignupModalRequest | null>(null)
  const voiceWidgetInjected = useRef(false)
  const { isAuthenticated, setSession } = useAuth()

  const tierCheckout = useTierCheckout(() => {
    setTimeout(() => {
      window.location.href = '/dashboard'
    }, 1500)
  })

  function handleStartTrial() {
    // Already-authenticated visitors skip signup entirely — there's no
    // trial to (re-)create for an existing session, just get them to the
    // dashboard they already have.
    if (isAuthenticated) {
      window.location.href = '/dashboard'
      return
    }
    setSignupModal({ mode: 'trial' })
  }

  function handleSelectTier(tier: BillableTier) {
    // Already-authenticated visitors skip signup entirely and go straight to
    // the billing call — the modal is only for turning an anonymous visitor
    // into an authenticated one.
    if (isAuthenticated) {
      tierCheckout.selectTier(tier)
      return
    }
    setSignupModal({ mode: 'checkout', tier })
  }

  function handleSignupSuccess(token: string, user: AuthUser) {
    setSession(token, user)
    const pending = signupModal
    setSignupModal(null)

    if (pending?.mode === 'checkout') {
      tierCheckout.selectTier(pending.tier)
    } else {
      window.location.href = '/dashboard'
    }
  }

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
      <RoadmapSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <PricingSection onSelectTier={handleSelectTier} />
      <CTASection onStartTrial={handleStartTrial} />
      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
      <QuickSignupModal
        isOpen={signupModal !== null}
        onClose={() => setSignupModal(null)}
        onSuccess={handleSignupSuccess}
        mode={signupModal?.mode ?? 'trial'}
        suggestedTier={signupModal?.mode === 'checkout' ? signupModal.tier : undefined}
      />

      {tierCheckout.stage !== 'idle' && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-2xl shadow-2xl shadow-black/10 border border-gray-100 p-5">
          {tierCheckout.stage === 'polling' && (
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="text-violet-500 animate-spin shrink-0" />
              <div>
                <p className="font-semibold text-sm text-gray-900" style={JAKARTA_FONT}>
                  Confirming your payment...
                </p>
                <p className="text-xs text-gray-500 mt-0.5">This usually takes a few seconds.</p>
              </div>
            </div>
          )}
          {tierCheckout.stage === 'success' && (
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-gray-900" style={JAKARTA_FONT}>
                  You&apos;re all set!
                </p>
                <p className="text-xs text-gray-500 mt-0.5">Redirecting to your dashboard...</p>
              </div>
            </div>
          )}
          {tierCheckout.stage === 'timeout' && (
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-gray-900" style={JAKARTA_FONT}>
                  Payment received
                </p>
                <p className="text-xs text-gray-500 mt-0.5">This can take a minute to reflect — refresh shortly.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {tierCheckout.errorMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-amber-50 border border-amber-200 rounded-2xl shadow-lg p-4 text-sm text-amber-700 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {tierCheckout.errorMessage}
        </div>
      )}
    </div>
  )
}
