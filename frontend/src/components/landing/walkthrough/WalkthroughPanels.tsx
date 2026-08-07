import { motion } from 'motion/react'
import {
  Bot,
  Database,
  Route,
  CalendarCheck,
  Check,
  Clock,
  UserRound,
  RefreshCw,
  MessageSquare,
  ArrowRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { JourneyBeatKind, VerticalScript } from './walkthrough-content'
import { revealCount } from './walkthrough-content'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface PanelProps {
  script: VerticalScript
  localTick: number
}

// Chapter 1. Deliberately static and first: a visitor who leaves six seconds in
// should still have seen the entire scope, which is the whole reason this
// walkthrough exists.
const SYSTEM_STEPS: { icon: LucideIcon; label: string }[] = [
  { icon: MessageSquare, label: 'A lead arrives' },
  { icon: Bot, label: 'Agent qualifies' },
  { icon: Database, label: 'Lands in CRM' },
  { icon: Route, label: 'Journey follows up' },
  { icon: CalendarCheck, label: 'Booked' },
]

export function SystemPanel({ script }: PanelProps) {
  return (
    <div className="flex flex-col justify-center h-full text-center px-2">
      <h4 className="text-xl font-bold text-white mb-2" style={JAKARTA_FONT}>
        One lead, all the way through
      </h4>
      <p className="text-xs text-outline-variant mb-7 max-w-md mx-auto leading-relaxed">
        Following a single {script.label.toLowerCase()} enquiry from {script.source.split('·')[0].trim()} to a booked
        slot. Every stage below is a shipped part of the platform.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-y-3">
        {SYSTEM_STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <div key={step.label} className="flex items-center">
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.14 }}
                className="flex flex-col items-center gap-1.5 w-[86px]"
              >
                <span className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-[10px] font-semibold text-white/80 leading-tight text-center">{step.label}</span>
              </motion.div>
              {/* Hidden while the row wraps -- a connector at a wrap boundary
                  points at nothing and reads as a mistake. */}
              {i < SYSTEM_STEPS.length - 1 && (
                <ArrowRight className="hidden lg:block w-3.5 h-3.5 text-outline-variant/60 shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function QualifyPanel({ script, localTick }: PanelProps) {
  const shown = revealCount(localTick, script.conversation.length, 20)

  return (
    <div className="h-full flex flex-col border border-outline/15 rounded-xl overflow-hidden bg-surface">
      <div className="bg-surface-container h-10 px-4 border-b border-outline-variant/30 flex items-center gap-2 shrink-0">
        <span className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Bot className="w-3 h-3" />
        </span>
        <span className="text-xs font-bold text-on-surface">{script.agentName}</span>
        <span className="ml-auto text-[10px] text-on-surface-variant">{script.source}</span>
      </div>

      <div className="flex-1 p-4 space-y-3 overflow-hidden">
        {script.conversation.slice(0, shown).map((message, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${message.from === 'lead' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[82%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                message.from === 'lead'
                  ? 'bg-primary text-white rounded-tr-none'
                  : 'bg-surface-container text-on-surface rounded-tl-none border border-outline-variant/30'
              }`}
            >
              {message.text}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export function CrmPanel({ script, localTick }: PanelProps) {
  const shown = revealCount(localTick, script.fields.length, 7, 4)
  const synced = localTick > 7 + script.fields.length * 7

  return (
    <div className="h-full flex flex-col justify-center px-2">
      <div className="rounded-xl border border-outline/15 bg-surface overflow-hidden">
        <div className="bg-surface-container px-4 py-2.5 border-b border-outline-variant/30 flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold text-on-surface">New lead in your CRM</span>
        </div>
        <div className="divide-y divide-outline-variant/20">
          {script.fields.slice(0, shown).map((field) => (
            <motion.div
              key={field.label}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-baseline gap-3 px-4 py-2.5"
            >
              <span className="text-[10px] uppercase tracking-wide text-on-surface-variant w-20 shrink-0">
                {field.label}
              </span>
              <span className="text-xs font-semibold text-on-surface">{field.value}</span>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="mt-3 min-h-[18px]">
        {synced && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5 shrink-0" />
            Saved with the full transcript, and pushed to Zoho if connected
          </motion.p>
        )}
      </div>
    </div>
  )
}

const BEAT_STYLES: Record<JourneyBeatKind, { icon: LucideIcon; color: string; ring: string }> = {
  agent: { icon: Bot, color: 'text-violet-300', ring: 'border-violet-400/40' },
  wait: { icon: Clock, color: 'text-cyan-300', ring: 'border-cyan-400/40' },
  check: { icon: RefreshCw, color: 'text-white/50', ring: 'border-dashed border-white/25' },
  human: { icon: UserRound, color: 'text-amber-300', ring: 'border-amber-400/40' },
  done: { icon: Check, color: 'text-emerald-300', ring: 'border-emerald-400/40' },
}

// A timeline, not a fake live conversation. This plays out over days on
// WhatsApp, so animating it as a real-time chat would be a fiction the rest of
// the page does not need.
export function JourneyPanel({ script, localTick }: PanelProps) {
  const shown = revealCount(localTick, script.journey.length, 12)

  return (
    <div className="h-full flex flex-col justify-center px-2">
      <p className="text-[11px] text-outline-variant mb-3">
        Published once, then it runs on its own. Reply STOP at any point and it ends there.
      </p>
      <div className="space-y-1.5">
        {script.journey.slice(0, shown).map((beat) => {
          const style = BEAT_STYLES[beat.kind]
          const Icon = style.icon
          return (
            <motion.div
              key={beat.text}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-3 rounded-lg border bg-white/[0.03] px-3 py-2 ${style.ring}`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${style.color}`} />
              <span className="text-xs text-white/90 flex-1 leading-snug">{beat.text}</span>
              <span className="text-[10px] text-white/40 shrink-0">{beat.when}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

interface BookedPanelProps extends PanelProps {
  onTryLiveAgent: () => void
}

export function BookedPanel({ script, onTryLiveAgent }: BookedPanelProps) {
  return (
    <div className="h-full flex flex-col justify-center items-center text-center px-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-5"
      >
        <span className="w-10 h-10 rounded-full bg-emerald-400/15 text-emerald-300 flex items-center justify-center mx-auto mb-3">
          <CalendarCheck className="w-5 h-5" />
        </span>
        <p className="text-sm font-bold text-white" style={JAKARTA_FONT}>
          {script.booking.title}
        </p>
        <p className="text-xs text-outline-variant mt-1">{script.booking.detail}</p>
      </motion.div>

      <p className="text-[11px] text-outline-variant mt-4 max-w-sm leading-relaxed">
        Booked through your connected Cal.com account and visible in your dashboard. If the lead had gone quiet instead,
        your team would have them in hand rather than a journey still chasing.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mt-6">
        <button
          onClick={onTryLiveAgent}
          className="px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-all"
          id="walkthrough-try-live-btn"
        >
          Try the live agent on this page
        </button>
        <a
          href="/contact"
          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-semibold rounded-lg transition-all"
          id="walkthrough-contact-btn"
        >
          Talk about your workflow
        </a>
      </div>
    </div>
  )
}
