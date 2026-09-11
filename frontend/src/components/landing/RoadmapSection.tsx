import { useEffect, useRef, useState } from 'react'
import { Activity, CheckCircle, Clock, Mic, Route, type LucideIcon } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { Reveal, RevealGroup, RevealItem } from './motion-primitives'

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
      'Timed actions that need no AI — lead reminders and weekly reports, on a repeating interval or a one-off date.',
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
      'A step list that wires your agents and schedulers together — it sends, waits for the actual reply, branches on what happens, and knows when to stop.',
    elevated: true,
  },
]

type NodeKind = 'agent' | 'await' | 'check' | 'human'

interface TimelineNode {
  kind: NodeKind
  label: string
  title: string
  timing: string
}

// This mirrors the shipped real-estate template step for step
// (backend/src/lib/journey-templates/real-estate-lead-qualification.ts). If that
// template changes, change this too — it is the one place the marketing site
// claims something concrete about what a journey actually does.
const TIMELINE_NODES: TimelineNode[] = [
  { kind: 'agent', label: 'Agent', title: 'Greets the new lead', timing: 'on WhatsApp, at once' },
  { kind: 'await', label: 'Waits', title: 'For budget and area', timing: 'up to 24 hours' },
  { kind: 'agent', label: 'Agent', title: 'Offers a site visit', timing: 'once they answer' },
  { kind: 'await', label: 'Waits', title: 'For a day that suits them', timing: 'up to 24 hours' },
  { kind: 'agent', label: 'Agent', title: 'Nudges once if quiet', timing: 'exactly once' },
  { kind: 'check', label: 'Checks', title: 'Visit booked yet?', timing: 'daily, 3 times' },
  { kind: 'human', label: 'Hands off', title: 'Over to your team', timing: 'instead of nagging' },
]

const KIND_STYLES: Record<NodeKind, { border: string; labelColor: string; glow: string }> = {
  agent: { border: 'border-violet-400/40', labelColor: 'text-violet-300', glow: 'shadow-[0_0_0_1px_rgba(167,139,250,0.5),0_0_24px_-4px_rgba(167,139,250,0.55)]' },
  await: { border: 'border-cyan-400/40', labelColor: 'text-cyan-300', glow: 'shadow-[0_0_0_1px_rgba(34,211,238,0.5),0_0_24px_-4px_rgba(34,211,238,0.55)]' },
  check: { border: 'border-dashed border-white/25', labelColor: 'text-white/50', glow: 'shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_0_24px_-4px_rgba(255,255,255,0.35)]' },
  human: { border: 'border-emerald-400/40', labelColor: 'text-emerald-300', glow: 'shadow-[0_0_0_1px_rgba(52,211,153,0.5),0_0_24px_-4px_rgba(52,211,153,0.55)]' },
}

/** How long each step holds before the journey advances to the next one. */
const STEP_MS = 1900

/** The beat at the end of a run, before it starts over. */
const LOOP_PAUSE_MS = 2600

type StepState = 'done' | 'active' | 'pending'

/**
 * Plays the journey through, once per loop, so the diagram does the thing the
 * section claims: assembled once, then left running.
 *
 * Playback yields to the reader rather than competing with them. Pointing at a
 * step holds it; clicking one pins it until clicked again. Either way the timer
 * stops, because a diagram that keeps marching while someone is reading one
 * card is just taking the card away from them.
 */
