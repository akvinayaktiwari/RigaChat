import { useState } from 'react'
import { Globe } from 'lucide-react'
import { LEGACY_COUNTRY_CODE } from '../../lib/phone'
import { DIAL_CODES } from '../../lib/whatsapp-link'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

interface PhoneDefaultsSectionProps {
  /** The saved code, digits only, or undefined when the account has not chosen. */
  countryCode: string | undefined
  /** Resolves true when the choice was saved. */
  onChange: (countryCode: string) => Promise<boolean>
}

/**
 * The country assumed for a lead number typed without a country code.
 *
 * Several countries share a calling code (the US and Canada are both +1), so
 * the option value is the code and the first country with it is what a saved
 * code shows as. Either choice produces the same links.
 */
export default function PhoneDefaultsSection({ countryCode, onChange }: PhoneDefaultsSectionProps) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleChange(next: string) {
    if (!next) return
    setSaving(true)
    setFailed(false)
    const saved = await onChange(next)
    setFailed(!saved)
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
          <Globe size={18} />
        </div>
        <div>
          <h4 className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
            Default country for phone numbers
          </h4>
          <p className="text-xs text-gray-500">Used when a lead leaves a number without a country code.</p>
        </div>
      </div>

      <label htmlFor="default-country" className="sr-only">
        Default country
      </label>
      <select
        id="default-country"
        value={countryCode ?? ''}
        disabled={saving}
        onChange={(event) => handleChange(event.target.value)}
        className="w-full sm:w-80 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 disabled:opacity-60"
      >
        {countryCode ? null : <option value="">Not set (assumes India, +{LEGACY_COUNTRY_CODE})</option>}
        {DIAL_CODES.map((entry) => (
          <option key={entry.country} value={entry.code}>{`${entry.country} (+${entry.code})`}</option>
        ))}
      </select>

      <p className="mt-3 text-xs text-gray-500 leading-relaxed max-w-xl">
        The WhatsApp button on a lead adds this code to a number written without one. A number that starts with + keeps
        the code it was written with.
      </p>
      {failed ? <p className="mt-2 text-xs text-red-700">That did not save. Please try again.</p> : null}
    </div>
  )
}
