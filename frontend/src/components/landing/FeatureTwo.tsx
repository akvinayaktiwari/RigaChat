import { useState } from 'react'
import { motion } from 'motion/react'
import { Globe, BookOpen, CheckSquare } from 'lucide-react'

export default function FeatureTwo() {
  const [activeCard, setActiveCard] = useState<'crawler' | 'knowledge'>('crawler')

  return (
    <section className="py-24 px-6 lg:px-8 bg-surface-container-lowest" id="knowledge">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Left Column: Graphic Illustration */}
        <div className="flex justify-center relative">
          {/* Decorative circular element */}
          <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-primary/5 rounded-full blur-2xl" />

          {/* Floating Widget Mock */}
          <div className="absolute bottom-6 left-6 bg-surface-container-lowest p-4 rounded-xl shadow-xl border border-outline-variant/30 max-w-xs hidden sm:block z-10">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-1.5 bg-primary/10 text-primary rounded-lg">
                <BookOpen className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-on-surface">BeepBoop Knowledge Base</span>
            </div>
            <p className="text-[11px] text-on-surface-variant font-medium leading-normal">
              {activeCard === 'crawler'
                ? 'Just point BeepBoop at your URL and it learns your business automatically.'
                : 'Add manual entries for anything your website doesn’t cover.'}
            </p>
          </div>

          {/* Wrapper for hover Lift */}
          <motion.div
            whileHover={{ y: -8 }}
            transition={{ type: 'spring', stiffness: 100 }}
            className="rounded-3xl shadow-2xl overflow-hidden max-w-lg border border-outline-variant/20 relative"
            id="features-illustration-two"
          >
            <img
              src="https://lh3.googleusercontent.com/aida/AP1WRLu8KgdsGSzybP33OK1aY6CyS3L9yBDpJFAk7mNwIDH2UQqiOulflrTJSXjb1Qqh9z7sBvztPn-SojhoFBWJ9O59_tV6HGvPVQRY4OERykF_mpvGTQL-5VvmA8rXtsY2nxLLvu3viNZmoKt5FdaizXLqSNMHTUugQq9bK_cxEZB3iiyuBmsUAnp0lp1RbroZzChRqUh5AzIcP0kUM6RcLBYg_4thEt51BRhGVPpk7AM6NemUsB3oINVv4Ok"
              alt="High-fidelity preview of BeepBoop's knowledge base training UI."
              className="w-full h-auto object-cover select-none pointer-events-none"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        </div>

        {/* Right Column: Content Column */}
        <div className="flex flex-col gap-6">
          {/* Section tag */}
          <div className="inline-flex items-center gap-3 text-primary font-bold text-xs uppercase tracking-widest">
            <span className="w-10 h-[2px] bg-primary" />
            Knowledge Base &amp; AI
          </div>

          {/* Headline */}
          <h2 className="text-4xl md:text-5xl font-extrabold text-on-background tracking-tight">
            Train once. Answer everything.
          </h2>

          {/* Description */}
          <p className="text-lg text-on-surface-variant leading-relaxed">
            Point BeepBoop at your website and it learns your business automatically. Add custom knowledge for
            pricing, policies, and FAQs.
          </p>

          {/* Feature Grid Choices */}
          <div className="grid grid-cols-2 gap-4 mt-2">
            <button
              onClick={() => setActiveCard('crawler')}
              className={`flex flex-col gap-3 p-5 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                activeCard === 'crawler'
                  ? 'bg-white border-primary shadow-md scale-[1.02]'
                  : 'bg-surface-container-low border-transparent hover:bg-surface-container'
              }`}
              id="feature-card-crawler"
            >
              <Globe className={`w-8 h-8 ${activeCard === 'crawler' ? 'text-primary' : 'text-outline'}`} />
              <div>
                <p className="font-bold text-on-surface">Website Crawler</p>
                <p className="text-xs text-on-surface-variant mt-1">Automatically indexes every page of your site.</p>
              </div>
            </button>

            <button
              onClick={() => setActiveCard('knowledge')}
              className={`flex flex-col gap-3 p-5 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                activeCard === 'knowledge'
                  ? 'bg-white border-primary shadow-md scale-[1.02]'
                  : 'bg-surface-container-low border-transparent hover:bg-surface-container'
              }`}
              id="feature-card-knowledge"
            >
              <BookOpen className={`w-8 h-8 ${activeCard === 'knowledge' ? 'text-primary' : 'text-outline'}`} />
              <div>
                <p className="font-bold text-on-surface">Custom Knowledge</p>
                <p className="text-xs text-on-surface-variant mt-1">Add FAQs, pricing, and policies by hand.</p>
              </div>
            </button>
          </div>

          {/* Improvement Card */}
          <div className="bg-surface-container-high/50 p-6 rounded-2xl border-l-4 border-primary mt-4 shadow-sm relative overflow-hidden">
            <div className="absolute right-4 top-4 opacity-5 text-primary">
              <CheckSquare className="w-24 h-24" />
            </div>
            <motion.p
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              key={activeCard}
              className="text-4xl font-black text-primary leading-none"
            >
              {activeCard === 'crawler' ? '100%' : '24/7'}
            </motion.p>
            <p className="text-[11px] font-bold text-on-surface-variant mt-2 uppercase tracking-wider">
              {activeCard === 'crawler' ? 'Of your site content indexed automatically' : 'Accurate answers, day or night'}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
