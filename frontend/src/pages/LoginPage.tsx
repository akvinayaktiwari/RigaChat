import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import AuthHeroPanel from '../components/auth/AuthHeroPanel'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const FEATURE_PILLS = ['RAG-powered AI', 'Built-in CRM', 'WhatsApp alerts']

function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" width="20" height="20" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1818l-2.9087-2.2581c-.8064.54-1.8368.8591-3.0477.8591-2.3436 0-4.3282-1.5827-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9641 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5813C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1623 6.6564 3.5795 9 3.5795z"
      />
    </svg>
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
