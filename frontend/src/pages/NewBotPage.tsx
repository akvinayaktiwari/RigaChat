import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  DollarSign,
  Home,
  Loader2,
  Mail,
  Phone,
  User,
} from 'lucide-react'
import { confirmBotIndexing, setupBot, startBotIndexing } from '../services/api'
import { Toggle } from '../components/Toggle'
import { IndexingProgress } from '../components/IndexingProgress'
import type { BotConfig, LeadFormField } from '../types/index'

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

type LaunchStep = 'form' | 'creating' | 'confirmation_required' | 'indexing'

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
  'w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all'
const inputErrorClasses = 'border-red-400 focus:ring-red-400'
const labelClasses = 'block text-sm font-medium text-slate-700 mb-2'
const hintClasses = 'text-xs text-slate-400 mt-1'

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
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isActive
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-200 text-slate-400'
                }`}
              >
                {isDone ? <Check size={16} /> : stepNum}
              </div>
              <span
                className={`text-xs mt-2 ${
                  isActive ? 'text-indigo-600 font-medium' : isDone ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 ${isDone ? 'bg-emerald-500' : 'bg-slate-200'}`} />
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
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA)
  const [errors, setErrors] = useState<StepErrors>({})
  const [launchStep, setLaunchStep] = useState<LaunchStep>('form')
  const [botId, setBotId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [selectedPages, setSelectedPages] = useState(0)
  const [launchError, setLaunchError] = useState<string | null>(null)

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  function validateStep(step: number): boolean {
    const nextErrors: StepErrors = {}

    if (step === 1) {
      if (formData.name.trim().length < 2) {
        nextErrors.name = 'Chatbot name must be at least 2 characters'
      }
      if (!formData.websiteUrl.trim()) {
        nextErrors.websiteUrl = 'Website URL is required'
      } else if (!/^https?:\/\//.test(formData.websiteUrl.trim())) {
        nextErrors.websiteUrl = 'URL must start with http:// or https://'
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
        websiteUrl: formData.websiteUrl,
        greetingMessage: formData.greetingMessage,
        brandColor: formData.brandColor,
        widgetTrigger: formData.widgetTrigger,
        leadTriggerAfterMessages: formData.leadTriggerAfterMessages,
        leadFormFields: enabledFields,
      })

      if (!res.success || !res.data) {
        setLaunchError(res.error ?? 'Failed to create chatbot')
        setLaunchStep('form')
        return
      }

      const newBotId = res.data.bot.botId
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
        setLaunchStep('indexing')
      }
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Failed to launch chatbot')
      setLaunchStep('form')
    }
  }

  async function handleConfirmIndexing() {
    if (!botId || !jobId) return
    try {
      await confirmBotIndexing(botId, jobId)
      setLaunchStep('indexing')
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Failed to confirm indexing')
    }
  }

  const enabledFieldLabels = formData.leadFormFields
    .filter((field) => {
      if (field.fieldId === 'propertyInterest') return formData.propertyInterestEnabled
      if (field.fieldId === 'budgetRange') return formData.budgetRangeEnabled
      return true
    })
    .map((field) => field.label)
    .join(', ')

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate('/dashboard/bots')}
          title="Back to Chatbots"
          className="text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-2xl text-slate-800">Create New Chatbot</h1>
          <p className="text-sm text-slate-500">Set up your AI chatbot in minutes</p>
        </div>
      </div>

      {launchStep === 'form' && <StepIndicator currentStep={currentStep} />}

      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 mt-6">
        {launchStep === 'indexing' && botId ? (
          <div className="py-6">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                <Loader2 className="text-indigo-600 animate-spin" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Building Your Chatbot</h2>
              <p className="text-slate-500 mt-2">We&apos;re crawling your site and indexing content</p>
            </div>
            <IndexingProgress
              botId={botId}
              onComplete={() => navigate(`/dashboard/bots/${botId}`)}
              onError={(err) => setLaunchError(err)}
            />
            {launchError && <p className="text-sm text-red-500 mt-3 text-center">{launchError}</p>}
          </div>
        ) : launchStep === 'creating' || launchStep === 'confirmation_required' ? (
          <div className="flex flex-col items-center text-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={48} />
            <p className="text-slate-500 text-sm mt-2">Creating your bot...</p>
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
                    <p className={hintClasses}>We will scan this website to train your chatbot</p>
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
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={isValidHexColor(formData.brandColor) ? formData.brandColor : '#6366f1'}
                      onChange={(e) => update('brandColor', e.target.value)}
                      className="w-12 h-12 rounded-xl cursor-pointer border-0"
                      aria-label="Brand color picker"
                    />
                    <input
                      type="text"
                      value={formData.brandColor}
                      onChange={(e) => update('brandColor', e.target.value)}
                      className={`flex-1 px-4 py-3 border rounded-xl text-sm ${
                        errors.brandColor ? 'border-red-400' : 'border-slate-200'
                      }`}
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
                        className={`text-left border rounded-xl p-4 cursor-pointer hover:border-indigo-300 transition-all ${
                          formData.widgetTrigger === option.value
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200'
                        }`}
                      >
                        <p className="text-sm font-medium text-slate-800">{option.title}</p>
                        <p className="text-xs text-slate-500 mt-1">{option.description}</p>
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
                <h2 className="font-bold text-lg text-slate-800">Configure Lead Form Fields</h2>
                <p className="text-sm text-slate-500 mt-1 mb-5">
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
                        className="bg-slate-50 rounded-xl p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={18} className="text-slate-500" />
                          <span className="text-sm font-medium text-slate-800">{field.label}</span>
                        </div>

                        {!isOptionalField ? (
                          <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full">
                            Required
                          </span>
                        ) : (
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${
                                isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
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
                <h2 className="font-bold text-lg text-slate-800 mb-4">Review and Launch</h2>

                <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Chatbot Name</span>
                    <span className="text-sm font-bold text-slate-800">{formData.name}</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Website URL</span>
                    <span className="text-sm font-bold text-slate-800">{formData.websiteUrl}</span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Brand Color</span>
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <span
                        className="w-5 h-5 rounded-full border border-slate-200"
                        style={{ backgroundColor: formData.brandColor }}
                      />
                      {formData.brandColor}
                    </span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Widget Trigger</span>
                    <span className="text-sm font-bold text-slate-800">
                      {WIDGET_TRIGGER_LABELS[formData.widgetTrigger]}
                    </span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Lead Capture</span>
                    <span className="text-sm font-bold text-slate-800">
                      After {formData.leadTriggerAfterMessages} messages
                    </span>
                  </div>
                  <div className="h-px bg-slate-200" />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-500 shrink-0">Lead Form Fields</span>
                    <span className="text-sm font-bold text-slate-800 text-right">{enabledFieldLabels}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLaunch}
                  className="w-full mt-6 bg-indigo-600 text-white py-4 rounded-xl font-semibold text-lg hover:bg-indigo-700 transition-colors"
                >
                  Launch Chatbot 🚀
                </button>

                {launchError && <p className="text-sm text-red-500 mt-3 text-center">{launchError}</p>}
              </div>
            )}
          </>
        )}
      </div>

      {launchStep === 'form' && (
        <div className="flex items-center justify-between mt-6">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              className="border border-slate-200 text-slate-600 px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors"
            >
              &larr; Back
            </button>
          ) : (
            <div />
          )}
          {currentStep < TOTAL_STEPS && (
            <button
              type="button"
              onClick={handleNext}
              className="bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Next &rarr;
            </button>
          )}
        </div>
      )}

      {launchStep === 'confirmation_required' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-lg max-w-md w-full">
            <h2 className="font-bold text-slate-800 text-lg">Large Website Detected</h2>
            <p className="text-sm text-slate-500 mt-2">
              Found {totalPages} pages. We will index the {selectedPages} most relevant pages.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => navigate('/dashboard/bots')}
                className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmIndexing}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-indigo-700 transition-colors"
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
