import { useEffect, useState } from 'react'
import { getMe } from '../services/api'

/**
 * The account's default country calling code, or undefined while it loads, when
 * the account has not chosen one, or when the profile could not be read.
 *
 * Undefined is a safe answer rather than an error state: callers fall back to
 * the legacy assumption in lib/phone.ts, which is what they did before this
 * setting existed, so a failed profile read never breaks a lead page.
 */
export function useDefaultCountryCode(): string | undefined {
  const [countryCode, setCountryCode] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    getMe()
      .then((res) => {
        if (!cancelled && res.success) setCountryCode(res.data?.defaultCountryCode)
      })
      .catch((error: unknown) => {
        console.error('[phone] could not load the default country code', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return countryCode
}
