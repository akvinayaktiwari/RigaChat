import { Activity, CheckCircle, Clock, Mic, Route, type LucideIcon } from 'lucide-react'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface Pillar {
  icon: LucideIcon
  title: string
  tag: string
  tagClasses: string
  iconBg: string
  iconColor: string
  role: string
  description: string
  elevated?: boolean
}

const PILLARS: Pillar[] = [
  {
    icon: Mic,
    title: 'Agents',
    tag: 'AI',
    tagClasses: 'bg-violet-500/15 text-violet-300 border border-violet-400/30',
    iconBg: 'bg-violet-500/20',
    iconColor: 'text-violet-300',
    role: 'The voices of your business.',
    description:
      'AI that talks — on your site, over voice, on WhatsApp. Trained on your knowledge base, always on brand.',
  },
  {
    icon: Clock,
    title: 'Schedulers',
    tag: 'Automation',
    tagClasses: 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/30',
    iconBg: 'bg-cyan-500/20',
    iconColor: 'text-cyan-300',
    role: 'The hands that never forget.',
    description:
      'Simple timed actions — book a slot, send a WhatsApp template, fire an email. No AI, just dependable follow-through.',
  },
  {
    icon: Route,
    title: 'Journeys',
    tag: 'The payoff',
    tagClasses: 'bg-gradient-to-r from-violet-500/25 to-cyan-500/20 text-violet-100 border border-violet-400/30',
    iconBg: 'bg-gradient-to-br from-violet-500/30 to-cyan-500/20',
    iconColor: 'text-violet-200',
    role: 'Where it all comes together.',
    description:
      'A visual timeline that connects your agents and schedulers. Describe the flow in plain words — then watch it run itself.',
    elevated: true,
  },
]

type NodeKind = 'scheduler' | 'when' | 'agent' | 'if'

interface TimelineNode {
  kind: NodeKind
  label: string
  title: string
  timing: string
}

const TIMELINE_NODES: TimelineNode[] = [
  { kind: 'scheduler', label: 'Scheduler', title: 'Visit booked', timing: 'via Calendly' },
  { kind: 'scheduler', label: 'Scheduler', title: 'Reminder sent', timing: '1 day before' },
  { kind: 'when', label: 'When', title: 'Visit completed', timing: 'status changes' },
  { kind: 'agent', label: 'Agent', title: 'WhatsApp follow-up', timing: 'within the hour' },
  { kind: 'if', label: 'If', title: 'No reply', timing: 'for 3 days' },
  { kind: 'agent', label: 'Voice agent', title: 'Nurture call', timing: 'auto-dialed' },
]

const KIND_STYLES: Record<NodeKind, { border: string; labelColor: string }> = {
  scheduler: { border: 'border-cyan-400/40', labelColor: 'text-cyan-300' },
  agent: { border: 'border-violet-400/40', labelColor: 'text-violet-300' },
  when: { border: 'border-dashed border-white/25', labelColor: 'text-white/50' },
  if: { border: 'border-dashed border-white/25', labelColor: 'text-white/50' },
}

function TimelineNodeCard({ node }: { node: TimelineNode }) {
  const style = KIND_STYLES[node.kind]
  return (
    <div className={`w-40 shrink-0 rounded-xl border bg-white/[0.03] p-3.5 ${style.border}`}>
      <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${style.labelColor}`}>{node.label}</p>
      <p className="mb-1 text-sm font-semibold text-white">{node.title}</p>
      <p className="text-xs text-white/40">{node.timing}</p>
    </div>
  )
}

export default function RoadmapSection() {
  return (
    <section className="relative overflow-hidden bg-[#0d0d18] px-4 py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-violet-600/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-24 h-[380px] w-[380px] rounded-full bg-cyan-400/15 blur-3xl"
      />
      <div aria-hidden="true" className="roadmap-dot-grid pointer-events-none absolute inset-0" />

      <div className="relative max-w-6xl mx-auto">
        <div className="max-w-2xl mx-auto text-center mb-12 sm:mb-14">
          <div className="flex items-center justify-center gap-3 mb-4">
            <p className="text-sm font-semibold text-violet-400 uppercase tracking-widest">The next chapter</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse motion-reduce:animate-none" />
              In development
            </span>
          </div>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4"
            style={JAKARTA_FONT}
          >
            From single agents to{' '}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">
              self-running journeys
            </span>
            .
          </h2>
          <p className="text-white/60 text-lg leading-relaxed">
            Today VyostraAI answers and captures. Next, it acts on its own — three building blocks you assemble once,
            then let run.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon
            return (
              <div
                key={pillar.title}
                className={`relative rounded-2xl border p-6 backdrop-blur-xl transition-all duration-300 ${
                  pillar.elevated
                    ? 'border-violet-400/50 bg-white/[0.06]'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/20'
                }`}
              >
                {pillar.elevated && (
                  <div
                    aria-hidden="true"
                    className="roadmap-journeys-glow pointer-events-none absolute -inset-px rounded-2xl"
                    style={{ boxShadow: '0 0 50px 6px rgba(124, 58, 237, 0.45)' }}
                  />
                )}
                <div className="relative">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${pillar.iconBg}`}
                  >
                    <Icon className={`w-5 h-5 ${pillar.iconColor}`} />
                  </div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <h3 className="text-lg font-bold text-white" style={JAKARTA_FONT}>
                      {pillar.title}
                    </h3>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${pillar.tagClasses}`}>
                      {pillar.tag}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white/70 mb-2">{pillar.role}</p>
                  <p className="text-sm text-white/50 leading-relaxed">{pillar.description}</p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-8 rounded-3xl border border-violet-400/20 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-violet-300" />
              <h3 className="text-xl font-bold text-white" style={JAKARTA_FONT}>
                A journey, drawn once
              </h3>
            </div>
            <div className="flex items-center gap-4 text-xs text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-400" />
                AI agent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                Automation
              </span>
            </div>
          </div>
          <p className="text-sm text-white/50 mb-6">
            Example: a real-estate site visit, from booking to follow-up — no one lifting a finger.
          </p>

          <div className="overflow-x-auto pb-2">
            <div className="relative flex items-center gap-3 w-max">
              <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
              <div className="roadmap-spark pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-violet-300 shadow-[0_0_8px_2px_rgba(196,181,253,0.8)]" />
              {TIMELINE_NODES.map((node, i) => (
                <div key={node.title} className="relative flex items-center gap-3 shrink-0">
                  <TimelineNodeCard node={node} />
                  {i < TIMELINE_NODES.length - 1 && (
                    <div className="h-px w-6 shrink-0 bg-gradient-to-r from-violet-400/60 to-cyan-400/60" />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/50 mt-6">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            Built from templates for real estate, clinics, coaching and more — customize, don&apos;t start blank.
          </div>
        </div>
      </div>
    </section>
  )
}
