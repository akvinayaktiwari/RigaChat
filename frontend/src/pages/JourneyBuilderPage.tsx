import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { createJourneyBundle, getJourneyBundle, publishJourneyBundle, updateJourneyBundle } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import type { AgentConfig, JourneyBundle, JourneyDefinition, JourneyStep, JourneyTriggerType } from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity'
const secondaryButtonClasses =
  'text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors'
const inputClasses =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'

const TOOLBOX_OPTIONS: { toolName: string; label: string; description: string }[] = [
  { toolName: 'booking', label: 'Book appointment', description: 'Creates a real Cal.com booking once connected in Settings' },
  { toolName: 'reminder', label: 'Schedule reminder', description: 'Creates a follow-up Scheduler entry for this lead' },
  { toolName: 'quotation', label: 'Get quotation', description: 'Stub — no pricing-rule model exists yet' },
  { toolName: 'brochure', label: 'Send brochure', description: 'Stub — no document library exists yet' },
]

const TOOL_LABELS: Record<string, string> = Object.fromEntries(TOOLBOX_OPTIONS.map((t) => [t.toolName, t.label]))

const TRIGGER_LABELS: Record<JourneyTriggerType, string> = {
  lead_captured: 'When a lead is captured',
  manual_score: 'When manually scored by a human',
  site_visit_done: 'After a site visit is completed',
}

const STEP_TYPE_OPTIONS: { type: JourneyStep['type']; label: string }[] = [
  { type: 'send_message', label: 'Send a message' },
  { type: 'wait', label: 'Wait' },
  { type: 'wait_and_recheck', label: 'Wait & recheck' },
  { type: 'condition', label: 'Condition' },
  { type: 'tool_call', label: 'Call a tool' },
  { type: 'human_handoff', label: 'Human handoff' },
]

const STEP_TYPE_LABELS: Record<JourneyStep['type'], string> = {
  send_message: 'Send a message',
  wait: 'Wait',
  wait_and_recheck: 'Wait & recheck',
  condition: 'Condition',
  tool_call: 'Call a tool',
  human_handoff: 'Human handoff',
}

function newStep(type: JourneyStep['type'], index: number): JourneyStep {
  const stepId = crypto.randomUUID()
  const name = `Step ${index + 1}`
  switch (type) {
    case 'send_message':
      return { stepId, name, type }
    case 'wait':
      return { stepId, name, type, waitDays: 1 }
    case 'wait_and_recheck':
      return { stepId, name, type, waitDays: 1, maxIterations: 3, recheckField: 'replied', onSatisfied: '', onExhausted: '' }
    case 'condition':
      return { stepId, name, type, field: 'replied', operator: 'equals', value: '', onTrue: '', onFalse: '' }
    case 'tool_call':
      return { stepId, name, type, toolName: '' }
    case 'human_handoff':
      return { stepId, name, type }
  }
}

function toDatetimeLocalValue(iso?: unknown): string {
  return typeof iso === 'string' && iso ? iso.slice(0, 16) : ''
}

function fromDatetimeLocalValue(value: string): string {
  return value ? new Date(value).toISOString() : ''
}

function validateSteps(steps: JourneyStep[]): string | null {
  for (const step of steps) {
    if (step.type === 'wait' && (!Number.isInteger(step.waitDays) || step.waitDays < 1)) {
      return `"${step.name}": wait days must be a whole number of at least 1`
    }
    if (step.type === 'wait_and_recheck') {
      if (!Number.isInteger(step.waitDays) || step.waitDays < 1) {
        return `"${step.name}": wait days must be a whole number of at least 1`
      }
      if (!Number.isInteger(step.maxIterations) || step.maxIterations < 1 || step.maxIterations > 30) {
        return `"${step.name}": max tries must be a whole number between 1 and 30`
      }
      if (!step.onSatisfied || !step.onExhausted) {
        return `"${step.name}": pick both "if satisfied" and "if tries run out" steps`
      }
    }
    if (step.type === 'condition' && (!step.onTrue || !step.onFalse)) {
      return `"${step.name}": pick both "if true" and "if false" steps`
    }
    if (step.type === 'tool_call') {
      if (!step.toolName) return `"${step.name}": choose a tool`
      if (step.toolName === 'booking' && !step.toolInput?.requestedAt) {
        return `"${step.name}": set a requested date/time`
      }
      if (step.toolName === 'reminder' && !step.toolInput?.remindAt) {
        return `"${step.name}": set a remind-at date/time`
      }
    }
  }
  return null
}

