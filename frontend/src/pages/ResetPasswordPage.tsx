import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { confirmForgotPassword } from '../services/api'
import type { ConfirmForgotPasswordResponse } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import VyostraLogo from '../components/VyostraLogo'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const FEATURE_PILLS = ['RAG-powered AI', 'Built-in CRM', 'WhatsApp alerts']

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
  newPassword?: string
  confirmNewPassword?: string
}

interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
}

// Mirrors SignupPage.tsx's getPasswordStrength exactly. Duplicated rather
// than imported since it isn't exported there, and this module's scope
// excludes touching SignupPage.tsx.
function getPasswordStrength(password: string): PasswordStrength {
  const hasMinLength = password.length >= 8
  const hasNumber = /\d/.test(password)
  const hasUppercase = /[A-Z]/.test(password)

  if (!hasMinLength) return { score: password.length > 0 ? 1 : 0, label: 'Weak', color: 'bg-red-500' }
  if (hasMinLength && hasNumber && hasUppercase) return { score: 4, label: 'Strong', color: 'bg-green-500' }
  if (hasMinLength && hasNumber) return { score: 3, label: 'Good', color: 'bg-yellow-500' }
  return { score: 2, label: 'Fair', color: 'bg-amber-500' }
}

// Login/Signup only ever surface Cognito errors as a single general banner --
// there's no existing precedent for mapping a server error code to a specific
// field. This reuses SignupPage's FieldErrors display pattern (the field-level
// <p> under each input) and sources it from the response's `code` instead of
// pure client validation; PROVIDER_ERROR (or an unrecognized code) still falls
// back to the general banner the other auth pages use.
function fieldErrorsFromResponse(response: ConfirmForgotPasswordResponse): {
  fieldErrors: FieldErrors
  generalError: string | null
} {
  const message = response.error ?? 'Something went wrong. Please try again.'
  switch (response.code) {
    case 'INVALID_CODE':
    case 'CODE_EXPIRED':
      return { fieldErrors: { code: message }, generalError: null }
    case 'INVALID_PASSWORD':
      return { fieldErrors: { newPassword: message }, generalError: null }
    default:
      return { fieldErrors: {}, generalError: message }
  }
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strength = getPasswordStrength(newPassword)

  function validate(): boolean {
    const nextErrors: FieldErrors = {}
    if (!code.trim()) nextErrors.code = 'Enter the code we sent you'
    if (newPassword.length < 8) nextErrors.newPassword = 'Password must be at least 8 characters'
    if (confirmNewPassword !== newPassword) nextErrors.confirmNewPassword = 'Passwords do not match'
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!validate()) return

    setLoading(true)
    try {
      const response = await confirmForgotPassword(email.trim(), code.trim(), newPassword)
      if (response.success) {
        toast.show('Password reset. Please sign in.', 'success')
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
            Reset your password
          </h1>
          <p className="text-sm text-gray-500 mb-8">Enter the code we sent you and choose a new password.</p>

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
              <label className={labelClasses}>Reset code</label>
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

            <div className="mt-4">
              <label className={labelClasses}>New password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
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
              {fieldErrors.newPassword && <p className={fieldErrorClasses}>{fieldErrors.newPassword}</p>}

              {newPassword.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className={`h-1.5 flex-1 rounded-full ${i < strength.score ? strength.color : 'bg-gray-200'}`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{strength.label}</p>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className={labelClasses}>Confirm new password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  autoComplete="new-password"
                  className={`${inputClasses} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {fieldErrors.confirmNewPassword && <p className={fieldErrorClasses}>{fieldErrors.confirmNewPassword}</p>}
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
              {loading ? 'Resetting...' : 'Reset password'}
            </button>
          </form>

          <p className="text-center mt-6 text-sm text-gray-500">
            <Link to="/forgot-password" className="font-semibold text-violet-600 hover:text-violet-700">
              Didn&apos;t get a code? Request another
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
