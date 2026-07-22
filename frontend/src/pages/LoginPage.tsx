import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import VyostraLogo from '../components/VyostraLogo'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const FEATURE_PILLS = ['RAG-powered AI', 'Built-in CRM', 'WhatsApp alerts']

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
    <div className="hidden lg:flex flex-col items-center justify-center bg-linear-to-br from-violet-600 via-purple-600 to-indigo-700 h-full p-12 text-white text-center">
      <div className="mb-6">
        <VyostraLogo size={56} animate={true} />
      </div>

      <span className="text-4xl font-extrabold text-white" style={JAKARTA_FONT}>
        VyostraAI
      </span>
      <p className="text-white/70 text-lg mt-3 mb-10">AI chatbots with native CRM</p>

      <div className="flex flex-col items-center">
        {FEATURE_PILLS.map((pill) => (
          <div
            key={pill}
            className="bg-white/10 border border-white/20 text-white text-sm px-5 py-2.5 rounded-full mb-3 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4 text-emerald-300" />
            {pill}
          </div>
        ))}
      </div>

      <p className="mt-12 text-white/40 text-xs text-center">Trusted by 500+ businesses in India</p>
    </div>
  )
}

const inputClasses =
  'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'

export default function LoginPage() {
  const { login, signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:block lg:w-1/2">
        <BrandPanel />
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white min-h-screen">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <VyostraLogo size={32} animate={true} />
            <span className="font-bold text-lg text-gray-900" style={JAKARTA_FONT}>
              VyostraAI
            </span>
          </div>

          <h1 className="font-extrabold text-2xl text-gray-900 mb-2" style={JAKARTA_FONT}>
            Welcome back
          </h1>
          <p className="text-sm text-gray-500 mb-8">Sign in to your VyostraAI dashboard</p>

          <button
            type="button"
            onClick={login}
            className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors bg-white mb-5"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-5">
            <hr className="flex-1 h-px bg-gray-100 border-0" />
            <span className="text-xs text-gray-400">or</span>
            <hr className="flex-1 h-px bg-gray-100 border-0" />
          </div>

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

            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-violet-600 hover:text-violet-700">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className={`${inputClasses} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

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
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-semibold text-violet-600 hover:text-violet-700">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
