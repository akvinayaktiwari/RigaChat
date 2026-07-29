import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, CheckCircle, Loader2 } from 'lucide-react'
import { forgotPassword } from '../services/api'
import AuthHeroPanel from '../components/auth/AuthHeroPanel'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const FEATURE_PILLS = ['RAG-powered AI', 'Built-in CRM', 'WhatsApp alerts']

const inputClasses =
  'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setRateLimitMessage(null)
    setLoading(true)
    try {
      const result = await forgotPassword(email.trim())
      if (result.rateLimited) {
        setRateLimitMessage(result.message)
      } else {
        setSuccessMessage(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="w-full lg:w-1/2">
        <AuthHeroPanel
          tagline="AI chatbots with native CRM"
          features={FEATURE_PILLS}
          footnote="Trusted by 500+ businesses in India"
        />
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white lg:min-h-screen">
        <div className="w-full max-w-sm">
          <h1 className="font-extrabold text-2xl text-gray-900 mb-2" style={JAKARTA_FONT}>
            Forgot your password?
          </h1>
          <p className="text-sm text-gray-500 mb-8">Enter your email and we&apos;ll send you a code to reset it.</p>

          {!successMessage && (
            <form onSubmit={handleSubmit}>
              <div>
                <label className={labelClasses}>Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className={inputClasses}
                />
              </div>

              {rateLimitMessage && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4 text-amber-700 text-sm flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  {rateLimitMessage}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 text-red-600 text-sm flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 bg-linear-to-r from-violet-600 to-purple-500 text-white py-3 rounded-xl font-semibold text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? 'Sending...' : 'Send reset code'}
              </button>
            </form>
          )}

          {successMessage && (
            <div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-700 text-sm flex items-center gap-2">
                <CheckCircle size={16} className="shrink-0" />
                {successMessage}
              </div>

              <Link
                to={`/reset-password?email=${encodeURIComponent(email.trim())}`}
                className="w-full mt-6 bg-linear-to-r from-violet-600 to-purple-500 text-white py-3 rounded-xl font-semibold text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                Enter the code
                <ArrowRight size={16} />
              </Link>
            </div>
          )}

          <p className="text-center mt-6 text-sm text-gray-500">
            Remembered your password?{' '}
            <Link to="/login" className="font-semibold text-violet-600 hover:text-violet-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
