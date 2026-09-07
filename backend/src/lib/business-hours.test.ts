import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeNextOpening, isWithinBusinessHours, localMomentIn } from './business-hours.js'
import type { BusinessHours } from '../types/index.js'

// 2026-09-04 is a Friday. All instants below are UTC; IST is UTC+5:30, which is
// the offset that makes a naive "just use the server clock" implementation fail
// these tests.
const OFFICE: BusinessHours = {
  timezone: 'Asia/Kolkata',
  days: {
    mon: [{ open: '09:00', close: '18:00' }],
    tue: [{ open: '09:00', close: '18:00' }],
    wed: [{ open: '09:00', close: '18:00' }],
    thu: [{ open: '09:00', close: '18:00' }],
    fri: [{ open: '09:00', close: '18:00' }],
    sat: [{ open: '10:00', close: '14:00' }],
  },
}

function utc(iso: string): Date {
  return new Date(iso)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('localMomentIn', () => {
  // The whole reason the timezone is stored. 04:00 UTC is 09:30 in Kolkata:
  // a server in UTC reading its own clock would call the office closed while
  // it is open, every single morning.
  it('resolves the wall clock in the configured zone, not the server zone', () => {
    expect(localMomentIn('Asia/Kolkata', utc('2026-09-04T04:00:00Z'))).toEqual({
      weekday: 'fri',
      minutes: 9 * 60 + 30,
    })
  })

  // IST is +5:30, so late-evening UTC is already the next day locally. Getting
  // this wrong reads Friday's config on a Saturday.
  it('rolls the weekday over when the local date is ahead of UTC', () => {
    expect(localMomentIn('Asia/Kolkata', utc('2026-09-04T19:00:00Z'))).toMatchObject({
      weekday: 'sat',
    })
  })

  it('reports local midnight as minute zero, not 1440', () => {
    expect(localMomentIn('Asia/Kolkata', utc('2026-09-03T18:30:00Z'))).toEqual({
      weekday: 'fri',
      minutes: 0,
    })
  })

  it('handles a DST zone correctly', () => {
    // New York is UTC-4 in September (EDT). If DST were ignored this would
    // come back an hour out -- the class of bug that appears twice a year.
    expect(localMomentIn('America/New_York', utc('2026-09-04T16:00:00Z'))).toEqual({
      weekday: 'fri',
      minutes: 12 * 60,
    })
  })
})

describe('isWithinBusinessHours', () => {
  it('is open during a configured window', () => {
    // 10:30 IST on Friday.
    expect(isWithinBusinessHours(OFFICE, utc('2026-09-04T05:00:00Z'))).toBe(true)
  })

  it('is closed before opening', () => {
    // 08:30 IST.
    expect(isWithinBusinessHours(OFFICE, utc('2026-09-04T03:00:00Z'))).toBe(false)
  })

  it('is closed after the window ends', () => {
    // 19:00 IST.
    expect(isWithinBusinessHours(OFFICE, utc('2026-09-04T13:30:00Z'))).toBe(false)
  })

  it('is open exactly at the opening minute and closed exactly at the closing minute', () => {
    // Half-open interval: 09:00 counts, 18:00 does not. Otherwise a transfer
    // fires at the precise moment the office empties.
    expect(isWithinBusinessHours(OFFICE, utc('2026-09-04T03:30:00Z'))).toBe(true)
    expect(isWithinBusinessHours(OFFICE, utc('2026-09-04T12:30:00Z'))).toBe(false)
  })

  it('is closed on a day with no windows', () => {
    // Sunday is absent from the map. 12:00 IST.
    expect(isWithinBusinessHours(OFFICE, utc('2026-09-06T06:30:00Z'))).toBe(false)
  })

  it('honours a second window, so a lunch closure is respected', () => {
    const withLunch: BusinessHours = {
      timezone: 'Asia/Kolkata',
      days: { fri: [{ open: '09:00', close: '13:00' }, { open: '14:00', close: '18:00' }] },
    }

    expect(isWithinBusinessHours(withLunch, utc('2026-09-04T06:00:00Z'))).toBe(true) // 11:30
    expect(isWithinBusinessHours(withLunch, utc('2026-09-04T07:45:00Z'))).toBe(false) // 13:15
    expect(isWithinBusinessHours(withLunch, utc('2026-09-04T09:00:00Z'))).toBe(true) // 14:30
  })

  describe('overnight windows', () => {
    const nightShift: BusinessHours = {
      timezone: 'Asia/Kolkata',
      days: { fri: [{ open: '22:00', close: '02:00' }] },
    }

    it('is open in the evening half of the shift', () => {
      // 23:00 IST Friday.
      expect(isWithinBusinessHours(nightShift, utc('2026-09-04T17:30:00Z'))).toBe(true)
    })

    // The half a naive implementation loses: 01:00 Saturday belongs to FRIDAY's
    // window, and only Friday's config knows it.
    it('is open in the after-midnight half, which belongs to the previous day', () => {
      // 01:00 IST Saturday.
      expect(isWithinBusinessHours(nightShift, utc('2026-09-04T19:30:00Z'))).toBe(true)
    })

    it('is closed once the overnight window ends', () => {
      // 03:00 IST Saturday.
      expect(isWithinBusinessHours(nightShift, utc('2026-09-04T21:30:00Z'))).toBe(false)
    })

    it('does not leak into a day the shift never covered', () => {
      // 01:00 IST Friday -- Thursday has no window, so this is closed.
      expect(isWithinBusinessHours(nightShift, utc('2026-09-03T19:30:00Z'))).toBe(false)
    })
  })

  describe('malformed configuration', () => {
    // Fails OPEN and loudly. Silently meaning "closed forever" would disable
    // transfers with no symptom beyond callers never reaching anyone; failing
    // open lands on the <Dial> no-answer fallback, which already apologises.
    it('treats an unusable timezone as always open, and says so', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(isWithinBusinessHours({ timezone: 'Not/AZone', days: {} }, utc('2026-09-04T04:00:00Z'))).toBe(true)
      expect(consoleError).toHaveBeenCalled()
    })

    it.each([
      ['unparseable times', { open: 'morning', close: 'evening' }],
      ['an out-of-range hour', { open: '25:00', close: '26:00' }],
      ['an out-of-range minute', { open: '09:70', close: '18:00' }],
      // Not a 24-hour day: a typo. Reading it as always-open would transfer
      // callers at any hour.
      ['a zero-length window', { open: '09:00', close: '09:00' }],
    ])('ignores a window with %s', (_label, window) => {
      const broken: BusinessHours = { timezone: 'Asia/Kolkata', days: { fri: [window] } }

      expect(isWithinBusinessHours(broken, utc('2026-09-04T05:00:00Z'))).toBe(false)
    })

    it('keeps the valid windows when one alongside them is malformed', () => {
      const mixed: BusinessHours = {
        timezone: 'Asia/Kolkata',
        days: { fri: [{ open: 'nonsense', close: '13:00' }, { open: '09:00', close: '18:00' }] },
      }

      expect(isWithinBusinessHours(mixed, utc('2026-09-04T05:00:00Z'))).toBe(true)
    })

    it('accepts 24:00 as an end-of-day close', () => {
      const untilMidnight: BusinessHours = {
        timezone: 'Asia/Kolkata',
        days: { fri: [{ open: '18:00', close: '24:00' }] },
      }

      // 23:30 IST.
      expect(isWithinBusinessHours(untilMidnight, utc('2026-09-04T18:00:00Z'))).toBe(true)
    })
  })
})

