import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react'
import { useStaffAuth } from '../../hooks/useStaffAuth'

const inputClasses =
  'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'
const submitClasses =
  'w-full mt-6 bg-linear-to-r from-violet-600 to-purple-500 text-white py-3 rounded-xl font-semibold text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2'

export default function AdminLoginPage() {
  const { signIn, submitMfaCode } = useStaffAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [session, setSession] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signIn(email, password)
      setSession(result.session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    setError(null)
    setLoading(true)
    try {
      await submitMfaCode(session, code, email)
      navigate('/admin/accounts')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <ShieldCheck className="text-violet-600" size={22} />
          <span className="font-bold text-lg text-gray-900">VyostraAI Staff Console</span>
        </div>

        {!session ? (
          <form onSubmit={handlePasswordSubmit}>
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Staff sign in</h1>
            <p className="text-sm text-gray-500 mb-6">Internal use only</p>

            <div>
              <label className={labelClasses}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                className={inputClasses}
              />
            </div>

            <div className="mt-4">
              <label className={labelClasses}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={inputClasses}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 text-red-600 text-sm flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className={submitClasses}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit}>
            <h1 className="text-xl font-semibold text-gray-900 mb-1">Two-factor code</h1>
            <p className="text-sm text-gray-500 mb-6">Enter the 6-digit code from your authenticator app</p>

            <div>
              <label className={labelClasses}>Code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                autoFocus
                required
                className={`${inputClasses} tracking-widest text-center text-lg`}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 text-red-600 text-sm flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || code.length !== 6} className={submitClasses}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
