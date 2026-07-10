import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import DemoModal from './modals/DemoModal'

interface HowItWorksStep {
  number: string
  title: string
  body: string
  icon: ReactNode
}

interface Benefit {
  icon: ReactNode
  title: string
  body: string
}

interface Integration {
  icon: ReactNode
  title: string
  href: string
}

interface UseCaseLayoutProps {
  badge: string
  headline: string
  subheadline: string
  heroVisual: ReactNode
  howItWorksSteps: HowItWorksStep[]
  benefits: Benefit[]
  integrations: Integration[]
  ctaHeadline: string
  ctaBody: string
}

function HeroSection({ badge, headline, subheadline, heroVisual }: Pick<UseCaseLayoutProps, 'badge' | 'headline' | 'subheadline' | 'heroVisual'>) {
  const navigate = useNavigate()
  return (
    <section className="relative py-16 md:py-24 bg-gradient-to-br from-surface-container-high/60 via-surface to-background border-b border-outline-variant/30 rounded-3xl mb-16 overflow-hidden px-6 md:px-12">
      <div className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div>
          <span className="inline-flex items-center bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-4">
            {badge}
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-tight bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            {headline}
          </h1>
          <p className="mt-4 text-base md:text-lg text-on-surface-variant leading-relaxed max-w-xl">{subheadline}</p>
          <button
            onClick={() => navigate('/signup')}
            className="mt-8 bg-primary text-white font-bold text-base px-8 py-4 rounded-2xl hover:scale-[1.02] transition-all cursor-pointer"
            id="use-case-hero-cta"
          >
            Get Started Free
          </button>
        </div>
        <div className="flex justify-center md:justify-end">{heroVisual}</div>
      </div>
    </section>
  )
}

function StepCard({ step }: { step: HowItWorksStep }) {
  return (
    <div className="relative bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs">
      <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-black text-lg mb-4 relative z-10">
        {step.number}
      </div>
      <div className="text-primary mb-3">{step.icon}</div>
      <h3 className="font-bold text-on-surface text-base mb-2">{step.title}</h3>
      <p className="text-sm text-on-surface-variant leading-relaxed">{step.body}</p>
    </div>
  )
}

function HowItWorksSection({ steps }: { steps: HowItWorksStep[] }) {
  return (
    <section className="max-w-7xl mx-auto mb-20">
      <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight text-center mb-12">How It Works</h2>
      <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="hidden md:block absolute top-6 left-[16.66%] right-[16.66%] border-t-2 border-dashed border-outline-variant -z-0" />
        {steps.map((step) => (
          <StepCard key={step.number} step={step} />
        ))}
      </div>
    </section>
  )
}

function BenefitCard({ benefit }: { benefit: Benefit }) {
  return (
    <div className="bg-white border border-outline-variant/30 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all">
      <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4">{benefit.icon}</div>
      <h3 className="font-bold text-on-surface text-base mb-2">{benefit.title}</h3>
      <p className="text-sm text-on-surface-variant leading-relaxed">{benefit.body}</p>
    </div>
  )
}

function BenefitsSection({ benefits }: { benefits: Benefit[] }) {
  return (
    <section className="max-w-7xl mx-auto mb-20">
      <h2 className="text-3xl md:text-4xl font-extrabold text-on-surface tracking-tight text-center mb-12">Why It Works</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {benefits.map((benefit) => (
          <BenefitCard key={benefit.title} benefit={benefit} />
        ))}
      </div>
    </section>
  )
}

function IntegrationsSection({ integrations }: { integrations: Integration[] }) {
  return (
    <section className="max-w-7xl mx-auto mb-20 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-6">Works seamlessly with</p>
      <div className="flex flex-wrap justify-center gap-4">
        {integrations.map((integration) => (
          <a
            key={integration.title}
            href={integration.href}
            className="inline-flex items-center gap-2 bg-surface-container-low border border-outline-variant rounded-full px-4 py-2 text-sm font-semibold text-on-surface hover:border-primary hover:text-primary transition-colors"
          >
            <span className="text-primary">{integration.icon}</span>
            {integration.title}
          </a>
        ))}
      </div>
    </section>
  )
}

function CtaSection({ ctaHeadline, ctaBody }: Pick<UseCaseLayoutProps, 'ctaHeadline' | 'ctaBody'>) {
  const navigate = useNavigate()
  return (
    <section className="max-w-7xl mx-auto bg-on-surface rounded-3xl p-12 text-center text-white">
      <h2 className="text-2xl md:text-3xl font-extrabold mb-4">{ctaHeadline}</h2>
      <p className="text-white/80 max-w-xl mx-auto mb-8 leading-relaxed">{ctaBody}</p>
      <div className="flex flex-wrap justify-center gap-4">
        <button
          onClick={() => navigate('/signup')}
          className="bg-primary text-white px-8 py-4 rounded-xl font-bold hover:opacity-95 transition-all cursor-pointer"
          id="use-case-cta-signup"
        >
          Get Started Free
        </button>
        <a
          href="mailto:admin@drsyeta.in"
          className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-8 py-4 rounded-xl font-bold transition-all"
          id="use-case-cta-demo"
        >
          Book a Demo
        </a>
      </div>
    </section>
  )
}

export default function UseCaseLayout(props: UseCaseLayoutProps) {
  const [isDemoOpen, setIsDemoOpen] = useState(false)

  return (
    <div className="landing-page bg-background">
      <Navbar onOpenDemo={() => setIsDemoOpen(true)} />

      <main className="pt-36 pb-24 px-6 lg:px-8">
        <HeroSection badge={props.badge} headline={props.headline} subheadline={props.subheadline} heroVisual={props.heroVisual} />
        <HowItWorksSection steps={props.howItWorksSteps} />
        <BenefitsSection benefits={props.benefits} />
        <IntegrationsSection integrations={props.integrations} />
        <CtaSection ctaHeadline={props.ctaHeadline} ctaBody={props.ctaBody} />
      </main>

      <Footer />
      <DemoModal isOpen={isDemoOpen} onClose={() => setIsDemoOpen(false)} />
    </div>
  )
}
