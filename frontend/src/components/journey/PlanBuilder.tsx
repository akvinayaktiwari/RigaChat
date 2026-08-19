// The screen an operator actually uses.
//
// One screen, two labelled sections, split by what the agent may decide versus
// what the system must enforce. Deliberately NOT two separate surfaces: with a
// single narrow journey that only makes the operator ask "which screen controls
// the conversation?", and that ambiguity costs more than an imperfect model.
// The architecture is split; the navigation is not.

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { JourneyPlan, TimelineEntry } from '../../lib/journey-plan'
import { planDurationDays, planTimeline } from '../../lib/journey-plan'

// The pieces of copy a timeline line can open. Derived from TimelineEntry so a
// new editable line cannot be added without this following it.
type MessageKey = NonNullable<TimelineEntry['edits']>

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const LABEL = 'text-[10px] font-bold tracking-[0.11em] uppercase text-gray-400 mb-2'
const CARD = 'border border-gray-200 rounded-2xl bg-white p-4 mb-3'

interface PlanBuilderProps {
  plan: JourneyPlan
  onChange: (plan: JourneyPlan) => void
}

// ---------------------------------------------------------------------------

function ChipList({
  items,
  onChange,
  placeholder,
  tone = 'neutral',
}: {
  items: string[]
  onChange: (next: string[]) => void
  placeholder: string
  tone?: 'neutral' | 'danger'
}) {
  const [draft, setDraft] = useState('')

  function commit() {
    const value = draft.trim()
    if (!value || items.includes(value)) {
      setDraft('')
      return
    }
    onChange([...items, value])
    setDraft('')
  }

  const chip =
    tone === 'danger'
      ? 'bg-rose-50 text-rose-800 border-rose-200'
      : 'bg-gray-50 text-gray-700 border-gray-200'

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex items-center gap-1.5 text-[12.5px] border rounded-full pl-3 pr-1.5 py-1 ${chip}`}
        >
          {item}
          <button
            type="button"
            onClick={() => onChange(items.filter((i) => i !== item))}
            aria-label={`Remove ${item}`}
            className="rounded-full p-0.5 hover:bg-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1 border border-dashed border-gray-300 rounded-full pl-2.5 pr-1 py-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="text-[12.5px] bg-transparent border-0 p-0 w-32 focus:outline-none placeholder:text-gray-400"
        />
        <button
          type="button"
          onClick={commit}
          aria-label="Add"
          className="rounded-full p-1 text-gray-400 hover:text-violet-700 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
        >
          <Plus size={12} />
        </button>
      </span>
    </div>
  )
}

function Stepper({
  value,
  onChange,
  min,
  max,
  suffix,
  label,
}: {
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  suffix: string
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= min && n <= max) onChange(n)
        }}
        className="w-14 text-[13.5px] font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-2 focus:ring-violet-600"
      />
      <span className="text-[13.5px] text-gray-600">{suffix}</span>
    </span>
  )
}

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`w-9 h-[21px] rounded-full relative shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 ${
        on ? 'bg-violet-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-[2.5px] w-4 h-4 rounded-full bg-white transition-all ${on ? 'right-[2.5px]' : 'left-[2.5px]'}`}
      />
    </button>
  )
}