interface StepPatch {
  name?: string
  messageHint?: string
  next?: string
  waitDays?: number
  maxIterations?: number
  recheckField?: 'replied' | 'lead_score' | 'appointment_booked'
  onSatisfied?: string
  onExhausted?: string
  field?: 'replied' | 'lead_score' | 'appointment_booked'
  operator?: 'equals' | 'not_equals'
  value?: string
  onTrue?: string
  onFalse?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  reason?: string
}

interface NextStepSelectProps {
  steps: JourneyStep[]
  currentIndex: number
  value: string
  onChange: (value: string) => void
  required?: boolean
  label: string
}

function NextStepSelect({ steps, currentIndex, value, onChange, required, label }: NextStepSelectProps) {
  const laterSteps = steps.map((s, i) => ({ step: s, i })).filter(({ i }) => i > currentIndex)
  return (
    <div>
      <label className={labelClasses}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses}>
        {!required && <option value="">— End journey —</option>}
        {required && value === '' && (
          <option value="" disabled>
            Choose a step…
          </option>
        )}
        {laterSteps.map(({ step, i }) => (
          <option key={step.stepId} value={step.stepId}>
            Step {i + 1}: {step.name}
          </option>
        ))}
      </select>
    </div>
  )
}

interface StepEditorProps {
  step: JourneyStep
  index: number
  steps: JourneyStep[]
  mcpToolbox: string[]
  onChange: (patch: StepPatch) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function StepEditor({
  step,
  index,
  steps,
  mcpToolbox,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: StepEditorProps) {
  return (
    <div className="border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-violet-50 text-violet-600 text-xs font-bold flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {STEP_TYPE_LABELS[step.type]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            title="Move up"
            className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            title="Move down"
            className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Remove step"
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className={labelClasses}>Step name</label>
          <input value={step.name} onChange={(e) => onChange({ name: e.target.value })} className={inputClasses} />
        </div>

        {step.type === 'send_message' && (
          <>
            <div>
              <label className={labelClasses}>Message hint (optional)</label>
              <textarea
                value={step.messageHint ?? ''}
                onChange={(e) => onChange({ messageHint: e.target.value })}
                rows={2}
                className={inputClasses}
                placeholder="A steer for the agent, not a hard template — it still composes the real message"
              />
            </div>
            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.next ?? ''}
              onChange={(v) => onChange({ next: v || undefined })}
              label="Then go to"
            />
          </>
        )}

        {step.type === 'wait' && (
          <>
            <div>
              <label className={labelClasses}>Wait days</label>
              <input
                type="number"
                min={1}
                value={step.waitDays}
                onChange={(e) => onChange({ waitDays: Number(e.target.value) || 1 })}
                className={inputClasses}
              />
            </div>
            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.next ?? ''}
              onChange={(v) => onChange({ next: v || undefined })}
              label="Then go to"
            />
          </>
        )}

        {step.type === 'wait_and_recheck' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClasses}>Wait days (per try)</label>
                <input
                  type="number"
                  min={1}
                  value={step.waitDays}
                  onChange={(e) => onChange({ waitDays: Number(e.target.value) || 1 })}
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>Max tries (up to 30)</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={step.maxIterations}
                  onChange={(e) => onChange({ maxIterations: Number(e.target.value) || 1 })}
                  className={inputClasses}
                />
              </div>
            </div>
            <div>
              <label className={labelClasses}>Check whether…</label>
              <select
                value={step.recheckField}
                onChange={(e) => onChange({ recheckField: e.target.value as StepPatch['recheckField'] })}
                className={inputClasses}
              >
                <option value="replied">Lead replied</option>
                <option value="lead_score">Lead score is set</option>
                <option value="appointment_booked">Appointment is booked</option>
              </select>
            </div>
            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.onSatisfied}
              onChange={(v) => onChange({ onSatisfied: v })}
              required
              label="If satisfied, go to"
            />
            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.onExhausted}
              onChange={(v) => onChange({ onExhausted: v })}
              required
              label="If tries run out, go to"
            />
          </>
        )}

        {step.type === 'condition' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClasses}>Field</label>
                <select
                  value={step.field}
                  onChange={(e) => onChange({ field: e.target.value as StepPatch['field'] })}
                  className={inputClasses}
                >
                  <option value="replied">Replied</option>
                  <option value="lead_score">Lead score</option>
                  <option value="appointment_booked">Appointment booked</option>
                </select>
              </div>
              <div>
                <label className={labelClasses}>Operator</label>
                <select
                  value={step.operator}
                  onChange={(e) => onChange({ operator: e.target.value as StepPatch['operator'] })}
                  className={inputClasses}
                >
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not equals</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelClasses}>Value</label>
              <input
                value={step.value}
                onChange={(e) => onChange({ value: e.target.value })}
                className={inputClasses}
                placeholder="e.g. true, hot, qualified"
              />
            </div>
            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.onTrue}
              onChange={(v) => onChange({ onTrue: v })}
              required
              label="If true, go to"
            />
            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.onFalse}
              onChange={(v) => onChange({ onFalse: v })}
              required
              label="If false, go to"
            />
          </>
        )}

        {step.type === 'tool_call' && (
          <>
            <div>
              <label className={labelClasses}>Tool</label>
              {mcpToolbox.length === 0 ? (
                <p className="text-xs text-amber-600">Enable a tool in the Agent section above first.</p>
              ) : (
                <select
                  value={step.toolName}
                  onChange={(e) => onChange({ toolName: e.target.value, toolInput: undefined })}
                  className={inputClasses}
                >
                  <option value="" disabled>
                    Choose a tool…
                  </option>
                  {mcpToolbox.map((tool) => (
                    <option key={tool} value={tool}>
                      {TOOL_LABELS[tool] ?? tool}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {step.toolName === 'booking' && (
              <>
                <div>
                  <label className={labelClasses}>Requested date/time</label>
                  <input
                    type="datetime-local"
                    value={toDatetimeLocalValue(step.toolInput?.requestedAt)}
                    onChange={(e) =>
                      onChange({ toolInput: { ...step.toolInput, requestedAt: fromDatetimeLocalValue(e.target.value) } })
                    }
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label className={labelClasses}>Time zone (optional)</label>
                  <input
                    value={(step.toolInput?.timeZone as string | undefined) ?? ''}
                    onChange={(e) => onChange({ toolInput: { ...step.toolInput, timeZone: e.target.value } })}
                    className={inputClasses}
                    placeholder="e.g. Asia/Kolkata"
                  />
                </div>
              </>
            )}

            {step.toolName === 'reminder' && (
              <div>
                <label className={labelClasses}>Remind at</label>
                <input
                  type="datetime-local"
                  value={toDatetimeLocalValue(step.toolInput?.remindAt)}
                  onChange={(e) => onChange({ toolInput: { ...step.toolInput, remindAt: fromDatetimeLocalValue(e.target.value) } })}
                  className={inputClasses}
                />
              </div>
            )}

            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.next ?? ''}
              onChange={(v) => onChange({ next: v || undefined })}
              label="Then go to"
            />
          </>
        )}

        {step.type === 'human_handoff' && (
          <div>
            <label className={labelClasses}>Reason (optional)</label>
            <input
              value={step.reason ?? ''}
              onChange={(e) => onChange({ reason: e.target.value })}
              className={inputClasses}
              placeholder="Why hand off to a human here"
            />
            <p className="text-xs text-gray-400 mt-1.5">This ends the journey — a human takes over from here.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function JourneyBuilderPage() {
  const { botId = '', bundleId } = useParams<{ botId: string; bundleId: string }>()
  const isNew = !bundleId || bundleId === 'new'
  const navigate = useNavigate()
  const toast = useToast()

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<JourneyBundle | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<JourneyTriggerType>('lead_captured')
  const [steps, setSteps] = useState<JourneyStep[]>([])
  const [agentName, setAgentName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [toneDescription, setToneDescription] = useState('')
  const [mcpToolbox, setMcpToolbox] = useState<string[]>([])

  useEffect(() => {
    if (isNew || !bundleId) return
    let cancelled = false
    getJourneyBundle(botId, bundleId).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        const bundle = res.data
        setExisting(bundle)
        setName(bundle.name)
        setDescription(bundle.description ?? '')
        setTriggerType(bundle.journey.triggerType)
        setSteps(bundle.journey.steps)
        setAgentName(bundle.agent.name)
        setSystemPrompt(bundle.agent.systemPrompt)
        setToneDescription(bundle.agent.toneDescription ?? '')
        setMcpToolbox(bundle.agent.mcpToolbox)
      } else {
        toast.show(res.error ?? 'Failed to load journey', 'error')
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId, bundleId, isNew])

  function addStep(type: JourneyStep['type']) {
    setSteps((prev) => [...prev, newStep(type, prev.length)])
  }

  function updateStep(index: number, patch: StepPatch) {
    setSteps((prev) => prev.map((s, i) => (i === index ? ({ ...s, ...patch } as JourneyStep) : s)))
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index))
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function toggleTool(toolName: string) {
    setMcpToolbox((prev) => (prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]))
  }

  async function handleSave(): Promise<JourneyBundle | null> {
    setError(null)

    if (!name.trim()) {
      setError('Give this journey a name')
      return null
    }
    if (!agentName.trim() || !systemPrompt.trim()) {
      setError('The agent needs a name and a system prompt')
      return null
    }
    if (steps.length === 0) {
      setError('Add at least one step before saving')
      return null
    }
    const stepError = validateSteps(steps)
    if (stepError) {
      setError(stepError)
      return null
    }

    setSaving(true)

    const journey: Omit<JourneyDefinition, 'botId' | 'clientId'> = {
      journeyId: existing?.journey.journeyId ?? crypto.randomUUID(),
      name,
      triggerType,
      startStepId: steps[0].stepId,
      steps,
    }
    const agent: AgentConfig = {
      personaId: existing?.agent.personaId ?? crypto.randomUUID(),
      name: agentName,
      systemPrompt,
      toneDescription: toneDescription || undefined,
      mcpToolbox,
      channelConfig: existing?.agent.channelConfig ?? {},
    }

    try {
      if (isNew) {
        const res = await createJourneyBundle({
          botId,
          name,
          description: description || undefined,
          isPrebuiltTemplate: false,
          journey,
          agent,
        })
        if (res.success && res.data) {
          toast.show('Journey created', 'success')
          navigate(`/dashboard/journeys/${botId}/${res.data.bundleId}`, { replace: true })
          return res.data
        }
        setError(res.error ?? 'Failed to create journey')
        return null
      }

      const res = await updateJourneyBundle(botId, bundleId as string, {
        name,
        description: description || undefined,
        journey,
        agent,
      })
      if (res.success && res.data) {
        setExisting(res.data)
        toast.show('Journey saved', 'success')
        return res.data
      }
      setError(res.error ?? 'Failed to save journey')
      return null
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    const saved = await handleSave()
    if (!saved) {
      setPublishing(false)
      return
    }
    try {
      const res = await publishJourneyBundle(saved.botId, saved.bundleId)
      if (res.success && res.data) {
        setExisting(res.data)
        toast.show('Journey published', 'success')
      } else {
        setError(res.error ?? 'Failed to publish journey')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        <div className="h-6 bg-gray-100 rounded-xl w-48" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
        <div className="h-64 bg-gray-100 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl pb-10">
      <button
        type="button"
        onClick={() => navigate('/dashboard/journeys')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4"
      >
        <ArrowLeft size={16} /> Back to Journeys
      </button>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="font-extrabold text-2xl text-gray-900" style={JAKARTA_FONT}>
          {isNew ? 'New Journey' : name || 'Edit Journey'}
        </h1>
        {existing && (
          <span
            className={`inline-flex border text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              existing.status === 'published'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-gray-100 text-gray-600 border-gray-200'
            }`}
          >
            {existing.status === 'published' ? 'Published' : 'Draft'}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-4 mb-6">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-black/5 p-6 mb-4">
        <h2 className="font-bold text-gray-900 mb-4" style={JAKARTA_FONT}>
          Basics
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelClasses}>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClasses}
              placeholder="e.g. Site visit follow-up"
            />
          </div>
          <div>
            <label className={labelClasses}>Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClasses}
              placeholder="What this journey does"
            />
          </div>
          <div>
            <label className={labelClasses}>Trigger</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as JourneyTriggerType)}
              className={inputClasses}
            >
              {(Object.entries(TRIGGER_LABELS) as [JourneyTriggerType, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 p-6 mb-4">
        <h2 className="font-bold text-gray-900 mb-4" style={JAKARTA_FONT}>
          Agent
        </h2>
        <div className="space-y-4">
          <div>
            <label className={labelClasses}>Agent name</label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              className={inputClasses}
              placeholder="e.g. Site Visit Booker"
            />
          </div>
          <div>
            <label className={labelClasses}>System prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              className={inputClasses}
              placeholder="How should this agent talk to leads?"
            />
          </div>
          <div>
            <label className={labelClasses}>Tone (optional)</label>
            <input
              value={toneDescription}
              onChange={(e) => setToneDescription(e.target.value)}
              className={inputClasses}
              placeholder="e.g. Warm, concise, professional"
            />
          </div>
          <div>
            <label className={labelClasses}>Tools this agent can use</label>
            <div className="space-y-2">
              {TOOLBOX_OPTIONS.map((tool) => (
                <label
                  key={tool.toolName}
                  className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={mcpToolbox.includes(tool.toolName)}
                    onChange={() => toggleTool(tool.toolName)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{tool.label}</p>
                    <p className="text-xs text-gray-500">{tool.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 p-6 mb-4">
        <h2 className="font-bold text-gray-900 mb-4" style={JAKARTA_FONT}>
          Steps
        </h2>

        {steps.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">No steps yet — add the first one below.</p>
        ) : (
          <div className="space-y-3 mb-4">
            {steps.map((step, index) => (
              <StepEditor
                key={step.stepId}
                step={step}
                index={index}
                steps={steps}
                mcpToolbox={mcpToolbox}
                onChange={(patch) => updateStep(index, patch)}
                onRemove={() => removeStep(index)}
                onMoveUp={() => moveStep(index, -1)}
                onMoveDown={() => moveStep(index, 1)}
                canMoveUp={index > 0}
                canMoveDown={index < steps.length - 1}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {STEP_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              type="button"
              onClick={() => addStep(opt.type)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl border border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-colors"
            >
              <Plus size={14} /> {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard/journeys')}
          className="text-gray-600 font-medium px-4 py-2.5 rounded-xl text-sm hover:bg-gray-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || publishing}
          className={`px-4 py-2.5 text-sm ${secondaryButtonClasses} disabled:opacity-50`}
        >
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={saving || publishing}
          className={`px-4 py-2.5 text-sm ${primaryButtonClasses} disabled:opacity-50`}
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
