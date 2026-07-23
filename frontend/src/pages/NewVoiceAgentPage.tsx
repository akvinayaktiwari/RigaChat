import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BookOpen, Check, Globe, Info, Loader2, Lock, Mail, Volume2 } from 'lucide-react'
import { createVoiceAgent, getMySubscription } from '../services/api'
import type { VoiceAgentVoice } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const TOTAL_STEPS = 4
const STEP_LABELS = ['Basic Info', 'Voice', 'Widget', 'Review']

const VOICE_OPTIONS: { value: VoiceAgentVoice; label: string; description: string }[] = [
  { value: 'alloy', label: 'Alloy', description: 'Neutral & balanced' },
  { value: 'echo', label: 'Echo', description: 'Clear & precise' },
  { value: 'shimmer', label: 'Shimmer', description: 'Warm & friendly' },
  { value: 'nova', label: 'Nova', description: 'Energetic & bright' },
  { value: 'onyx', label: 'Onyx', description: 'Deep & authoritative' },
  { value: 'fable', label: 'Fable', description: 'Expressive & dynamic' },
]

const WIDGET_POSITION_OPTIONS: { value: FormData['widgetPosition']; label: string }[] = [
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-center', label: 'Bottom Center' },
]

const SESSION_DURATION_OPTIONS: { value: FormData['maxSessionDuration']; label: string }[] = [
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
]

type FlowType = 'website' | 'kb_only'

const FLOW_OPTIONS: {
  value: FlowType
  icon: typeof Globe
  title: string
  description: string
  badge: string
  badgeClasses: string
}[] = [
  {
    value: 'website',
    icon: Globe,
    title: 'Train from website',
    description:
      'Enter your website URL. Our crawler automatically reads your pages and trains your voice agent on your content.',
    badge: 'Recommended',
    badgeClasses: 'bg-violet-100 text-violet-700',
  },
  {
    value: 'kb_only',
    icon: BookOpen,
    title: 'Add manually',
    description:
      'Skip the crawler. Add FAQs, product details, and policies directly as knowledge base entries.',
    badge: 'Great for SPAs',
    badgeClasses: 'bg-gray-100 text-gray-600',
  },
]

interface FormData {
  name: string
  websiteUrl: string
  greetingMessage: string
  voice: VoiceAgentVoice
  brandColor: string
  widgetPosition: 'bottom-left' | 'bottom-right' | 'bottom-center'
  maxSessionDuration: 5 | 10 | 15
}

const INITIAL_FORM_DATA: FormData = {
  name: '',
  websiteUrl: '',
  greetingMessage: "Hi! I'm your AI voice assistant. How can I help you today?",
  voice: 'shimmer',
  brandColor: '#7c3aed',
  widgetPosition: 'bottom-right',
  maxSessionDuration: 10,
}

