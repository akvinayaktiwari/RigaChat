import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { confirmSignup, resendConfirmationCode } from '../services/api'
import type { ConfirmSignupResponse } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import VyostraLogo from '../components/VyostraLogo'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const FEATURE_PILLS = ['RAG-powered AI', 'Built-in CRM', 'WhatsApp alerts']

const RESEND_COOLDOWN_SECONDS = 30

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
const fieldErrorClasses = 'text-xs text-red-500 mt-1'

interface FieldErrors {
  code?: string
}

// Reuses ResetPasswordPage's FieldErrors display pattern. INVALID_CODE/
// CODE_EXPIRED land on the code field; ALREADY_CONFIRMED is handled by the
// caller as a success-adjacent state (not surfaced as an error here);
// anything else falls back to the general banner.
function fieldErrorsFromResponse(response: ConfirmSignupResponse): {
  fieldErrors: FieldErrors
  generalError: string | null
} {
  const message = response.error ?? 'Something went wrong. Please try again.'
  if (response.code === 'INVALID_CODE' || response.code === 'CODE_EXPIRED') {
    return { fieldErrors: { code: message }, generalError: null }
  }
  return { fieldErrors: {}, generalError: message }
}

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const email = searchParams.get('email') ?? ''

  const [code, setCode] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resending, setResending] = useState(false)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setInterval(() => {
      setResendCooldown((s) => Math.max(0, s - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendCooldown])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})

    if (!code.trim()) {
      setFieldErrors({ code: 'Enter the code we sent you' })
      return
    }

    setLoading(true)
    try {
      const response = await confirmSignup(email, code.trim())
      if (response.success || response.code === 'ALREADY_CONFIRMED') {
        toast.show('Email verified. Please sign in.', 'success')
        navigate('/login')
        return
      }
      const mapped = fieldErrorsFromResponse(response)
      setFieldErrors(mapped.fieldErrors)
      setError(mapped.generalError)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true)
    setError(null)
    try {
      const result = await resendConfirmationCode(email)
      toast.show(result.message, result.rateLimited ? 'warning' : 'success')
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setResending(false)
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
            Verify your email
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            {email ? (
              <>
                We sent a verification code to <span className="font-medium text-gray-700">{email}</span>.
              </>
            ) : (
              'Enter the verification code we sent you.'
            )}
          </p>

          <form onSubmit={handleSubmit}>
            <div>
              <label className={labelClasses}>Verification code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoComplete="one-time-code"
                className={inputClasses}
              />
              {fieldErrors.code && <p className={fieldErrorClasses}>{fieldErrors.code}</p>}
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
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            className="w-full text-center mt-4 text-sm font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {resendCooldown > 0
              ? `Resend code (${resendCooldown}s)`
              : resending
                ? 'Sending...'
                : "Didn't get a code? Resend"}
          </button>

          <p className="text-center mt-6 text-sm text-gray-500">
            <Link to="/login" className="font-semibold text-violet-600 hover:text-violet-700">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