function useJourneyPlayback(count: number, reduced: boolean) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(reduced ? count - 1 : -1)
  const [onScreen, setOnScreen] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)

  // The step being presented. A pin outranks a hover, and either outranks the
  // timer -- the reader's attention always wins over the animation's.
  const focused = pinned ?? hovered ?? active

  // Watching is split from advancing so that pausing for a hover does not tear
  // down the observer, and re-entering the section is the ONLY thing that
  // rewinds to the start.
  useEffect(() => {
    const track = trackRef.current
    if (!track || reduced) return

    const observer = new IntersectionObserver(
      (entries) => setOnScreen(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.35 },
    )
    observer.observe(track)

    return () => observer.disconnect()
  }, [reduced])

  useEffect(() => {
    if (reduced || !onScreen) return
    // Someone scrolling back to this section sees the journey from the
    // beginning rather than wherever the last run left off.
    setActive(-1)
  }, [reduced, onScreen])

  useEffect(() => {
    const held = pinned !== null || hovered !== null
    if (reduced || !onScreen || held) return

    let timer: number | undefined

    const advance = () => {
      setActive((current) => {
        const next = current + 1
        timer = window.setTimeout(advance, next < count ? STEP_MS : LOOP_PAUSE_MS)
        return next < count ? next : -1
      })
    }

    timer = window.setTimeout(advance, 600)

    return () => window.clearTimeout(timer)
  }, [count, reduced, onScreen, hovered, pinned])

  // Retract each edge fade when the track is against that end. Without this
  // the right-hand fade dims the handoff card exactly when playback scrolls it
  // into view, which is the one moment this section needs to land cleanly.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const sync = () => {
      const remaining = track.scrollWidth - track.clientWidth - track.scrollLeft
      track.style.setProperty('--fade-left', track.scrollLeft > 4 ? '28px' : '0px')
      track.style.setProperty('--fade-right', remaining > 4 ? '44px' : '0px')
    }

    sync()
    track.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)

    return () => {
      track.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  // Keep the focused card in view. scrollTo on the track itself, never
  // scrollIntoView -- that would scroll the page as well as the strip. Hover is
  // excluded: the reader is already pointing at that card, so moving it would
  // pull it out from under the cursor.
  useEffect(() => {
    const track = trackRef.current
    const target = pinned ?? active
    if (!track || target < 0 || reduced) return

    const card = track.children[target]
    if (!(card instanceof HTMLElement)) return

    const left = Math.max(0, card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2)

    // Feature-detected rather than assumed. Element.scrollTo is missing in a
    // few environments, and an unguarded call throws during a passive effect,
    // which unmounts the entire section -- a blank panel where the diagram was,
    // over a decorative scroll nobody would miss.
    if (typeof track.scrollTo === 'function') {
      track.scrollTo({ left, behavior: 'smooth' })
    } else {
      track.scrollLeft = left
    }
  }, [active, pinned, reduced])

  return {
    trackRef,
    stateOf: (index: number): StepState =>
      focused < 0 ? 'pending' : index < focused ? 'done' : index === focused ? 'active' : 'pending',
    isPinned: (index: number) => pinned === index,
    hover: (index: number | null) => setHovered(index),
    /** Clicking the pinned step releases it, so a reader is never stuck. */
    togglePin: (index: number) => setPinned((current) => (current === index ? null : index)),
  }
}

const STATE_STYLES: Record<StepState, string> = {
  active: 'opacity-100 scale-[1.03] bg-white/[0.07]',
  done: 'opacity-100 bg-white/[0.03]',
  pending: 'opacity-45 bg-white/[0.02]',
}

interface TimelineNodeCardProps {
  node: TimelineNode
  state: StepState
  pinned: boolean
  onHover: (hovering: boolean) => void
  onToggle: () => void
}

/**
 * A button rather than a div. The card visibly responds to a pointer, so it has
 * to respond to a click and to a keyboard too -- and as a button it gets Enter,
 * Space and a focus ring without any of that being reimplemented here.
 */
function TimelineNodeCard({ node, state, pinned, onHover, onToggle }: TimelineNodeCardProps) {
  const style = KIND_STYLES[node.kind]
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={`${node.label}: ${node.title}, ${node.timing}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onClick={onToggle}
      className={`flex h-full w-36 shrink-0 cursor-pointer flex-col rounded-xl border p-3.5 text-left transition-all duration-500 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d18] ${style.border} ${STATE_STYLES[state]} ${
        state === 'active' ? style.glow : ''
      } ${pinned ? 'ring-1 ring-white/30' : ''}`}
    >
      <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${style.labelColor}`}>{node.label}</p>
      <p className="mb-1 text-sm font-semibold text-white">{node.title}</p>
      <p className="mt-auto text-xs text-white/40">{node.timing}</p>
    </button>
  )
}

