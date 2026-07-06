import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupBot } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import type { BotConfig, LeadFormField, SetupBotResult } from '../types/index'
import { Card } from '../components/Card/Card'
import { Input } from '../components/Input/Input'
import { Textarea } from '../components/Textarea/Textarea'
import { Select } from '../components/Select/Select'
import { Button } from '../components/Button/Button'
import { Spinner } from '../components/Spinner/Spinner'
import styles from './NewBotPage.module.css'

const TOTAL_STEPS = 4

const WIDGET_TRIGGER_OPTIONS = [
  { value: 'immediate', label: 'Immediate' },
  { value: 'delay_5s', label: '5 Second Delay' },
  { value: 'scroll_50', label: 'Scroll 50%' },
  { value: 'exit_intent', label: 'Exit Intent' },
]

const LOCKED_FIELD_IDS = new Set(['name', 'phone', 'email'])

const DEFAULT_LEAD_FORM_FIELDS: LeadFormField[] = [
  { fieldId: 'name', label: 'Your Name', type: 'text', required: true },
  { fieldId: 'phone', label: 'Phone Number', type: 'phone', required: true },
  { fieldId: 'email', label: 'Email Address', type: 'email', required: true },
  { fieldId: 'propertyInterest', label: 'Property Interest', type: 'text', required: false },
  { fieldId: 'budgetRange', label: 'Budget Range', type: 'text', required: false },
]

interface WizardState {
  name: string
  websiteUrl: string
  greetingMessage: string
  brandColor: string
  widgetTrigger: BotConfig['widgetTrigger']
  leadTriggerAfterMessages: number
  leadFormFields: LeadFormField[]
}

const INITIAL_STATE: WizardState = {
  name: '',
  websiteUrl: '',
  greetingMessage: "Hi! I'm here to help. What can I assist you with today?",
  brandColor: '#6366f1',
  widgetTrigger: 'delay_5s',
  leadTriggerAfterMessages: 2,
  leadFormFields: DEFAULT_LEAD_FORM_FIELDS,
}

export default function NewBotPage() {
  const navigate = useNavigate()
  const { show } = useToast()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<SetupBotResult | null>(null)
  const [form, setForm] = useState<WizardState>(INITIAL_STATE)

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function canProceed(): boolean {
    if (step === 1) {
      return form.name.trim() !== '' && form.websiteUrl.trim() !== '' && form.greetingMessage.trim() !== ''
    }
    if (step === 2) {
      return (
        form.brandColor.trim() !== '' &&
        form.leadTriggerAfterMessages >= 1 &&
        form.leadTriggerAfterMessages <= 10
      )
    }
    return true
  }

  async function handleLaunch() {
    setSubmitting(true)
    try {
      const res = await setupBot({
        name: form.name,
        websiteUrl: form.websiteUrl,
        greetingMessage: form.greetingMessage,
        brandColor: form.brandColor,
        widgetTrigger: form.widgetTrigger,
        leadTriggerAfterMessages: form.leadTriggerAfterMessages,
        leadFormFields: form.leadFormFields,
      })

      if (res.success && res.data) {
        setResult(res.data)
        show(`Bot launched — ${res.data.pagesIndexed} pages indexed`, 'success')
        setTimeout(() => navigate('/dashboard/bots'), 1800)
      } else {
        show(res.error ?? 'Failed to launch bot', 'error')
      }
    } catch (error) {
      show(error instanceof Error ? error.message : 'Failed to launch bot', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleFieldRequired(fieldId: string, requiredValue: boolean) {
    update(
      'leadFormFields',
      form.leadFormFields.map((field) =>
        field.fieldId === fieldId ? { ...field, required: requiredValue } : field
      )
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.progress}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <div key={s} className={styles.progressItem}>
            <div
              className={`${styles.progressCircle} ${s === step ? styles.active : ''} ${
                s < step ? styles.done : ''
              }`}
            >
              {s < step ? '✓' : s}
            </div>
            {s < TOTAL_STEPS && <div className={styles.progressLine} />}
          </div>
        ))}
      </div>

      <Card padding="lg">
        {step === 1 && (
          <div>
            <h2 className={styles.stepTitle}>Website</h2>
            <Input label="Bot Name" value={form.name} onChange={(v) => update('name', v)} required />
            <Input
              label="Website URL"
              type="url"
              placeholder="https://example.com"
              value={form.websiteUrl}
              onChange={(v) => update('websiteUrl', v)}
              required
            />
            <Textarea
              label="Greeting Message"
              value={form.greetingMessage}
              onChange={(v) => update('greetingMessage', v)}
              required
            />
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className={styles.stepTitle}>Appearance</h2>
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorPicker}
                value={form.brandColor}
                onChange={(e) => update('brandColor', e.target.value)}
                aria-label="Brand color picker"
              />
              <div className={styles.colorInput}>
                <Input label="Brand Color" value={form.brandColor} onChange={(v) => update('brandColor', v)} />
              </div>
            </div>
            <Select
              label="Widget Trigger"
              value={form.widgetTrigger}
              onChange={(v) => update('widgetTrigger', v as BotConfig['widgetTrigger'])}
              options={WIDGET_TRIGGER_OPTIONS}
            />
            <Input
              label="Capture lead after N messages"
              type="number"
              min={1}
              max={10}
              value={String(form.leadTriggerAfterMessages)}
              onChange={(v) => update('leadTriggerAfterMessages', Math.min(10, Math.max(1, Number(v) || 1)))}
            />
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className={styles.stepTitle}>Lead Form</h2>
            {form.leadFormFields.map((field) => (
              <div key={field.fieldId} className={styles.fieldRow}>
                <div>
                  <p className={styles.fieldLabel}>{field.label}</p>
                  <p className={styles.fieldType}>{field.type}</p>
                </div>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={field.required}
                    disabled={LOCKED_FIELD_IDS.has(field.fieldId)}
                    onChange={(e) => toggleFieldRequired(field.fieldId, e.target.checked)}
                  />
                  Required
                </label>
              </div>
            ))}
          </div>
        )}

        {step === 4 && !result && (
          <div>
            <h2 className={styles.stepTitle}>Review and Launch</h2>
            <dl className={styles.summary}>
              <dt>Bot Name</dt>
              <dd>{form.name}</dd>
              <dt>Website</dt>
              <dd>{form.websiteUrl}</dd>
              <dt>Greeting</dt>
              <dd>{form.greetingMessage}</dd>
              <dt>Brand Color</dt>
              <dd>{form.brandColor}</dd>
              <dt>Widget Trigger</dt>
              <dd>{WIDGET_TRIGGER_OPTIONS.find((o) => o.value === form.widgetTrigger)?.label}</dd>
              <dt>Lead Trigger</dt>
              <dd>After {form.leadTriggerAfterMessages} messages</dd>
            </dl>

            {submitting ? (
              <div className={styles.scanning}>
                <Spinner size="lg" />
                <p>Scanning your website...</p>
              </div>
            ) : (
              <Button onClick={handleLaunch}>Launch Bot</Button>
            )}
          </div>
        )}

        {result && (
          <div className={styles.success}>
            <p className={styles.successTitle}>🎉 Bot launched successfully!</p>
            <p>
              {result.pagesIndexed} pages indexed, {result.chunksIndexed} chunks created.
            </p>
          </div>
        )}
      </Card>

      {!result && (
        <div className={styles.nav}>
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={step === 1 || submitting}>
            Back
          </Button>
          {step < TOTAL_STEPS && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