describe('describeNextOpening', () => {
  it('says today when the office has not opened yet', () => {
    // 07:00 IST Friday.
    expect(describeNextOpening(OFFICE, utc('2026-09-04T01:30:00Z'))).toBe('today at 9am')
  })

  it('says tomorrow once today has closed', () => {
    // 19:00 IST Friday -> Saturday opens at 10:00.
    expect(describeNextOpening(OFFICE, utc('2026-09-04T13:30:00Z'))).toBe('tomorrow at 10am')
  })

  it('still says tomorrow across a closed day, since Sunday to Monday is one day', () => {
    // 15:00 IST Sunday -- closed all day, and Monday is genuinely tomorrow.
    expect(describeNextOpening(OFFICE, utc('2026-09-06T09:30:00Z'))).toBe('tomorrow at 9am')
  })

  it('names the weekday once the opening is more than a day out', () => {
    const wednesdaysOnly: BusinessHours = {
      timezone: 'Asia/Kolkata',
      days: { wed: [{ open: '09:00', close: '18:00' }] },
    }

    // 15:00 IST Sunday -- next opening is three days away.
    expect(describeNextOpening(wednesdaysOnly, utc('2026-09-06T09:30:00Z'))).toBe('Wednesday at 9am')
  })

  it('includes minutes when the opening is not on the hour', () => {
    const halfPast: BusinessHours = {
      timezone: 'Asia/Kolkata',
      days: { fri: [{ open: '09:30', close: '18:00' }] },
    }

    expect(describeNextOpening(halfPast, utc('2026-09-04T01:30:00Z'))).toBe('today at 9:30am')
  })

  it('reports the earliest of several windows on the same day', () => {
    const twoWindows: BusinessHours = {
      timezone: 'Asia/Kolkata',
      days: { fri: [{ open: '14:00', close: '18:00' }, { open: '09:00', close: '13:00' }] },
    }

    expect(describeNextOpening(twoWindows, utc('2026-09-04T01:30:00Z'))).toBe('today at 9am')
  })

  // Better silence than a promise nobody can keep.
  it('returns null when nothing opens in the next week', () => {
    expect(describeNextOpening({ timezone: 'Asia/Kolkata', days: {} }, utc('2026-09-04T04:00:00Z'))).toBeNull()
  })
})
