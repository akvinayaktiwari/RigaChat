import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  DollarSign,
  Globe,
  Home,
  Info,
  Loader2,
  Lock,
  Mail,
  Phone,
  User,
} from 'lucide-react'
import { confirmBotIndexing, getMyBots, getMySubscription, setupBot, startBotIndexing } from '../services/api'
import { Toggle } from '../components/Toggle'
import { translateEntitlementError } from '../lib/entitlementErrors'
import type { BotConfig, LeadFormField } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const TOTAL_STEPS = 4
const STEP_LABELS = ['Website', 'Appearance', 'Lead Form', 'Review']

const WIDGET_TRIGGER_OPTIONS: { value: BotConfig['widgetTrigger']; title: string; description: string }[] = [
  { value: 'immediate', title: 'Immediately', description: 'Appears as soon as page loads' },
  { value: 'delay_5s', title: 'After 5 seconds', description: 'Gives visitors time to read' },
  { value: 'scroll_50', title: 'After scrolling 50%', description: 'Shows when visitor is engaged' },
  { value: 'exit_intent', title: 'Exit Intent', description: 'Appears when visitor is leaving' },
]

const WIDGET_TRIGGER_LABELS: Record<BotConfig['widgetTrigger'], string> = {
  immediate: 'Immediately',
  delay_5s: 'After 5 seconds',
  scroll_50: 'After scrolling 50%',
  exit_intent: 'Exit Intent',
}

const DEFAULT_LEAD_FORM_FIELDS: LeadFormField[] = [
  { fieldId: 'name', label: 'Your Name', type: 'text', required: true },
  { fieldId: 'phone', label: 'Phone Number', type: 'phone', required: true },
  { fieldId: 'email', label: 'Email Address', type: 'email', required: true },
  { fieldId: 'propertyInterest', label: 'Property Interest', type: 'text', required: false },
  { fieldId: 'budgetRange', label: 'Budget Range', type: 'text', required: false },
]

const FIELD_ICONS: Record<string, typeof User> = {
  name: User,
  phone: Phone,
  email: Mail,
  propertyInterest: Home,
  budgetRange: DollarSign,
}

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
      'Enter your website URL. Our crawler automatically reads your pages and trains your chatbot on your content.',
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

const PRESET_COLORS = ['#7c3aed', '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#0f172a']

const WEBSITE_URL_REGEX = /^https?:\/\/[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/.*)?$/

function isValidWebsiteUrl(value: string): boolean {
  return WEBSITE_URL_REGEX.test(value)
}

interface FormData {
  name: string
  websiteUrl: string
  greetingMessage: string
  brandColor: string
  widgetTrigger: BotConfig['widgetTrigger']
  leadTriggerAfterMessages: number
  leadFormFields: LeadFormField[]
  propertyInterestEnabled: boolean
  budgetRangeEnabled: boolean
}

const INITIAL_FORM_DATA: FormData = {
  name: '',
  websiteUrl: '',
  greetingMessage: "Hi! I'm here to help. What can I assist you with today?",
  brandColor: '#6366f1',
  widgetTrigger: 'delay_5s',
  leadTriggerAfterMessages: 2,
  leadFormFields: DEFAULT_LEAD_FORM_FIELDS,
  propertyInterestEnabled: true,
  budgetRangeEnabled: true,
}

type LaunchStep = 'form' | 'creating' | 'confirmation_required'

interface StepErrors {
  name?: string
  websiteUrl?: string
  brandColor?: string
}

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

function isValidHexColor(value: string): boolean {
  return HEX_COLOR_REGEX.test(value)
}

const inputClasses =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-colors'
const inputErrorClasses = 'border-red-400 focus:border-red-400 focus:ring-red-100'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'
const hintClasses = 'text-xs text-gray-400 mt-1'

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed'
const secondaryButtonClasses =
  'bg-white text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors'

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

