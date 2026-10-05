import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { DIAL_CODES, type WhatsAppLinkProblem } from '../../lib/whatsapp-link'
import { FIELD_HINT, FIELD_INPUT, FIELD_LABEL } from './tool-styles'

/** What to say while there is no usable number yet. `subject` is what the tool builds: "the link", "the QR code". */
export function numberProblemText(problem: WhatsAppLinkProblem, subject: string): string {
  const text: Record<WhatsAppLinkProblem, string> = {
    empty: `Enter a phone number to build ${subject}.`,
    too_short: 'That number looks too short. Enter the full number, including the area or operator code.',
    too_long: 'That number is too long. A phone number has at most 15 digits, country code included.',
  }
  return text[problem]
}

/** The WhatsApp number a tool is building for: the three fields below, as typed. */
export interface WhatsAppNumberValue {
  countryCode: string
  phone: string
  message: string
}

interface WhatsAppNumberFieldsProps {
  value: WhatsAppNumberValue
  onChange: (value: WhatsAppNumberValue) => void
  /** Further fields of the same form, below the message. */
  children?: ReactNode
}

/** Country, number and pre-filled message: the inputs every wa.me tool starts from. */
export default function WhatsAppNumberFields({ value, onChange, children }: WhatsAppNumberFieldsProps) {
  return (
    <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
      <div>
        <label htmlFor="wa-country" className={FIELD_LABEL}>Country</label>
        <div className="relative">
          <select
            id="wa-country"
            value={value.countryCode}
            onChange={(event) => onChange({ ...value, countryCode: event.target.value })}
            className={`${FIELD_INPUT} appearance-none pr-11 cursor-pointer`}
          >
            {DIAL_CODES.map((entry) => (
              <option key={entry.country} value={entry.code}>{`${entry.country} (+${entry.code})`}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" aria-hidden="true" />
        </div>
      </div>
      <div>
        <label htmlFor="wa-phone" className={FIELD_LABEL}>WhatsApp number</label>
        <input
          id="wa-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={value.phone}
          onChange={(event) => onChange({ ...value, phone: event.target.value })}
          placeholder="Number without the country code"
          className={FIELD_INPUT}
          aria-describedby="wa-phone-hint"
        />
        <p id="wa-phone-hint" className={FIELD_HINT}>Country not listed? Type the number with its code, starting with +.</p>
      </div>
      <div>
        <label htmlFor="wa-message" className={FIELD_LABEL}>Pre-filled message (optional)</label>
        <textarea
          id="wa-message"
          rows={4}
          value={value.message}
          onChange={(event) => onChange({ ...value, message: event.target.value })}
          placeholder="Hi, I would like to know more about…"
          className={FIELD_INPUT}
        />
      </div>
      {children}
    </form>
  )
}

/** A blank starting value, on the picker's default country. */
export function emptyWhatsAppNumber(): WhatsAppNumberValue {
  return { countryCode: DIAL_CODES[0]?.code ?? '', phone: '', message: '' }
}