export default function RoadmapSection() {
  const reduced = useReducedMotion() ?? false
  const journey = useJourneyPlayback(TIMELINE_NODES.length, reduced)

  return (
    <section className="relative overflow-hidden bg-[#0d0d18] px-4 py-20">
      <div
        aria-hidden="true"
        className="aurora-drift pointer-events-none absolute -top-24 -left-24 h-[420px] w-[420px] rounded-full bg-violet-600/30 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="aurora-drift aurora-drift-slow pointer-events-none absolute -top-16 -right-24 h-[380px] w-[380px] rounded-full bg-cyan-400/15 blur-3xl"
      />
      <div aria-hidden="true" className="roadmap-dot-grid pointer-events-none absolute inset-0" />

      <div className="relative max-w-6xl mx-auto">
        <Reveal className="max-w-2xl mx-auto text-center mb-12 sm:mb-14">
          <div className="flex items-center justify-center gap-3 mb-4">
            <p className="text-sm font-semibold text-violet-400 uppercase tracking-widest">Journeys</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse motion-reduce:animate-none" />
              Live now
            </span>
          </div>
          <h2
            className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-4"
            style={JAKARTA_FONT}
          >
            Your agent answers. Then it{' '}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">
              follows up on its own
            </span>
            .
          </h2>
          <p className="text-white/60 text-lg leading-relaxed">
            Capturing a lead is the easy half. A journey carries it forward — three building blocks you assemble once,
            then leave running.
          </p>
        </Reveal>

        <RevealGroup className="grid grid-cols-1 md:grid-cols-3 gap-5" stagger={0.09}>
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon
            return (
              <RevealItem
                key={pillar.title}
                className={`pillar-card relative rounded-2xl border p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 ${
                  pillar.elevated
                    ? 'border-violet-400/50 bg-white/[0.06] hover:border-violet-300/70'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/25 hover:bg-white/[0.06]'
                }`}
              >
                {pillar.elevated && (
                  <div aria-hidden="true" className="pillar-glow pointer-events-none absolute -inset-px rounded-2xl" />
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
              </RevealItem>
            )
          })}
        </RevealGroup>

        <Reveal className="mt-8 rounded-3xl border border-violet-400/20 bg-white/[0.03] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-violet-300" />
              <h3 className="text-xl font-bold text-white" style={JAKARTA_FONT}>
                A journey, drawn once
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-400" />
                AI agent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                Waits for a real reply
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Human handoff
              </span>
            </div>
          </div>
          <p className="text-sm text-white/50 mb-6">
            This is the real-estate journey that ships with the product, step for step — from a new lead to a booked
            site visit, with nobody lifting a finger.
          </p>

          {/* The track is the scroll container AND the offset parent, and its
              direct children are one cell per step — useJourneyPlayback indexes
              children[active] to scroll the active card into view. Keep that
              one-child-per-step shape if this markup changes. */}
          <div
            ref={journey.trackRef}
            className="journey-track relative flex items-stretch gap-2 overflow-x-auto pb-3"
          >
            {TIMELINE_NODES.map((node, i) => (
              <div key={node.title} className="flex shrink-0 items-stretch gap-2 snap-center">
                <TimelineNodeCard
                  node={node}
                  state={journey.stateOf(i)}
                  pinned={journey.isPinned(i)}
                  onHover={(hovering) => journey.hover(hovering ? i : null)}
                  onToggle={() => journey.togglePin(i)}
                />
                {i < TIMELINE_NODES.length - 1 && (
                  <div className="relative h-px w-5 shrink-0 self-center overflow-hidden bg-white/10">
                    {/* The fill is the journey moving. It replaces a dot that
                        used to travel the whole line on a fixed loop, which
                        animated whether or not anything was happening. */}
                    <div
                      className={`absolute inset-0 origin-left bg-gradient-to-r from-violet-400/70 to-cyan-400/70 transition-transform duration-700 ease-out ${
                        journey.stateOf(i) === 'done' ? 'scale-x-100' : 'scale-x-0'
                      }`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              Clone the prebuilt real-estate agent, reword it, publish. More verticals on the way.
            </div>
            <div className="flex items-center gap-2 text-xs text-white/50">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              A lead replies &ldquo;STOP&rdquo; and the journey ends there — no further messages, ever.
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
