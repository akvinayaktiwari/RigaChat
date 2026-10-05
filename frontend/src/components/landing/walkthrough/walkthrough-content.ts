// Content for the guided product walkthrough.
//
// Kept out of the component so all three verticals sit side by side and can be
// checked against what the product actually does. Two rules for anything added
// here:
//
// 1. No invented outcomes. No conversion rates, no "+25% AOV", no revenue
//    claims. The walkthrough shows mechanics, and the mechanics are the pitch.
// 2. Every beat maps to a real capability. The journey beats in particular
//    mirror the shipped step types (send_message, await_reply with its 24h
//    WhatsApp window, wait_and_recheck, human_handoff) rather than an
//    idealised version of them.

export type VerticalId = 'real_estate' | 'clinic' | 'coaching'

export interface WalkthroughMessage {
  from: 'lead' | 'agent'
  text: string
}

export interface CapturedField {
  label: string
  value: string
}

export type JourneyBeatKind = 'agent' | 'wait' | 'check' | 'human' | 'done'

export interface JourneyBeat {
  when: string
  kind: JourneyBeatKind
  text: string
}

export interface VerticalScript {
  id: VerticalId
  label: string
  /** Where this lead came in from. One named door, not a list. */
  source: string
  agentName: string
  conversation: WalkthroughMessage[]
  fields: CapturedField[]
  journey: JourneyBeat[]
  booking: { title: string; detail: string }
}

export const VERTICALS: VerticalScript[] = [
  {
    id: 'real_estate',
    label: 'Real estate',
    source: 'Meta lead ad · 3-bedroom, Riverside',
    agentName: 'Site visit assistant',
    conversation: [
      { from: 'agent', text: 'Hi Daniel, thanks for your interest in Riverside. What budget range are you looking at?' },
      { from: 'lead', text: 'Around $450k to $500k. Prefer something move-in ready.' },
      { from: 'agent', text: 'Two of our 3-bedroom homes fit that and are move-in ready. Shall I arrange a viewing?' },
      { from: 'lead', text: 'Yes, weekend works better for me.' },
    ],
    fields: [
      { label: 'Interest', value: '3-bedroom · Riverside' },
      { label: 'Budget', value: '$450k–$500k' },
      { label: 'Name', value: 'Daniel Carter' },
      { label: 'Phone', value: '+1 (555) 010-4821' },
    ],
    journey: [
      { when: 'Right away', kind: 'agent', text: 'Sends the floor plans on WhatsApp' },
      { when: 'Up to 24h', kind: 'wait', text: 'Waits for Daniel to name a day' },
      { when: 'Day 1', kind: 'agent', text: 'Nudges once, offers a weekend slot' },
      { when: 'Daily, 3×', kind: 'check', text: 'Checks whether the visit got booked' },
      { when: 'If still nothing', kind: 'human', text: 'Hands Daniel to your sales team' },
      { when: 'Once booked', kind: 'done', text: 'Confirms and reminds him before the visit' },
    ],
    booking: { title: 'Viewing confirmed', detail: 'Saturday, 11:00 AM · Riverside show home' },
  },
  {
    id: 'clinic',
    label: 'Clinic',
    source: 'Website chat · dermatology page',
    agentName: 'Front desk assistant',
    conversation: [
      { from: 'lead', text: 'Do you treat adult acne? And what does a consultation cost?' },
      { from: 'agent', text: 'Yes, our dermatology team does. Is this your first visit with us, and which day suits you?' },
      { from: 'lead', text: 'First visit. Evenings after 6 are best.' },
      { from: 'agent', text: 'Noted. Could I take your name and number to hold an evening slot?' },
    ],
    fields: [
      { label: 'Specialty', value: 'Dermatology · adult acne' },
      { label: 'Visit type', value: 'First consultation' },
      { label: 'Name', value: 'Ananya Rao' },
      { label: 'Phone', value: '+44 7700 900142' },
    ],
    journey: [
      { when: 'Right away', kind: 'agent', text: 'Sends the evening slots on WhatsApp' },
      { when: 'Up to 24h', kind: 'wait', text: 'Waits for Ananya to pick one' },
      { when: 'Day 1', kind: 'agent', text: 'Nudges once with the next open evening' },
      { when: 'Daily, 3×', kind: 'check', text: 'Checks whether the appointment got booked' },
      { when: 'If still nothing', kind: 'human', text: 'Hands her to your front desk' },
      { when: 'Once booked', kind: 'done', text: 'Confirms and reminds her the day before' },
    ],
    booking: { title: 'Consultation confirmed', detail: 'Tuesday, 6:30 PM · Dr. Menon' },
  },
  {
    id: 'coaching',
    label: 'Coaching',
    source: 'Instagram lead ad · SAT prep, spring cohort',
    agentName: 'Admissions assistant',
    conversation: [
      { from: 'agent', text: 'Hi! Thanks for your interest in the spring SAT cohort. Which grade is the student in?' },
      { from: 'lead', text: 'Grade 11, taking it for the second time. When do the classes run?' },
      { from: 'agent', text: 'The retake cohort runs weekday evenings. Want to sit in on an advising session first?' },
      { from: 'lead', text: 'Yes please, this week if possible.' },
    ],
    fields: [
      { label: 'Course', value: 'SAT prep · retake cohort' },
      { label: 'Grade', value: 'Grade 11' },
      { label: 'Name', value: 'Imran Qureshi' },
      { label: 'Phone', value: '+971 50 555 0137' },
    ],
    journey: [
      { when: 'Right away', kind: 'agent', text: 'Sends the class schedule on WhatsApp' },
      { when: 'Up to 24h', kind: 'wait', text: 'Waits for Imran to pick a slot' },
      { when: 'Day 1', kind: 'agent', text: 'Nudges once with this week’s sessions' },
      { when: 'Daily, 3×', kind: 'check', text: 'Checks whether the session got booked' },
      { when: 'If still nothing', kind: 'human', text: 'Hands him to your admissions team' },
      { when: 'Once booked', kind: 'done', text: 'Confirms and reminds him before it' },
    ],
    booking: { title: 'Counselling slot confirmed', detail: 'Thursday, 5:00 PM · Admissions desk' },
  },
]