const inputClasses =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'
const hintClasses = 'text-xs text-gray-400 mt-1'

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed'
const secondaryButtonClasses =
  'bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center max-w-2xl mx-auto">
      {STEP_LABELS.map((label, i) => {
        const stepNum = i + 1
        const isActive = stepNum === currentStep
        const isDone = stepNum < currentStep

        return (
          <div key={label} className={`flex items-center ${i < STEP_LABELS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                  isDone || isActive
                    ? 'bg-violet-600 text-white'
                    : 'border-2 border-gray-200 text-gray-400 bg-white'
                }`}
              >
                {isDone ? <Check size={16} /> : stepNum}
              </div>
              <span
                className={`text-xs mt-2 ${
                  isActive ? 'text-violet-700 font-medium' : isDone ? 'text-violet-600' : 'text-gray-400'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 ${isDone ? 'bg-violet-600' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function NewVoiceAgentPage() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [flowType, setFlowType] = useState<FlowType>('website')
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [websiteUrlError, setWebsiteUrlError] = useState<string | null>(null)
  const [brandColorError, setBrandColorError] = useState<string | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [voiceEnabled, setVoiceEnabled] = useState(false)

  // Route-level gate, independent of VoiceAgentsPage's button visibility —
  // this component re-checks on every mount, so direct navigation to
  // /dashboard/voice-agents/new can't bypass the entitlement.
  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await getMySubscription()
        setVoiceEnabled(res.success && res.data ? res.data.features.voice.enabled : false)
      } catch (err) {
        console.error('Failed to check voice entitlement:', err)
        setVoiceEnabled(false)
      } finally {
        setCheckingAccess(false)
      }
    }
    checkAccess()
  }, [])

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  function handleNext() {
    if (currentStep === 1 && flowType === 'website') {
      if (!/^https?:\/\//.test(formData.websiteUrl)) {
        setWebsiteUrlError('Website URL must start with http:// or https://')
        return
      }
    }

    if (currentStep === 3) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(formData.brandColor)) {
        setBrandColorError('Enter a valid hex color, e.g. #7c3aed')
        return
      }
    }

    setCurrentStep((s) => s + 1)
  }

  function handleBack() {
    setCurrentStep((s) => s - 1)
  }

  async function handleLaunch() {
    setLoading(true)
    setError(null)

    try {
      const res = await createVoiceAgent({
        name: formData.name,
        voice: formData.voice,
        greetingMessage: formData.greetingMessage,
        ...(flowType === 'website' ? { websiteUrl: formData.websiteUrl } : {}),
        brandColor: formData.brandColor,
        widgetPosition: formData.widgetPosition,
        maxSessionDuration: formData.maxSessionDuration,
      })

      if (!res.success || !res.data) {
        setError(res.error ?? 'Failed to create voice agent')
        setLoading(false)
        return
      }

      if (flowType === 'kb_only') {
        navigate(`/dashboard/voice-agents/${res.data.agentId}`)
        return
      }

      navigate('/dashboard/voice-agents')
    } catch (err) {
      console.error('Failed to create voice agent:', err)
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const isNextDisabled =
    currentStep === 1 &&
    (!formData.name.trim() ||
      (flowType === 'website' && !formData.websiteUrl.trim()) ||
      !formData.greetingMessage.trim())

  if (checkingAccess) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-violet-400" size={28} />
      </div>
    )
  }

  if (!voiceEnabled) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => navigate('/dashboard/voice-agents')}
            title="Back to Voice Agents"
            className="text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
              Create New Voice Agent
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-10 shadow-sm border border-black/5 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-violet-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            Voice Agents are an add-on
          </h2>
          <p className="text-sm text-gray-500 max-w-sm mb-6">
            Voice Agents aren&apos;t included in your current plan. Contact us to enable this for your account.
          </p>
          <a
            href="mailto:support@vyostra.com?subject=Enable Voice Agents for my account"
            className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
          >
            <Mail size={16} />
            Contact us
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate('/dashboard/voice-agents')}
          title="Back to Voice Agents"
          className="text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
            Create New Voice Agent
          </h1>
          <p className="text-sm text-gray-500">Set up your AI voice agent in minutes</p>
        </div>
      </div>

      <StepIndicator currentStep={currentStep} />

      <div className="bg-white rounded-2xl p-8 shadow-sm border border-black/5 mt-6">
        {currentStep === 1 && (
          <div className="space-y-5">
            <div>
              <label className={labelClasses}>Agent Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g. Wonderise Voice Assistant"
                className={inputClasses}
              />
              <p className={hintClasses}>This is what visitors will see</p>
            </div>

            <div>
              <h2 className="font-bold text-xl text-gray-900 mb-2" style={JAKARTA_FONT}>
                How do you want to train your voice agent?
              </h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">You can always add more content later.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FLOW_OPTIONS.map((option) => {
                  const Icon = option.icon
                  const isSelected = flowType === option.value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFlowType(option.value)}
                      className={`relative text-left rounded-2xl p-6 transition-all ${
                        isSelected
                          ? 'border-2 border-violet-600 bg-violet-50 shadow-md'
                          : 'border border-gray-200 cursor-pointer hover:border-violet-300 hover:shadow-md'
                      }`}
                    >
                      <span
                        className={`absolute top-4 right-4 text-xs font-semibold px-2 py-1 rounded-full ${option.badgeClasses}`}
                      >
                        {option.badge}
                      </span>
                      <Icon className="text-violet-600 mb-3" size={28} />
                      <p className="font-semibold text-gray-900" style={JAKARTA_FONT}>
                        {option.title}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">{option.description}</p>
                    </button>
                  )
                })}
              </div>

              {flowType === 'website' ? (
                <div className="mt-4">
                  <label className={labelClasses}>Website URL</label>
                  <input
                    type="url"
                    value={formData.websiteUrl}
                    onChange={(e) => {
                      update('websiteUrl', e.target.value)
                      setWebsiteUrlError(null)
                    }}
                    placeholder="https://yourwebsite.com"
                    className={inputClasses}
                  />
                  {websiteUrlError && <p className="text-xs text-red-500 mt-1">{websiteUrlError}</p>}
                  <p className={hintClasses}>We&apos;ll crawl your site to train the agent</p>
                </div>
              ) : (
                <div className="mt-4 bg-violet-50 border border-violet-100 rounded-xl p-4 text-sm text-violet-700 flex gap-3">
                  <Info size={18} className="shrink-0 mt-0.5" />
                  <p>
                    Your voice agent will be ready immediately. After setup, you&apos;ll be guided to add your
                    first knowledge base entry.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className={labelClasses}>Greeting Message</label>
              <textarea
                rows={3}
                value={formData.greetingMessage}
                onChange={(e) => update('greetingMessage', e.target.value)}
                placeholder="Hi! I'm your AI voice assistant. How can I help you today?"
                className={inputClasses}
              />
              <p className={hintClasses}>First message visitors will hear</p>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <h2 className="font-bold text-xl text-gray-900 mb-4" style={JAKARTA_FONT}>
              Choose a voice for your agent
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {VOICE_OPTIONS.map((option) => {
                const isSelected = formData.voice === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update('voice', option.value)}
                    className={`flex items-start gap-3 text-left rounded-xl p-4 transition-all ${
                      isSelected
                        ? 'border-2 border-violet-600 bg-violet-50'
                        : 'border border-gray-200 hover:border-violet-300'
                    }`}
                  >
                    <Volume2 size={18} className="text-violet-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{option.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <label className={labelClasses}>Brand Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.brandColor}
                  onChange={(e) => {
                    update('brandColor', e.target.value)
                    setBrandColorError(null)
                  }}
                  className="w-12 h-12 rounded-xl cursor-pointer border-0 shrink-0"
                  aria-label="Brand color picker"
                />
                <input
                  type="text"
                  value={formData.brandColor}
                  onChange={(e) => {
                    update('brandColor', e.target.value)
                    setBrandColorError(null)
                  }}
                  className={`flex-1 ${inputClasses}`}
                />
              </div>
              {brandColorError && <p className="text-xs text-red-500 mt-1">{brandColorError}</p>}
            </div>

            <div>
              <label className={labelClasses}>Widget Position</label>
              <select
                value={formData.widgetPosition}
                onChange={(e) => update('widgetPosition', e.target.value as FormData['widgetPosition'])}
                className={inputClasses}
              >
                {WIDGET_POSITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClasses}>Max Session Duration</label>
              <select
                value={formData.maxSessionDuration}
                onChange={(e) =>
                  update('maxSessionDuration', Number(e.target.value) as FormData['maxSessionDuration'])
                }
                className={inputClasses}
              >
                {SESSION_DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="mt-3 bg-violet-50 border border-violet-100 rounded-xl p-4 text-sm text-violet-700">
                Longer sessions increase API usage costs. 10 minutes is recommended for most use cases.
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div>
            <h2 className="font-bold text-xl text-gray-900 mb-4" style={JAKARTA_FONT}>
              Review and Launch
            </h2>

            <div className="bg-gray-50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Agent Name</span>
                <span className="text-sm font-bold text-gray-900">{formData.name}</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Training source</span>
                {flowType === 'kb_only' ? (
                  <span className="text-violet-600 font-medium text-sm">Knowledge Base only</span>
                ) : (
                  <span className="text-sm text-gray-700">{formData.websiteUrl}</span>
                )}
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Voice</span>
                <span className="text-sm font-bold text-gray-900 capitalize">{formData.voice}</span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Brand Color</span>
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <span
                    className="w-5 h-5 rounded-full border border-gray-200"
                    style={{ backgroundColor: formData.brandColor }}
                  />
                  {formData.brandColor}
                </span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Widget Position</span>
                <span className="text-sm font-bold text-gray-900">
                  {WIDGET_POSITION_OPTIONS.find((o) => o.value === formData.widgetPosition)?.label}
                </span>
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Max Session Duration</span>
                <span className="text-sm font-bold text-gray-900">{formData.maxSessionDuration} minutes</span>
              </div>
            </div>

            {flowType === 'website' && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                After launching, your agent will crawl your website and index it. This takes 30–60 seconds.
              </div>
            )}

            <button
              type="button"
              onClick={handleLaunch}
              disabled={loading}
              className={`w-full mt-6 py-4 text-lg flex items-center justify-center gap-2 ${primaryButtonClasses}`}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Launching...
                </>
              ) : (
                'Launch Voice Agent'
              )}
            </button>

            {error && <p className="text-sm text-red-500 mt-3 text-center">{error}</p>}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
          className={`px-6 py-3 text-sm ${secondaryButtonClasses}`}
        >
          &larr; Back
        </button>
        {currentStep < TOTAL_STEPS && (
          <button
            type="button"
            onClick={handleNext}
            disabled={isNextDisabled}
            className={`px-6 py-3 text-sm ${primaryButtonClasses}`}
          >
            Next &rarr;
          </button>
        )}
      </div>
    </div>
  )
}
