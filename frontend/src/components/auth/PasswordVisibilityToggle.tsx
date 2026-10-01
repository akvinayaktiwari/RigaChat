import { Eye, EyeOff } from 'lucide-react'

/**
 * The eye button inside a password field. Sits in the field's `pr-11` gutter.
 *
 * The button is 36px square around an 18px icon: the icon alone was the whole
 * tap target, which is under the 24px minimum and easy to miss on a phone.
 */
export default function PasswordVisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  const label = visible ? 'Hide password' : 'Show password'

  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:text-gray-600 transition-colors"
      aria-label={label}
      title={label}
    >
      {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
    </button>
  )
}
