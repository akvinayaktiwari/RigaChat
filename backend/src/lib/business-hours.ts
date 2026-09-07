import type { BusinessHours, BusinessHoursWindow, Weekday } from '../types/index.js'

// -------------------------------------------------------------------------
// "Is there a human on the other end right now?"
//
// Gates the live transfer only. The AI answers around the clock -- that is the
// point of it -- but putting a 2am caller through to a dark office means they
// sit through ringing before being dropped, which is worse than being told
// plainly that the office is closed and someone will call back.
//
// Pure and timezone-explicit. No dependency: Intl.DateTimeFormat already
// resolves a wall-clock time in an arbitrary IANA zone correctly, including
// DST, and rolling that by hand is how off-by-an-hour bugs get shipped twice a
// year. India has no DST, but the client's timezone is stored rather than
// assumed because the first client outside IST should not be a code change.
// -------------------------------------------------------------------------

export const WEEKDAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// 'Mon' as Intl reports it, to our own key. Built from the same array so the
// two orderings cannot drift.
const INTL_WEEKDAY_TO_KEY: Record<string, Weekday> = {
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
}

export interface LocalMoment {
  weekday: Weekday
  // Minutes since local midnight. One comparable number beats comparing hours
  // and minutes separately, which is where "09:05 is before 09:30" goes wrong.
  minutes: number
}

function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  // 24:00 is accepted as an end-of-day close, which is how "open until
  // midnight" is naturally written and would otherwise have to be 23:59.
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null

  return hours * 60 + minutes
}

// The caller's wall clock, in the configured zone. Throws only for a timezone
// string Intl rejects, which callers treat as a misconfiguration.
export function localMomentIn(timezone: string, now: Date): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)

  const lookup = (type: string): string => parts.find((part) => part.type === type)?.value ?? ''

  const weekday = INTL_WEEKDAY_TO_KEY[lookup('weekday')]
  // hour12:false still yields '24' at midnight in some ICU versions, which
  // would otherwise read as tomorrow's 1440th minute rather than today's zero.
  const hour = Number(lookup('hour')) % 24
  const minute = Number(lookup('minute'))

  if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Could not resolve local time in timezone "${timezone}"`)
  }

  return { weekday, minutes: hour * 60 + minute }
}

interface NormalisedWindow {
  open: number
  close: number
  // close <= open means the window runs past midnight (a 22:00-02:00 shift), so
  // part of it belongs to the FOLLOWING day. Ignoring this is what makes a late
  // shift look closed for its entire second half.
  overnight: boolean
}

function normaliseWindow(window: BusinessHoursWindow): NormalisedWindow | null {
  const open = parseHhMm(window.open)
  const close = parseHhMm(window.close)
  if (open === null || close === null) return null
  // An empty window (open === close) is not a 24-hour day; it is a typo, and
  // treating it as always-open would transfer callers at any hour.
  if (open === close) return null

  return { open, close, overnight: close < open }
}

function windowsFor(hours: BusinessHours, day: Weekday): NormalisedWindow[] {
  const raw = hours.days[day] ?? []
  return raw.map(normaliseWindow).filter((window): window is NormalisedWindow => window !== null)
}

function previousDay(day: Weekday): Weekday {
  const index = WEEKDAYS.indexOf(day)
  return WEEKDAYS[(index + WEEKDAYS.length - 1) % WEEKDAYS.length]!
}

export function isWithinBusinessHours(hours: BusinessHours, now: Date): boolean {
  let moment: LocalMoment
  try {
    moment = localMomentIn(hours.timezone, now)
  } catch (error) {
    // Fails OPEN, and loudly. A bad timezone silently meaning "closed forever"
    // would disable transfers with no symptom beyond callers never reaching
    // anyone -- whereas failing open lands on the <Dial> no-answer fallback,
    // which already apologises and offers a callback.
    console.error(
      `[business-hours] unusable timezone "${hours.timezone}", treating as always open:`,
      error instanceof Error ? error.message : error
    )
    return true
  }

  for (const window of windowsFor(hours, moment.weekday)) {
    if (window.overnight ? moment.minutes >= window.open : moment.minutes >= window.open && moment.minutes < window.close) {
      return true
    }
  }

  // The tail of yesterday's overnight shift. 01:00 on Tuesday is inside
  // Monday's 22:00-02:00 window, and only Monday's config knows that.
  for (const window of windowsFor(hours, previousDay(moment.weekday))) {
    if (window.overnight && moment.minutes < window.close) return true
  }

  return false
}

function formatMinutes(minutes: number): string {
  const hour24 = Math.floor(minutes / 60) % 24
  const minute = minutes % 60
  const suffix = hour24 < 12 ? 'am' : 'pm'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return minute === 0 ? `${hour12}${suffix}` : `${hour12}:${String(minute).padStart(2, '0')}${suffix}`
}

const DAY_LABELS: Record<Weekday, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
}

// "tomorrow at 9am" for the agent to say out loud. Null when nothing is
// configured to open in the next week, which the caller is simply not told --
// better silence than a promise nobody can keep.
export function describeNextOpening(hours: BusinessHours, now: Date): string | null {
  let moment: LocalMoment
  try {
    moment = localMomentIn(hours.timezone, now)
  } catch {
    return null
  }

  const startIndex = WEEKDAYS.indexOf(moment.weekday)

  for (let offset = 0; offset < 7; offset += 1) {
    const day = WEEKDAYS[(startIndex + offset) % WEEKDAYS.length]!
    const opens = windowsFor(hours, day)
      .map((window) => window.open)
      // Today only counts if the opening is still ahead of us.
      .filter((open) => offset > 0 || open > moment.minutes)
      .sort((a, b) => a - b)

    const next = opens[0]
    if (next === undefined) continue

    const when = formatMinutes(next)
    if (offset === 0) return `today at ${when}`
    if (offset === 1) return `tomorrow at ${when}`
    return `${DAY_LABELS[day]} at ${when}`
  }

  return null
}