export default function NewBotPage() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [flowType, setFlowType] = useState<FlowType>('website')
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA)
  const [errors, setErrors] = useState<StepErrors>({})
  const [launchStep, setLaunchStep] = useState<LaunchStep>('form')
  const [botId, setBotId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [selectedPages, setSelectedPages] = useState(0)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(true)
  const [atCap, setAtCap] = useState(false)
  const [agentsLimit, setAgentsLimit] = useState<number | null>(null)

  // Route-level gate, independent of BotsPage's button visibility — this
  // re-checks on every mount, so direct navigation to /dashboard/bots/new
  // can't bypass the cap. Mirrors NewVoiceAgentPage's checkAccess effect.
  useEffect(() => {
    async function checkAccess() {
      try {
        const [subRes, botsRes] = await Promise.all([getMySubscription(), getMyBots()])
        const limit = subRes.success && subRes.data ? subRes.data.features.agents.limits.max : null
        const count = botsRes.success && botsRes.data ? botsRes.data.length : 0
        setAgentsLimit(limit)
        setAtCap(limit !== null && count >= limit)
      } catch (err) {
        console.error('Failed to check chatbot entitlement:', err)
      } finally {
        setCheckingAccess(false)
      }
    }
    checkAccess()
  }, [])

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  function validateStep(step: number): boolean {
    const nextErrors: StepErrors = {}

    if (step === 1) {
      if (formData.name.trim().length < 2) {
        nextErrors.name = 'Chatbot name must be at least 2 characters'
      }
      if (flowType === 'website') {
        const url = formData.websiteUrl.trim()
        if (!url) {
          nextErrors.websiteUrl = 'Website URL is required'
        } else if (!isValidWebsiteUrl(url)) {
          nextErrors.websiteUrl = 'Enter a valid URL starting with http:// or https://'
        }
      }
    }

    if (step === 2) {
      if (!isValidHexColor(formData.brandColor)) {
        nextErrors.brandColor = 'Enter a valid hex color, e.g. #6366f1'
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  function handleNext() {
    if (!validateStep(currentStep)) return
    setErrors({})
    setCurrentStep((s) => s + 1)
  }

  function handleBack() {
    setErrors({})
    setCurrentStep((s) => s - 1)
  }

  async function handleLaunch() {
    setLaunchStep('creating')
    setLaunchError(null)

    const enabledFields = formData.leadFormFields.filter((field) => {
      if (field.fieldId === 'propertyInterest') return formData.propertyInterestEnabled
      if (field.fieldId === 'budgetRange') return formData.budgetRangeEnabled
      return true
    })

    try {
      const res = await setupBot({
        name: formData.name,
        ...(flowType === 'website' ? { websiteUrl: formData.websiteUrl } : {}),
        greetingMessage: formData.greetingMessage,
        brandColor: formData.brandColor,
        widgetTrigger: formData.widgetTrigger,
        leadTriggerAfterMessages: formData.leadTriggerAfterMessages,
        leadFormFields: enabledFields,
      })

      if (!res.success || !res.data) {
        setLaunchError(translateEntitlementError(res) ?? res.error ?? 'Failed to create chatbot')
        setLaunchStep('form')
        return
      }

      const newBotId = res.data.bot.botId

      if (flowType === 'kb_only') {
        navigate(`/dashboard/kb/${newBotId}`)
        return
      }

      setBotId(newBotId)

      const indexRes = await startBotIndexing(newBotId, formData.websiteUrl)
      if (!indexRes.success || !indexRes.data) {
        setLaunchError(indexRes.error ?? 'Bot created, but indexing failed to start')
        setLaunchStep('form')
        return
      }

      if (indexRes.data.status === 'confirmation_required') {
        setJobId(indexRes.data.jobId)
        setTotalPages(indexRes.data.totalPages)
        setSelectedPages(indexRes.data.selectedPages ?? 50)
        setLaunchStep('confirmation_required')
      } else {
        navigate(`/dashboard/bots/${newBotId}`)
      }
    } catch {
      setLaunchError('Something went wrong. Please try again.')
      setLaunchStep('form')
    }
  }

  async function handleConfirmIndexing() {
    if (!botId || !jobId) return
    try {
      await confirmBotIndexing(botId, jobId)
      navigate(`/dashboard/bots/${botId}`)
    } catch {
      setLaunchError('Something went wrong. Please try again.')
    }
  }

  const isNextDisabled =
    currentStep === 1 && flowType === 'website' && !isValidWebsiteUrl(formData.websiteUrl.trim())

  const enabledFieldLabels = formData.leadFormFields
    .filter((field) => {
      if (field.fieldId === 'propertyInterest') return formData.propertyInterestEnabled
      if (field.fieldId === 'budgetRange') return formData.budgetRangeEnabled
      return true
    })
    .map((field) => field.label)
    .join(', ')

  if (checkingAccess) {
    return (
      <div className="max-w-2xl mx-auto flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-violet-400" size={28} />
      </div>
    )
  }

  if (atCap) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => navigate('/dashboard/bots')}
            title="Back to Chatbots"
            className="text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
              Create New Chatbot
            </h1>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-10 shadow-sm border border-black/5 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2" style={JAKARTA_FONT}>
            Chatbot limit reached
          </h2>
          <p className="text-sm text-gray-500 max-w-sm mb-6">
            You&apos;ve reached your plan&apos;s limit of {agentsLimit} chatbot{agentsLimit === 1 ? '' : 's'}.
            Upgrade to add more.
          </p>
          <a
            href="mailto:support@vyostra.com?subject=Upgrade my BeepBoop plan"
            className="inline-flex items-center gap-2 bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold px-4 py-2.5 rounded-xl text-sm shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity"
          >
            <Mail size={16} />
            Contact us to upgrade
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
          onClick={() => navigate('/dashboard/bots')}
          title="Back to Chatbots"
          className="text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
            Create New Chatbot
          </h1>
          <p className="text-sm text-gray-500">Set up your AI chatbot in minutes</p>
        </div>
      </div>

      {launchStep === 'form' && <StepIndicator currentStep={currentStep} />}

      <div className="bg-white rounded-2xl p-8 shadow-sm border border-black/5 mt-6">
        {launchStep === 'creating' || launchStep === 'confirmation_required' ? (
          <div className="flex flex-col items-center text-center py-12">
            <Loader2 className="animate-spin text-violet-600" size={48} />
            <p className="text-gray-500 text-sm mt-2">Creating your bot...</p>
          </div>
        ) : (
          <>
            {currentStep === 1 && (
              <div className="space-y-5">
                <div>
                  <label className={labelClasses}>Chatbot Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => update('name', e.target.value)}
                    placeholder="e.g. Wonderise Assistant"
                    className={`${inputClasses} ${errors.name ? inputErrorClasses : ''}`}
                  />
                  {errors.name ? (
                    <p className="text-xs text-red-500 mt-1">{errors.name}</p>
                  ) : (
                    <p className={hintClasses}>This is what visitors will see</p>
                  )}
                </div>

                <div>
                  <h2 className="font-bold text-xl text-gray-900 mb-2" style={JAKARTA_FONT}>
                    How do you want to train your bot?
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
                        onChange={(e) => update('websiteUrl', e.target.value)}
                        placeholder="https://yourwebsite.com"
                        className={`${inputClasses} ${errors.websiteUrl ? inputErrorClasses : ''}`}
                      />
                      {errors.websiteUrl ? (
                        <p className="text-xs text-red-500 mt-1">{errors.websiteUrl}</p>
                      ) : (
                        <p className={hintClasses}>We&apos;ll crawl up to 50 pages</p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 bg-violet-50 border border-violet-100 rounded-xl p-4 text-sm text-violet-700 flex gap-3">
                      <Info size={18} className="shrink-0 mt-0.5" />
                      <p>
                        Your bot will be ready immediately. After setup, you&apos;ll be guided to add your first
                        knowledge base entry.
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
                    className={inputClasses}
                  />
                  <p className={hintClasses}>First message visitors will see</p>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <label className={labelClasses}>Brand Color</label>

                  <div className="flex items-center gap-2.5 mb-3">
                    {PRESET_COLORS.map((preset) => {
                      const isSelected = formData.brandColor.toLowerCase() === preset.toLowerCase()
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => update('brandColor', preset)}
                          aria-label={`Use color ${preset}`}
                          className={`w-8 h-8 rounded-full transition-all ${
                            isSelected ? 'ring-2 ring-violet-600 ring-offset-2' : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: preset }}
                        />
                      )
                    })}
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={isValidHexColor(formData.brandColor) ? formData.brandColor : '#6366f1'}
                      onChange={(e) => update('brandColor', e.target.value)}
                      className="w-12 h-12 rounded-xl cursor-pointer border-0 shrink-0"
                      aria-label="Custom brand color picker"
                    />
                    <input
                      type="text"
                      value={formData.brandColor}
                      onChange={(e) => update('brandColor', e.target.value)}
                      className={`flex-1 ${inputClasses} ${errors.brandColor ? inputErrorClasses : ''}`}
                    />
                  </div>
                  {errors.brandColor && <p className="text-xs text-red-500 mt-1">{errors.brandColor}</p>}
                </div>

                <div>
                  <label className={labelClasses}>When should the chat bubble appear?</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {WIDGET_TRIGGER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => update('widgetTrigger', option.value)}
                        className={`text-left rounded-xl p-4 transition-all ${
                          formData.widgetTrigger === option.value
                            ? 'border-2 border-violet-600 bg-violet-50'
                            : 'border border-gray-200 hover:border-violet-300'
                        }`}
                      >
                        <p className="text-sm font-medium text-gray-900">{option.title}</p>
                        <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelClasses}>Capture lead after how many messages?</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.leadTriggerAfterMessages}
                    onChange={(e) =>
                      update('leadTriggerAfterMessages', Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                    }
                    className={`${inputClasses} max-w-[120px]`}
                  />
                  <p className={hintClasses}>Chatbot will ask for contact details after this many exchanges</p>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div>
                <h2 className="font-bold text-xl text-gray-900 mb-2" style={JAKARTA_FONT}>
                  Configure Lead Form Fields
                </h2>
                <p className="text-sm text-gray-500 mt-1 mb-5">
                  These fields will be shown to visitors when your chatbot captures a lead
                </p>

                <div className="space-y-3">
                  {formData.leadFormFields.map((field) => {
                    const Icon = FIELD_ICONS[field.fieldId] ?? User
                    const isOptionalField = field.fieldId === 'propertyInterest' || field.fieldId === 'budgetRange'
                    const isEnabled =
                      field.fieldId === 'propertyInterest'
                        ? formData.propertyInterestEnabled
                        : field.fieldId === 'budgetRange'
                          ? formData.budgetRangeEnabled
                          : true

                    return (
                      <div
                        key={field.fieldId}
                        className="bg-gray-50 rounded-xl p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={18} className="text-gray-500" />
                          <span className="text-sm font-medium text-gray-900">{field.label}</span>
                        </div>

                        {!isOptionalField ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold px-2.5 py-1 rounded-full">
                            Required
                          </span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                                isEnabled
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-gray-100 text-gray-500 border-gray-200'
                              }`}
                            >
                              {isEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                            <Toggle
                              checked={isEnabled}
                              onChange={(checked) =>
                                update(
                                  field.fieldId === 'propertyInterest'
                                    ? 'propertyInterestEnabled'
                                    : 'budgetRangeEnabled',
                                  checked
                                )
                              }
                              title={`Toggle ${field.label}`}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
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
                    <span className="text-sm text-gray-500">Chatbot Name</span>
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
                    <span className="text-sm text-gray-500">Widget Trigger</span>
                    <span className="text-sm font-bold text-gray-900">
                      {WIDGET_TRIGGER_LABELS[formData.widgetTrigger]}
                    </span>
                  </div>
                  <div className="h-px bg-gray-100" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Lead Capture</span>
                    <span className="text-sm font-bold text-gray-900">
                      After {formData.leadTriggerAfterMessages} messages
                    </span>
                  </div>
                  <div className="h-px bg-gray-100" />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-gray-500 shrink-0">Lead Form Fields</span>
                    <span className="text-sm font-bold text-gray-900 text-right">{enabledFieldLabels}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLaunch}
                  className={`w-full mt-6 py-4 text-lg ${primaryButtonClasses}`}
                >
                  Launch Chatbot 🚀
                </button>

                {launchError && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" />
                    {launchError}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {launchStep === 'form' && (
        <div className="flex items-center justify-between mt-6">
          {currentStep > 1 ? (
            <button type="button" onClick={handleBack} className={`px-6 py-3 text-sm ${secondaryButtonClasses}`}>
              &larr; Back
            </button>
          ) : (
            <div />
          )}
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
      )}

      {launchStep === 'confirmation_required' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl shadow-black/8 border border-gray-100 p-6 max-w-md w-full">
            <h2 className="font-bold text-xl text-gray-900 mb-4" style={JAKARTA_FONT}>
              Large Website Detected
            </h2>
            <p className="text-sm text-gray-500 -mt-3">
              Found {totalPages} pages. We will index the {selectedPages} most relevant pages.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => navigate('/dashboard/bots')}
                className={`px-4 py-2.5 text-sm ${secondaryButtonClasses}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmIndexing}
                className={`px-4 py-2.5 text-sm ${primaryButtonClasses}`}
              >
                Continue with {selectedPages} pages
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
