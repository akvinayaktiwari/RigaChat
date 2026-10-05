import { Inbox, Route, Sparkles, Tag, type LucideIcon } from 'lucide-react'

/**
 * One self-contained definition of the product, high on the homepage.
 *
 * This is the passage an answer engine should lift when asked "what is
 * Vyostra AI", so it is written to stand alone: it opens with "Vyostra AI is",
 * names every channel, and carries the price floor. Answer engines cite
 * passages of roughly 134-167 words most often; the test holds it there.
 *
 * Every sentence has to be true of the shipped product. No figures that are
 * not on the pricing page, no customer counts, no performance claims.
 *
 * Plain markup with no motion wrapper: the homepage is prerendered, and an
 * entrance animation would ship this at opacity 0 to crawlers that never run JS.
 */
export const WHAT_IS_VYOSTRA: readonly string[] = [
  'Vyostra AI is a lead-capture platform for businesses that sell through enquiries. You train an AI agent on your website and your own knowledge base, and it answers visitors on website chat, voice and WhatsApp at any hour.',
  "When a conversation turns into interest, the agent collects the lead's details and writes them into a built-in lead CRM, so every enquiry lands in one queue with its transcript. Leads from lead forms and Meta lead ads arrive in the same place.",
  'Follow-up journeys then keep the conversation going on WhatsApp, waiting for a real reply rather than firing on a timer, and hand the lead to your team when it needs a person. The agent answers only from the content you give it; when the answer is not there, it says so.',
  'Plans start at $49 a month. Vyostra AI is built by a team in Bangalore, India, for businesses worldwide.',
]

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

// One marker per paragraph, in the order the copy runs: what it is, where the
// lead lands, how it is followed up, what it costs. Decorative only -- the
// markers carry no text, so the passage stays one unbroken run for an engine
// lifting it. A label between paragraphs would be quoted along with them.
const MARKERS: readonly LucideIcon[] = [Sparkles, Inbox, Route, Tag]

interface DefinitionRowProps {
  paragraph: string
  icon: LucideIcon
  isLead: boolean
}

function DefinitionRow({ paragraph, icon: Icon, isLead }: DefinitionRowProps) {
  const badge = isLead
    ? 'bg-linear-to-br from-violet-600 to-purple-500 text-white shadow-lg shadow-violet-200/60'
    : 'bg-white text-violet-600 border border-violet-100 shadow-sm'
  const text = isLead
    ? 'text-lg sm:text-xl font-medium text-gray-900 leading-relaxed'
    : 'text-base sm:text-lg text-gray-600 leading-relaxed'

  return (
    <div className="group relative flex gap-4 sm:gap-5 pb-7 last:pb-0">
      {/* The rail to the next marker, centred on the badge column (36px wide,
          40px from sm). Drawn per row and dropped on the last one: a single
          line down the whole card has to guess where the last badge sits, and
          overshot it on mobile where the closing paragraph wraps to three
          lines. */}
      <span
        aria-hidden="true"
        className="absolute top-0 bottom-0 left-[18px] sm:left-5 w-px -translate-x-1/2 bg-violet-200 group-last:hidden"
      />
      {/* ring-4 ring-white cuts the rail around the badge, as the step badges
          in HowItWorksSection do. */}
      <span
        aria-hidden="true"
        className={`relative shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ring-4 ring-white ${badge}`}
      >
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
      </span>
      <p className={`pt-1 ${text}`}>{paragraph}</p>
    </div>
  )
}

export default function WhatIsVyostra() {
  return (
    <section id="what-is-vyostra" className="relative py-20 sm:py-24 px-4 overflow-hidden">
      {/* Soft violet wash behind the card, picking up the hero's colour so the
          definition does not read as a slab of body text between two sections. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-10 -translate-x-1/2 w-[44rem] max-w-full h-72 rounded-full bg-violet-200/40 blur-3xl"
      />

      <div className="relative max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-sm font-semibold text-violet-600 uppercase tracking-widest mb-3">The short answer</p>
          <h2 className="text-4xl sm:text-5xl font-extrabold text-gray-900 tracking-tight" style={JAKARTA_FONT}>
            What is Vyostra AI?
          </h2>
        </div>

        <div className="relative rounded-3xl bg-white border border-gray-100 shadow-xl shadow-violet-100/50 p-6 sm:p-10">
          {WHAT_IS_VYOSTRA.map((paragraph, index) => (
            <DefinitionRow
              key={paragraph.slice(0, 24)}
              paragraph={paragraph}
              icon={MARKERS[index] ?? Sparkles}
              isLead={index === 0}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
