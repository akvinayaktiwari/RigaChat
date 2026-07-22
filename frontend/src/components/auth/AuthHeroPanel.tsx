import { CheckCircle } from 'lucide-react'
import VyostraLogo from '../VyostraLogo'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const PANEL_BACKGROUND = `
  radial-gradient(58% 55% at 12% 10%, rgba(168,85,247,.55), transparent 60%),
  radial-gradient(52% 60% at 88% 92%, rgba(99,102,241,.5), transparent 62%),
  radial-gradient(45% 45% at 70% 25%, rgba(124,58,237,.35), transparent 60%),
  linear-gradient(155deg,#2a1a4f 0%,#1b1030 55%,#140b24 100%)
`

export interface AuthHeroPanelProps {
  tagline: string
  features: string[]
  footnote?: string
}

function GlowLayer() {
  return (
    <div
      aria-hidden="true"
      className="absolute -inset-[20%] z-[-1] auth-hero-drift"
      style={{
        background: 'radial-gradient(45% 45% at 50% 50%, rgba(168,85,247,.5), transparent 70%)',
      }}
    />
  )
}

export default function AuthHeroPanel({ tagline, features, footnote }: AuthHeroPanelProps) {
  return (
    <>
      {/* Desktop hero panel — left column of the split, centered content */}
      <div
        className="hidden lg:flex relative flex-col items-center justify-center isolate overflow-hidden w-full h-full p-11 text-white text-center"
        style={{ background: PANEL_BACKGROUND }}
      >
        <GlowLayer />
        <div className="mb-6">
          <VyostraLogo size={56} variant="white" animate />
        </div>
        <span className="text-4xl font-extrabold text-white" style={JAKARTA_FONT}>
          VyostraAI
        </span>
        <p className="text-white/70 text-lg mt-3 mb-10">{tagline}</p>

        <div className="flex flex-col items-center">
          {features.map((feature) => (
            <div
              key={feature}
              className="bg-white/10 border border-white/20 text-white text-sm px-5 py-2.5 rounded-full mb-3 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4 text-white" />
              {feature}
            </div>
          ))}
        </div>

        {footnote && <p className="mt-12 text-white/40 text-xs">{footnote}</p>}
      </div>

      {/* Mobile compact header band — centered, sits above the form */}
      <div
        className="flex lg:hidden relative flex-col items-center justify-center isolate overflow-hidden p-6 text-white text-center"
        style={{ background: PANEL_BACKGROUND }}
      >
        <GlowLayer />
        <div className="mb-3">
          <VyostraLogo size={32} variant="white" animate />
        </div>
        <span className="text-xl font-extrabold text-white" style={JAKARTA_FONT}>
          VyostraAI
        </span>
        <p className="text-white/70 text-sm mt-1.5">{tagline}</p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
          {features.map((feature) => (
            <div
              key={feature}
              className="bg-white/10 border border-white/20 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1.5"
            >
              <CheckCircle className="w-3.5 h-3.5 text-white" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes auth-hero-drift {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(5%, -5%); }
        }
        .auth-hero-drift {
          animation: auth-hero-drift 14s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-hero-drift {
            animation: none !important;
          }
        }
      `}</style>
    </>
  )
}
