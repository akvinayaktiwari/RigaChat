import {
  MessageSquare,
  Mic,
  Send,
  Megaphone,
  FileText,
  Sparkles,
  Database,
  Route,
  CalendarCheck,
  ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

// Sits in the grid gap so the five cards read as one pipeline rather than five
// parallel features, which is the entire claim of this section. Horizontal on
// the desktop row, rotated to point down once the grid stacks.
function FlowArrow() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-1/2 -bottom-3.5 -translate-x-1/2 lg:left-auto lg:-right-3.5 lg:bottom-auto lg:top-1/2 lg:-translate-x-0 lg:-translate-y-1/2 z-10 text-gray-300"
    >
      <ChevronRight className="w-5 h-5 rotate-90 lg:rotate-0" />
    </span>
  )
}

// Every claim on this map is a shipped capability. The point of the section is
// that a visitor grasps the whole system in one glance without opening the demo
// modal, so if something here stops being true it has to change here first.
const SOURCES: { icon: LucideIcon; label: string }[] = [
  { icon: MessageSquare, label: 'Website chat' },
  { icon: Mic, label: 'Voice on page' },
  { icon: Send, label: 'WhatsApp' },
  { icon: Megaphone, label: 'Meta ads' },
  { icon: FileText, label: 'Forms' },
]

interface Stage {
  step: string
  icon: LucideIcon
  title: string
  body: string
  accent: string
  iconBg: string
}

const STAGES: Stage[] = [
  {
    step: '02',
    icon: Sparkles,
    title: 'Your agent qualifies them',
    body: 'Asks what they are after, their budget, and their contact details — in their words, not a form.',
    accent: 'text-violet-600',
    iconBg: 'bg-violet-100',
  },
  {
    step: '03',
    icon: Database,
    title: 'The lead lands in your CRM',
    body: 'Every field captured, with the full transcript and the page they came from. Syncs to Zoho.',
    accent: 'text-sky-600',
    iconBg: 'bg-sky-100',
  },
  {
    step: '04',
    icon: Route,
    title: 'A journey follows up',
    body: 'Messages them on WhatsApp, waits for a real reply, nudges once if they go quiet. Says STOP, it stops.',
    accent: 'text-fuchsia-600',
    iconBg: 'bg-fuchsia-100',
  },
  {
    step: '05',
    icon: CalendarCheck,
    title: 'They book, or you take over',
    body: 'A booked slot lands in your dashboard via Cal.com. If they stall, it hands to your team.',
    accent: 'text-emerald-600',
    iconBg: 'bg-emerald-100',
  },
]

export default function SystemMapSection() {
  return (
    <section id="how-a-lead-moves" className="py-20 px-4 bg-gray-50/60 border-y border-gray-100/80">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-violet-600 uppercase tracking-widest mb-3">The whole system</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight mb-4" style={JAKARTA_FONT}>
            What happens to a lead, <br className="hidden sm:block" />
            start to finish
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Not just a agent. Five stages, one platform, no Zapier in between.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="relative bg-white border border-black/5 rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-xs font-extrabold text-gray-300" style={JAKARTA_FONT}>
                01
              </span>
              <h3 className="font-bold text-gray-900 text-base" style={JAKARTA_FONT}>
                A lead arrives
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((source) => {
                const Icon = source.icon
                return (
                  <span
                    key={source.label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 border border-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                  >
                    <Icon className="w-3 h-3 shrink-0 text-gray-400" />
                    {source.label}
                  </span>
                )
              })}
            </div>
            <p className="text-gray-400 text-xs leading-relaxed mt-3">
              Five doors, one pipeline. They all end up in the same place.
            </p>
            <FlowArrow />
          </div>

          {STAGES.map((stage, i) => {
            const Icon = stage.icon
            return (
              <div key={stage.step} className="relative bg-white border border-black/5 rounded-2xl p-6 flex flex-col">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="text-xs font-extrabold text-gray-300" style={JAKARTA_FONT}>
                    {stage.step}
                  </span>
                  <span className={`w-7 h-7 ${stage.iconBg} rounded-lg flex items-center justify-center shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${stage.accent}`} />
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-base mb-2 leading-snug" style={JAKARTA_FONT}>
                  {stage.title}
                </h3>
                <p className="text-gray-500 text-xs leading-relaxed">{stage.body}</p>
                {i < STAGES.length - 1 && <FlowArrow />}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