function SectionHead({ dot, title, sub }: { dot: string; title: string; sub: string }) {
  return (
    <div className="flex gap-3 items-start mb-4">
      <span className={`w-2.5 h-2.5 rounded-full mt-2 shrink-0 ${dot}`} aria-hidden="true" />
      <div>
        <h3 style={JAKARTA_FONT} className="text-[15px] font-bold text-gray-900 tracking-[-0.01em]">
          {title}
        </h3>
        <p className="text-[12.5px] text-gray-500">{sub}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function PlanBuilder({ plan, onChange }: PlanBuilderProps) {
  const set = <K extends keyof JourneyPlan>(key: K, value: JourneyPlan[K]) =>
    onChange({ ...plan, [key]: value })

  // Which timeline line is opened for editing. Only one at a time: this is a
  // reading surface first, and several open textareas would bury the sequence
  // the operator came here to check.
  const [openMessage, setOpenMessage] = useState<MessageKey | null>(null)

  // The nudge lives under followUp because WhatsApp's 24h rule owns it, while
  // the rest are plain copy. Both are edited the same way here, because that
  // distinction is ours and not the operator's.
  const messageValue = (key: MessageKey): string =>
    key === 'nudge' ? plan.followUp.nudgeMessage : plan.messages[key]

  const setMessage = (key: MessageKey, text: string) => {
    if (key === 'nudge') onChange({ ...plan, followUp: { ...plan.followUp, nudgeMessage: text } })
    else onChange({ ...plan, messages: { ...plan.messages, [key]: text } })
  }

  const timeline = planTimeline(plan)
  const days = planDurationDays(plan)

  return (
    <div>
      {/* The goal, and what it adds up to. An operator should be able to check
          their automation without learning to read a graph. */}
      <div className="bg-white rounded-2xl border border-black/5 p-6 mb-5">
        <div className={LABEL}>The goal</div>
        <input
          value={plan.goal}
          onChange={(e) => set('goal', e.target.value)}
          style={JAKARTA_FONT}
          placeholder="What should this agent achieve?"
          className="w-full text-[19px] font-bold text-gray-900 tracking-[-0.01em] bg-transparent border-0 p-0 focus:outline-none placeholder:text-gray-300"
        />
        <p className="text-[13px] text-gray-500 mt-2 leading-relaxed">
          Greets on WhatsApp, learns what they want, offers a visit
          {plan.followUp.maxNudges > 0 && `, follows up ${plan.followUp.maxNudges === 1 ? 'once' : `${plan.followUp.maxNudges} times`} if they go quiet`}
          {plan.handoff.enabled && ', then brings in a human'}.{' '}
          {days > 0 && <b className="text-gray-700">About {days} {days === 1 ? 'day' : 'days'} end to end.</b>}
        </p>
      </div>

      {/* TWO COLUMNS ON CONTAINER WIDTH, NOT VIEWPORT WIDTH.
          The dashboard sidebar is 256px and disappears below lg, so the space
          actually available to this grid JUMPS by 256px at that breakpoint. A
          viewport breakpoint cannot express that: xl (1280px) meant a 1150px
          screen got one column even though it had 846px to work with, while a
          1030px screen with no sidebar got one column despite having more room.
          The container query asks the only question that matters -- is there
          space for two 400px columns.

          minmax(0,1fr), never a bare 1fr: a grid track sizes to min-content by
          default, and <textarea>/<input> carry an intrinsic minimum width that
          w-full cannot override, so a bare grid-cols-2 lets the fields push the
          track past the container and the page scrolls sideways. The min-w-0 on
          each section is the same guard one level down. */}
      <div className="@container">
        <div className="grid grid-cols-1 @min-[820px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
        {/* ---------------- Conversation guide ---------------- */}
        <section className="min-w-0">
          <SectionHead
            dot="bg-violet-600"
            title="Conversation guide"
            sub="How the assistant speaks and handles questions."
          />

          <div className={CARD}>
            <div className={LABEL}>Who it is</div>
            <input
              value={plan.agentName}
              onChange={(e) => set('agentName', e.target.value)}
              placeholder="Name this assistant"
              className="w-full text-[14px] font-semibold text-gray-900 bg-transparent border-0 p-0 mb-2 focus:outline-none"
            />
            <input
              value={plan.tone ?? ''}
              onChange={(e) => set('tone', e.target.value)}
              placeholder="e.g. Warm, direct, and brief. Never pushy."
              className="w-full text-[13px] text-gray-600 bg-transparent border-0 p-0 focus:outline-none"
            />
          </div>

          <div className={CARD}>
            <div className={LABEL}>Find out</div>
            <ChipList
              items={plan.learn}
              onChange={(learn) => set('learn', learn)}
              placeholder="add a fact"
            />
          </div>

          <div className={CARD}>
            <div className={LABEL}>Never</div>
            <ChipList
              items={plan.never}
              onChange={(never) => set('never', never)}
              placeholder="add a limit"
              tone="danger"
            />
            <p className="text-[12px] text-gray-400 mt-2.5 leading-relaxed">
              The assistant already only answers from your knowledge base. These are on top of that.
            </p>
          </div>

          <div className={CARD}>
            <div className={LABEL}>Bring in a human when</div>
            <ChipList
              items={plan.escalateWhen}
              onChange={(escalateWhen) => set('escalateWhen', escalateWhen)}
              placeholder="add a trigger"
            />
          </div>
        </section>

        {/* ---------------- Follow-up rules ---------------- */}
        <section className="min-w-0">
          <SectionHead
            dot="bg-amber-500"
            title="Follow-up rules"
            sub="When it follows up, books, or brings in your team."
          />

          <div className={CARD}>
            <div className="flex items-start justify-between gap-4">
              <div className={LABEL + ' mb-0'}>If they go quiet</div>
              <Switch
                on={plan.followUp.maxNudges > 0}
                label="Follow up when they go quiet"
                onToggle={() =>
                  set('followUp', { ...plan.followUp, maxNudges: plan.followUp.maxNudges > 0 ? 0 : 1 })
                }
              />
            </div>

            {plan.followUp.maxNudges > 0 ? (
              <div className="mt-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2 flex-wrap text-[13.5px] text-gray-600">
                  Wait
                  <Stepper
                    value={plan.followUp.waitDays}
                    onChange={(waitDays) => set('followUp', { ...plan.followUp, waitDays })}
                    min={1}
                    max={30}
                    suffix={plan.followUp.waitDays === 1 ? 'day' : 'days'}
                    label="Days before following up"
                  />
                  then follow up
                  <Stepper
                    value={plan.followUp.maxNudges}
                    onChange={(maxNudges) => set('followUp', { ...plan.followUp, maxNudges })}
                    min={1}
                    max={5}
                    suffix={plan.followUp.maxNudges === 1 ? 'time' : 'times'}
                    label="How many follow-ups"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-gray-500 mt-2">
                No follow-up. A lead who goes quiet is {plan.handoff.enabled ? 'handed to you' : 'left alone'}.
              </p>
            )}
          </div>

          {/* WhatsApp's 24h rule is a guardrail, not a setting. The system knows
              the rule; the operator only picks the words. */}
          {plan.followUp.maxNudges > 0 && plan.followUp.waitDays >= 1 && (
            <div className="border border-amber-300 rounded-2xl bg-amber-50 p-4 mb-3">
              <div className="text-[10px] font-bold tracking-[0.11em] uppercase text-amber-700 mb-2">
                ⚠ After a day without a reply
              </div>
              <p className="text-[13.5px] text-amber-900/80 leading-relaxed mb-2.5">
                WhatsApp only allows an approved message after 24 hours of silence. This is what will
                be sent.
              </p>
              <textarea
                value={plan.followUp.nudgeMessage}
                onChange={(e) => set('followUp', { ...plan.followUp, nudgeMessage: e.target.value })}
                rows={2}
                placeholder="Your follow-up message"
                className="w-full min-w-0 text-[13.5px] text-gray-700 bg-white border border-amber-200 rounded-xl px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          )}

          <div className={CARD}>
            <div className="flex items-start justify-between gap-4">
              <div className={LABEL + ' mb-0'}>Booking</div>
              <Switch
                on={plan.booking.enabled}
                label="Let the assistant book site visits"
                onToggle={() => set('booking', { ...plan.booking, enabled: !plan.booking.enabled })}
              />
            </div>
            {plan.booking.enabled ? (
              <div className="mt-3 flex items-center gap-2 flex-wrap text-[13.5px] text-gray-600">
                Check for a booking every
                <Stepper
                  value={plan.booking.recheckDays}
                  onChange={(recheckDays) => set('booking', { ...plan.booking, recheckDays })}
                  min={1}
                  max={14}
                  suffix={plan.booking.recheckDays === 1 ? 'day' : 'days'}
                  label="Days between booking checks"
                />
                <Stepper
                  value={plan.booking.maxRechecks}
                  onChange={(maxRechecks) => set('booking', { ...plan.booking, maxRechecks })}
                  min={1}
                  max={30}
                  suffix="times"
                  label="How many booking checks"
                />
                then stop.
              </div>
            ) : (
              <p className="text-[13px] text-gray-500 mt-2">
                The assistant will not book anything. It can still qualify the lead.
              </p>
            )}
          </div>

          <div className={CARD}>
            <div className="flex items-start justify-between gap-4">
              <div className={LABEL + ' mb-0'}>Hand to a human</div>
              <Switch
                on={plan.handoff.enabled}
                label="Hand the lead to a human"
                onToggle={() => set('handoff', { ...plan.handoff, enabled: !plan.handoff.enabled })}
              />
            </div>
            {plan.handoff.enabled ? (
              <input
                value={plan.handoff.reason}
                onChange={(e) => set('handoff', { ...plan.handoff, reason: e.target.value })}
                placeholder="Why is it handing over?"
                className="w-full mt-3 text-[13.5px] text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-600"
              />
            ) : (
              <p className="text-[13px] text-gray-500 mt-2">
                Nobody is told when the assistant runs out of moves.
              </p>
            )}
          </div>

          {/* The timeline replaces reading a graph, so it is also where the
              words get changed. There is no step editor to go hunting for, and
              an operator asking "where do I customize this?" is asking about a
              specific line right here. */}
          <div className="border border-gray-200 rounded-2xl bg-gray-50 p-4">
            <div className={LABEL}>What will happen</div>
            {timeline.map((entry, i) => {
              const key = entry.edits
              const isOpen = key !== undefined && openMessage === key
              return (
                <div key={`${entry.when}-${i}`} className="border-b border-gray-200 last:border-b-0">
                  <div className="flex gap-3 text-[12.5px] text-gray-600 py-1.5 leading-snug items-start">
                    <span className="font-mono text-[10.5px] text-gray-400 shrink-0 pt-0.5 w-20">
                      {entry.when}
                    </span>
                    <span className="flex-1">
                      {entry.what}
                      {entry.needsTemplate && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                          template
                        </span>
                      )}
                    </span>
                    {key && (
                      <button
                        type="button"
                        onClick={() => setOpenMessage(isOpen ? null : key)}
                        aria-expanded={isOpen}
                        className="shrink-0 text-[11.5px] font-semibold text-violet-700 hover:text-violet-900 rounded px-1.5 py-0.5 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-600"
                      >
                        {isOpen ? 'Done' : 'Edit words'}
                      </button>
                    )}
                  </div>

                  {isOpen && key && (
                    <div className="pb-3 pl-[5.75rem] pr-1 min-w-0">
                      <label
                        htmlFor={`plan-message-${key}`}
                        className="block text-[11px] font-semibold text-gray-500 mb-1.5"
                      >
                        Sent to the lead, exactly as written
                      </label>
                      <textarea
                        id={`plan-message-${key}`}
                        value={messageValue(key)}
                        onChange={(e) => setMessage(key, e.target.value)}
                        rows={3}
                        autoFocus
                        className="w-full min-w-0 text-[13.5px] text-gray-700 bg-white border border-gray-200 rounded-xl px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-violet-600"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}
