import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Bolt, PlayCircle, CheckCircle } from 'lucide-react'

interface HeroProps {
  onOpenDemo: () => void
}

export default function Hero({ onOpenDemo }: HeroProps) {
  const navigate = useNavigate()

  return (
    <header className="relative pt-36 pb-20 px-6 lg:px-8 overflow-hidden bg-background">
      {/* Decorative Blur Spheres */}
      <div className="absolute -top-20 -right-20 w-[400px] h-[400px] bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] bg-secondary/10 rounded-full blur-3xl" />

      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">
        {/* Left column - Info */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col gap-6"
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full w-fit">
            <Bolt className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">The Future of CRM</span>
          </div>

          {/* Heading */}
          <h1 className="text-5xl md:text-6xl font-extrabold text-on-background tracking-tight leading-[1.1]">
            The AI Agent that turns website visitors into{' '}
            <span className="text-primary bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              leads.
            </span>
          </h1>

          {/* Subtext */}
          <p className="text-lg md:text-xl text-on-surface-variant max-w-xl leading-relaxed">
            Deploy an intelligent chatbot on your website in minutes. Train it on your content. Capture leads
            directly into your built-in CRM.
          </p>

          {/* Call to Actions */}
          <div className="flex flex-wrap gap-4 mt-2">
            <button
              onClick={() => navigate('/signup')}
              className="cta-accent text-white font-bold text-base px-8 py-4.5 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
              id="hero-trial-btn"
            >
              Start 14-day free trial
            </button>
            <button
              onClick={onOpenDemo}
              className="bg-transparent border-2 border-primary text-primary font-bold text-base px-8 py-4.5 rounded-xl flex items-center justify-center gap-2 transition-all hover:bg-primary/5 cursor-pointer"
              id="hero-demo-btn"
            >
              <PlayCircle className="w-5.5 h-5.5" />
              Watch Demo
            </button>
          </div>

          {/* Benefits Bullet Points */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-outline text-sm mt-2">
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle className="w-4 h-4 text-green-500" /> No credit card required
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <CheckCircle className="w-4 h-4 text-green-500" /> Free setup assistance
            </span>
          </div>
        </motion.div>

        {/* Right column - Live Dashboard Graphic */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative"
        >
          {/* Frame decoration */}
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-2xl blur-xl" />

          {/* Glass browser mockup */}
          <div className="landing-glass-card rounded-2xl overflow-hidden shadow-2xl relative border border-outline-variant/40">
            {/* Browser top-bar */}
            <div className="bg-surface-container h-11 border-b border-outline-variant/30 flex items-center px-4 justify-between">
              <div className="flex gap-2">
                <div className="w-3.5 h-3.5 rounded-full bg-red-400/80 shadow-sm" />
                <div className="w-3.5 h-3.5 rounded-full bg-yellow-400/80 shadow-sm" />
                <div className="w-3.5 h-3.5 rounded-full bg-green-400/80 shadow-sm" />
              </div>
              <div className="bg-surface-container-low border border-outline-variant/30 text-[10px] text-outline px-10 py-1 rounded-md max-w-sm truncate text-center select-none">
                beepboop.drsyeta.in/dashboard
              </div>
              <div className="w-10" /> {/* Spacer */}
            </div>

            {/* Dashboard Screenshot */}
            <div className="aspect-[16/10] bg-surface-container-low flex items-center justify-center overflow-hidden">
              <img
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBytoeHN4d2bNdzlQWY-Lb6krYxyIRQIYNN1wKW14pZJV0zddSmibKZswdkRMDsVxS1Eys0_mWoVjv5gOsHVWAJbGac65mQWS2z5C-Adz_m8ZgmCWWd99G_MEcw_vqI07O6BDwqGrjPwi7iZRRb2z7RWtPEiBN4xWzgSsxLPJrfnxrjnZR-u5hbQMoUkJ7fL93wW5xdtY9L3C1QZTMifjrOBte3G6yAka206bnbKeJeFCn1ydXZSywt"
                alt="BeepBoop Intelligent Customer Operations Center Dashboard"
                className="w-full h-full object-cover select-none pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </header>
  )
}
