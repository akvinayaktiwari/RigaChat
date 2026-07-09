import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Check, Eye, EyeOff, Loader2, MessageSquare } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const FEATURE_BULLETS = [
  'Train on your website in minutes',
  'Built-in CRM for every lead',
  'Works on any website',
]

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-between bg-linear-to-br from-indigo-900 to-indigo-700 h-full p-12 text-white">
      <div />
      <div>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
            <MessageSquare size={24} />
          </div>
          <span className="text-2xl font-extrabold tracking-tight">BeepBoop</span>
        </div>

        <h2 className="text-3xl font-bold leading-tight max-w-sm">
          Turn website visitors into leads with AI-powered conversations
        </h2>

        <ul className="mt-8 space-y-4">
          {FEATURE_BULLETS.map((bullet) => (
            <li key={bullet} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                <Check size={12} />
              </span>
              <span className="text-indigo-100 text-sm">{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-indigo-300 text-xs">© 2026 BeepBoop by Drsyeta Corp</p>
    </div>
  )
}

const inputClasses =
  'w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all'
const labelClasses = 'block text-sm font-medium text-slate-700 mb-2'
const fieldErrorClasses = 'text-xs text-red-500 mt-1'

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  confirmPassword?: string
}

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
}

function getPasswordStrength(password: string): PasswordStrength {
  const hasMinLength = password.length >= 8
  const hasNumber = /\d/.test(password)
  const hasUppercase = /[A-Z]/.test(password)

  if (!hasMinLength) return { score: password.length > 0 ? 1 : 0, label: 'Weak', color: 'bg-red-500' }
  if (hasMinLength && hasNumber && hasUppercase) return { score: 4, label: 'Strong', color: 'bg-green-500' }
  if (hasMinLength && hasNumber) return { score: 3, label: 'Good', color: 'bg-yellow-500' }
  return { score: 2, label: 'Fair', color: 'bg-amber-500' }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SignupPage() {
  const { login, signUp } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strength = getPasswordStrength(password)

  function validate(): boolean {
    const nextErrors: FieldErrors = {}

    if (!name.trim() || name.trim().length < 2) {
      nextErrors.name = 'Name must be at least 2 characters'
    }
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address'
    }
    if (password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters'
    }
    if (confirmPassword !== password) {
      nextErrors.confirmPassword = 'Passwords do not match'
    }

    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validate()) return

    setLoading(true)
    try {
      await signUp(name.trim(), email.trim(), password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 grid lg:grid-cols-2">
      <BrandPanel />

      <div className="bg-white flex items-center justify-center p-8 lg:p-12">
        <div className="max-w-md w-full">
          <h1 className="text-2xl font-bold text-slate-800">Create your account</h1>
          <p className="text-slate-500 text-sm mt-1">Start capturing leads with AI today</p>

          <button
            type="button"
            onClick={login}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer shadow-sm mt-8"
          >
            <GoogleIcon />
            Sign up with Google
          </button>

          <div className="flex items-center gap-4 mt-6">
            <hr className="flex-1 border-slate-200" />
            <span className="text-slate-400 text-sm">or</span>
            <hr className="flex-1 border-slate-200" />
          </div>

          <form onSubmit={handleSubmit} className="mt-6">
            <div>
              <label className={labelClasses}>Full name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vinayak Tiwari"
                autoComplete="name"
                className={inputClasses}
              />
              {fieldErrors.name && <p className={fieldErrorClasses}>{fieldErrors.name}</p>}
            </div>

            <div className="mt-4">
              <label className={labelClasses}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className={inputClasses}
              />
              {fieldErrors.email && <p className={fieldErrorClasses}>{fieldErrors.email}</p>}
            </div>

            <div className="mt-4">
              <label className={labelClasses}>Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  className={`${inputClasses} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.password && <p className={fieldErrorClasses}>{fieldErrors.password}</p>}

              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${i < strength.score ? strength.color : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{strength.label}</p>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className={labelClasses}>Confirm password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  className={`${inputClasses} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.confirmPassword && <p className={fieldErrorClasses}>{fieldErrors.confirmPassword}</p>}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-4 text-red-600 text-sm flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <p className="text-xs text-slate-400 text-center mt-4">
              By creating an account you agree to our Terms of Service and Privacy Policy
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center mt-6 text-slate-500 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-indigo-600 font-medium hover:text-indigo-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