export interface Chapter {
  id: string
  label: string
  /** Ticks this chapter occupies. One tick is TICK_MS. */
  ticks: number
}

export const TICK_MS = 150

export const CHAPTERS: Chapter[] = [
  { id: 'system', label: 'How it fits together', ticks: 44 },
  { id: 'qualify', label: 'Arrives and gets qualified', ticks: 92 },
  { id: 'crm', label: 'Lands in your CRM', ticks: 46 },
  { id: 'journey', label: 'Followed up on WhatsApp', ticks: 88 },
  { id: 'booked', label: 'Booked, or handed over', ticks: 46 },
]

/** Cumulative tick offset each chapter starts at. */
export const CHAPTER_OFFSETS: number[] = CHAPTERS.reduce<number[]>((acc, chapter, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1] + CHAPTERS[i - 1].ticks)
  return acc
}, [])

export const TOTAL_TICKS: number = CHAPTER_OFFSETS[CHAPTER_OFFSETS.length - 1] + CHAPTERS[CHAPTERS.length - 1].ticks

/**
 * Which chapter a global tick falls in, and how far into it.
 *
 * Deriving both from one counter (rather than tracking a chapter index and a
 * local timer separately) means chapter jumps, looping and pausing cannot drift
 * out of sync, and nothing has to mutate state from inside a state updater --
 * which is what made the previous demo append every message twice under
 * StrictMode.
 */
export function resolveTick(tick: number): { chapterIndex: number; localTick: number } {
  const wrapped = tick % TOTAL_TICKS
  let chapterIndex = 0
  for (let i = CHAPTERS.length - 1; i >= 0; i--) {
    if (wrapped >= CHAPTER_OFFSETS[i]) {
      chapterIndex = i
      break
    }
  }
  return { chapterIndex, localTick: wrapped - CHAPTER_OFFSETS[chapterIndex] }
}

/** Reveal one item every `every` ticks, after an initial `delay`. */
export function revealCount(localTick: number, total: number, every: number, delay = 6): number {
  if (localTick < delay) return 0
  return Math.min(total, Math.floor((localTick - delay) / every) + 1)
}
