import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { quickSignup } from '../../services/api'
import type { QuickSignupErrorCode } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import type { AuthUser } from '../../hooks/useAuth'
import { PRICING_TIERS } from '../../lib/pricingTiers'
import type { BillableTier } from '../../lib/pricingTiers'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const inputClasses =
  'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'
const submitClasses =
  'w-full mt-2 bg-linear-to-r from-violet-600 to-purple-500 text-white py-3 rounded-xl font-semibold text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2'

interface QuickSignupModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (token: string, user: AuthUser) => void
  mode: 'trial' | 'checkout'
  suggestedTier?: BillableTier
}

type View = 'signup' | 'login'

// Backend messages for these two codes are already safe/human-readable
// (see auth-service.ts's QuickSignupError construction) — shown as-is.
// EMAIL_EXISTS isn't in this map since it switches the view instead of
// displaying inline.
function quickSignupErrorMessage(code: QuickSignupErrorCode | undefined, message: string | undefined): string {
  switch (code) {
    case 'RATE_LIMITED':
      return 'Too many attempts. Please wait a minute and try again.'
    case 'INVALID_PASSWORD':
      return message ?? 'Password does not meet requirements.'
    case 'PROVIDER_ERROR':
    default:
      return 'Something went wrong. Please try again.'
  }
}

export default function QuickSignupModal({ isOpen, onClose, onSuccess, mode, suggestedTier }: QuickSignupModalProps) {
  const { signIn } = useAuth()
  const [view, setView] = useState<View>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setView('signup')
      setEmail('')
      setPassword('')
      setLoading(false)
      setErrorMessage(null)
    }
  }, [isOpen])

  const suggestedTierName = suggestedTier ? PRICING_TIERS.find((t) => t.tier === suggestedTier)?.name : undefined

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setLoading(true)
    try {
      const res = await quickSignup(email, password)
      if (!res.success || !res.data) {
        if (res.code === 'EMAIL_EXISTS') {
          setView('login')
          return
        }
        setErrorMessage(quickSignupErrorMessage(res.code, res.error))
        return
      }
      onSuccess(res.data.token, res.data.user)
      onClose()
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setErrorMessage(null)
    setLoading(true)
    try {
      const { token, user } = await signIn(email, password)
      onSuccess(token, user)
      onClose()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 sm:p-8 max-w-md w-full relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          title="Close"
        >
          <X size={20} />
        </button>

        {view === 'signup' ? (
          <>
            <h2 className="font-bold text-2xl text-gray-900 mb-1" style={JAKARTA_FONT}>
              Create your account
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {suggestedTierName
                ? `You're signing up for the ${suggestedTierName} plan.`
                : 'Start your 14-day free trial. No credit card required.'}
            </p>

            {errorMessage && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleSignup}>
              <div className="mb-4">
                <label className={labelClasses} htmlFor="quick-signup-email">
                  Email
                </label>
                <input
                  id="quick-signup-email"
                  type="email"
                  required
                  autoFocus
                  className={inputClasses}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClasses} htmlFor="quick-signup-password">
                  Password
                </label>
                <input
                  id="quick-signup-password"
                  type="password"
                  required
                  className={inputClasses}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button type="submit" disabled={loading} className={submitClasses}>
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Creating account...' : mode === 'checkout' ? 'Continue to payment' : 'Start free trial'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="font-bold text-2xl text-gray-900 mb-1" style={JAKARTA_FONT}>
              Welcome back
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              An account with this email already exists — sign in to continue.
            </p>

            {errorMessage && (
              <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label className={labelClasses} htmlFor="quick-login-email">
                  Email
                </label>
                <input
                  id="quick-login-email"
                  type="email"
                  required
                  autoFocus
                  className={inputClasses}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClasses} htmlFor="quick-login-password">
                  Password
                </label>
                <input
                  id="quick-login-password"
                  type="password"
                  required
                  className={inputClasses}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <button type="submit" disabled={loading} className={submitClasses}>
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
