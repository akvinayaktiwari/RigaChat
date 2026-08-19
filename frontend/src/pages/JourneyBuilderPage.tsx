import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { createJourneyBundle, getJourneyBundle, publishJourneyBundle, updateJourneyBundle } from '../services/api'
import { useToast } from '../components/Toast/Toast'
import JourneyGraph from '../components/journey/JourneyGraph'
import PlanBuilder from '../components/journey/PlanBuilder'
import Dropdown from '../components/Dropdown/Dropdown'
import { Modal } from '../components/Modal/Modal'
import {
  DEFAULT_PLAN,
  journeyToPlan,
  parseStoredPlan,
  storedPlanMatchesJourney,
  planToAgent,
  planToJourney,
} from '../lib/journey-plan'
import type { JourneyPlan } from '../lib/journey-plan'
import type {
  AgentConfig,
  JourneyBundle,
  JourneyDefinition,
  JourneyStep,
  JourneyTriggerType,
  McpCapability,
} from '../types/index'

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

const primaryButtonClasses =
  'bg-linear-to-r from-violet-600 to-purple-500 text-white font-semibold rounded-xl shadow-md shadow-violet-200/50 hover:opacity-90 transition-opacity'
const secondaryButtonClasses =
  'text-gray-700 font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors'
const inputClasses =
  'w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all'
const labelClasses = 'block text-sm font-medium text-gray-700 mb-1.5'

// Keyed by McpCapability rather than a free array so adding a capability to
// the union without describing it here is a compile error -- the picker can
// never silently omit a tool the backend accepts, and can never offer one it
// rejects.
const TOOLBOX_CATALOG: Record<McpCapability, { label: string; description: string }> = {
  booking: { label: 'Book appointment', description: 'Creates a real Cal.com booking once connected in Settings' },
  reminder: { label: 'Schedule reminder', description: 'Creates a follow-up Scheduler entry for this lead' },
  quotation: { label: 'Get quotation', description: 'Stub — no pricing-rule model exists yet' },
  brochure: { label: 'Send brochure', description: 'Stub — no document library exists yet' },
}

const TOOLBOX_OPTIONS = (Object.keys(TOOLBOX_CATALOG) as McpCapability[]).map((toolName) => ({
  toolName,
  ...TOOLBOX_CATALOG[toolName],
}))

const TOOL_LABELS: Record<McpCapability, string> = Object.fromEntries(
  TOOLBOX_OPTIONS.map((t) => [t.toolName, t.label])
) as Record<McpCapability, string>

const TRIGGER_LABELS: Record<JourneyTriggerType, string> = {
  lead_captured: 'When a lead is captured',
  manual_score: 'When manually scored by a human',
  site_visit_done: 'After a site visit is completed',
}

const STEP_TYPE_OPTIONS: { type: JourneyStep['type']; label: string }[] = [
  { type: 'send_message', label: 'Send a message' },
  { type: 'wait', label: 'Wait' },
  { type: 'wait_and_recheck', label: 'Wait & recheck' },
  { type: 'await_reply', label: 'Wait for their reply' },
  { type: 'condition', label: 'Condition' },
  { type: 'tool_call', label: 'Call a tool' },
  { type: 'human_handoff', label: 'Human handoff' },
]

const STEP_TYPE_LABELS: Record<JourneyStep['type'], string> = {
  send_message: 'Send a message',
  wait: 'Wait',
  wait_and_recheck: 'Wait & recheck',
  await_reply: 'Wait for their reply',
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
    case 'await_reply':
      return { stepId, name, type, next: '', onNoReply: '' }
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
    // Both edges are required: a journey that pauses on a reply with nowhere to
    // go when it doesn't arrive would strand the lead until the 24h timeout and
    // then fail the execution.
    if (step.type === 'await_reply' && (!step.next || !step.onNoReply)) {
      return `"${step.name}": pick both "when they reply" and "if they don't reply" steps`
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
  promptHint?: string
  onNoReply?: string
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
      <Dropdown
        value={value}
        onChange={onChange}
        ariaLabel={label}
        placeholder={required ? 'Choose a step…' : '— End journey —'}
        options={[
          ...(required ? [] : [{ value: '', label: 'End journey' }]),
          ...laterSteps.map(({ step, i }) => ({
            value: step.stepId,
            label: `Step ${i + 1}: ${step.name}`,
          })),
        ]}
      />
    </div>
  )
}

interface StepEditorProps {
  step: JourneyStep
  index: number
  steps: JourneyStep[]
  mcpToolbox: McpCapability[]
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
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
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
              <Dropdown
                value={step.recheckField}
                onChange={(v) => onChange({ recheckField: v as StepPatch['recheckField'] })}
                ariaLabel="What to recheck"
                options={[
                  { value: 'replied', label: 'Lead replied' },
                  { value: 'lead_score', label: 'Lead score is set' },
                  { value: 'appointment_booked', label: 'Appointment is booked' },
                ]}
              />
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

        {step.type === 'await_reply' && (
          <>
            <div>
              <label className={labelClasses}>What you're expecting them to send (optional)</label>
              <input
                value={step.promptHint ?? ''}
                onChange={(e) => onChange({ promptHint: e.target.value })}
                placeholder="e.g. budget range and preferred area"
                className={inputClasses}
              />
              <p className="mt-1.5 text-xs text-gray-500">
                A note for you, not a message to them. Use a “Send a message” step before this one to actually ask.
              </p>
            </div>
            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.next}
              onChange={(v) => onChange({ next: v })}
              required
              label="When they reply, go to"
            />
            <NextStepSelect
              steps={steps}
              currentIndex={index}
              value={step.onNoReply}
              onChange={(v) => onChange({ onNoReply: v })}
              required
              label="If they don't reply within 24 hours, go to"
            />
            <p className="text-xs text-gray-500">
              24 hours is WhatsApp's rule, not ours: after that you can only reach them with a pre-approved
              template, so the journey has to take a different path.
            </p>
          </>
        )}

        {step.type === 'condition' && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
              <div>
                <label className={labelClasses}>Field</label>
                <Dropdown
                  value={step.field}
                  onChange={(v) => onChange({ field: v as StepPatch['field'] })}
                  ariaLabel="Field to check"
                  options={[
                    { value: 'replied', label: 'Replied' },
                    { value: 'lead_score', label: 'Lead score' },
                    { value: 'appointment_booked', label: 'Appointment booked' },
                  ]}
                />
              </div>
              <div>
                <label className={labelClasses}>Operator</label>
                <Dropdown
                  value={step.operator}
                  onChange={(v) => onChange({ operator: v as StepPatch['operator'] })}
                  ariaLabel="Comparison"
                  options={[
                    { value: 'equals', label: 'Equals' },
                    { value: 'not_equals', label: 'Not equals' },
                  ]}
                />
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
                <Dropdown
                  value={step.toolName}
                  // Every option value is a member of mcpToolbox, which is
                  // McpCapability[] -- so the narrow is exhaustive by
                  // construction, not an assumption about user input.
                  onChange={(v) => onChange({ toolName: v as McpCapability | '', toolInput: undefined })}
                  ariaLabel="Tool to call"
                  placeholder="Choose a tool…"
                  options={mcpToolbox.map((tool) => ({ value: tool, label: TOOL_LABELS[tool] }))}
                />
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
  // Which node the map has highlighted. Purely a view concern today; the
  // inspector will take ownership of it.
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null)

  // The plan is the source of truth whenever we have one: the steps below are
  // regenerated from it on save. `planMode` is false only for a journey whose
  // shape a plan cannot represent honestly (see journeyToPlan), in which case
  // the step editor stays as the fallback rather than mangling their journey.
  const [plan, setPlan] = useState<JourneyPlan>(DEFAULT_PLAN)
  const [planMode, setPlanMode] = useState(true)
  const [planRefusal, setPlanRefusal] = useState<string | null>(null)
  const [view, setView] = useState<'plan' | 'map' | 'steps'>('plan')
  // Gates the Save path on a PUBLISHED bundle. See requestSave() for why Save
  // needs a confirmation and Publish does not.
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerType, setTriggerType] = useState<JourneyTriggerType>('lead_captured')
  const [steps, setSteps] = useState<JourneyStep[]>([])
  const [agentName, setAgentName] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [toneDescription, setToneDescription] = useState('')
  const [mcpToolbox, setMcpToolbox] = useState<McpCapability[]>([])

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

        // A stored plan wins. goal / learn / never / escalateWhen are folded
        // into the agent's systemPrompt as prose and cannot be read back out of
        // it, so inference has to default them -- which used to mean reopening a
        // journey silently reset a client's guardrail list to ours.
        // Valid shape AND still describes this journey. A stored plan that has
        // drifted from its own journey would overwrite the live version on the
        // next save, so a mismatch is treated exactly like no plan at all.
        const stored = parseStoredPlan(bundle.plan)
        if (stored && storedPlanMatchesJourney(stored, bundle.journey.steps)) {
          setPlan(stored)
          setPlanMode(true)
        } else {
          // No stored plan: authored before this field existed, or written by
          // something other than the builder. Infer one. A refusal is a feature:
          // guessing at a shape the plan cannot express would silently drop a
          // path from a client's live automation.
          const inferred = journeyToPlan(bundle.journey, bundle.agent)
          if (inferred.ok) {
            setPlan(inferred.plan)
            setPlanMode(true)
          } else {
            setPlanMode(false)
            setPlanRefusal(inferred.reason)
            setView('steps')
          }
        }
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

  async function handleSave(): Promise<JourneyBundle | null> {
    setError(null)

    if (!name.trim()) {
      setError('Give this journey a name')
      return null
    }
    if (planMode) {
      if (!plan.agentName.trim()) {
        setError('Give the assistant a name')
        return null
      }
      if (!plan.goal.trim()) {
        setError('Say what this assistant should achieve')
        return null
      }
    } else if (!agentName.trim() || !systemPrompt.trim()) {
      setError('The agent needs a name and a system prompt')
      return null
    }
    if (!planMode) {
      if (steps.length === 0) {
        setError('Add at least one step before saving')
        return null
      }
      const stepError = validateSteps(steps)
      if (stepError) {
        setError(stepError)
        return null
      }
    }

    setSaving(true)

    const journeyId = existing?.journey.journeyId ?? crypto.randomUUID()
    const personaId = existing?.agent.personaId ?? crypto.randomUUID()

    // In plan mode the steps and the prompt are BUILT, not read off the form.
    // journey-plan.test.ts asserts every plan permutation compiles cleanly
    // against the real forward-reference and save-validation rules, which is
    // why validateSteps is skipped above.
    const journey: Omit<JourneyDefinition, 'botId' | 'clientId'> = planMode
      ? planToJourney(plan, journeyId, triggerType, name)
      : {
          journeyId,
          name,
          triggerType,
          startStepId: steps[0].stepId,
          steps,
        }

    const agent: AgentConfig = planMode
      ? { ...planToAgent(plan, personaId), channelConfig: existing?.agent.channelConfig ?? {} }
      : {
          personaId,
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
          journey,
          agent,
          ...(planMode ? { plan } : {}),
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
        ...(planMode ? { plan } : {}),
      })
      // Captured BEFORE the call: a successful update always comes back as
      // 'draft', so the response can never tell us what we just gave up.
      const wasPublished = existing?.status === 'published'

      if (res.success && res.data) {
        setExisting(res.data)
        toast.show(
          wasPublished
            ? 'Saved as draft. This journey is no longer handling new leads.'
            : 'Journey saved',
          wasPublished ? 'warning' : 'success'
        )
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

  // What the Save button actually calls.
  //
  // Saving a PUBLISHED bundle is destructive in a way nothing on screen admits:
  // updateJourneyBundle (backend journey-service.ts:232) drops the bundle to
  // 'draft' AND releases its trigger claim, so new leads stop igniting into it
  // until someone publishes again. Conversations already running are unaffected
  // -- they finish on the version they started on.
  //
  // Publish does NOT go through here on purpose. handlePublish() saves and then
  // immediately re-claims the trigger, so the journey is never off duty for
  // longer than that round trip, and a confirmation there would be noise.
  function requestSave() {
    if (existing?.status === 'published') {
      setConfirmUnpublish(true)
      return
    }
    void handleSave()
  }

  async function confirmSaveAsDraft() {
    setConfirmUnpublish(false)
    await handleSave()
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
  const previewSteps = planMode ? planToJourney(plan, 'preview', triggerType, name).steps : steps

  const VIEWS: Array<{ id: 'plan' | 'map' | 'steps'; label: string }> = planMode
    ? [
        { id: 'plan', label: 'Plan' },
        { id: 'map', label: 'Journey map' },
      ]
    : [
        { id: 'steps', label: 'Steps' },
        { id: 'map', label: 'Journey map' },
      ]

  return (
    <div className="pb-10">
      <button
        type="button"
        onClick={() => navigate('/dashboard/journeys')}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4"
      >
        <ArrowLeft size={16} /> Back to Journeys
      </button>

      <div className="flex items-center gap-4 flex-wrap mb-5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this journey"
          style={JAKARTA_FONT}
          className="font-extrabold text-2xl text-gray-900 bg-transparent border-0 p-0 focus:outline-none placeholder:text-gray-300 flex-1 min-w-[16rem] max-w-[36rem] truncate"
        />
        {existing && (
          <span
            className={`inline-flex items-center gap-1.5 text-[11.5px] font-bold px-2.5 py-1 rounded-full ${
              existing.status === 'published'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
            {existing.status === 'published' ? 'Live' : 'Draft'}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={requestSave}
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

      <div className="flex items-center gap-4 flex-wrap mb-5">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit" role="tablist">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                view === v.id ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <label className="text-sm text-gray-500 flex items-center gap-2">
          Runs
          <Dropdown<JourneyTriggerType>
            value={triggerType}
            onChange={setTriggerType}
            ariaLabel="When this journey runs"
            variant="inline"
            options={(Object.entries(TRIGGER_LABELS) as [JourneyTriggerType, string][]).map(
              ([value, label]) => ({ value, label })
            )}
          />
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl p-4 mb-5">{error}</div>
      )}

      {/* An existing journey whose shape a plan cannot represent. Saying so is
          the honest move: silently flattening it would drop a path from a
          client's live automation. */}
      {planRefusal && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl p-4 mb-5">
          <b className="font-semibold" style={JAKARTA_FONT}>
            This journey is edited as steps
          </b>
          <p className="mt-1 leading-relaxed">{planRefusal} Nothing is lost, and it keeps working exactly as it does now.</p>
        </div>
      )}

      {view === 'plan' && planMode && <PlanBuilder plan={plan} onChange={setPlan} />}

      {view === 'map' && (
        <div>
          <p className="text-sm text-gray-500 mb-3">
            {planMode
              ? 'Generated from your plan. Read only, so the plan stays the single source of truth.'
              : 'What this journey does, in order.'}
          </p>
          <JourneyGraph
            steps={previewSteps}
            startStepId={previewSteps[0]?.stepId ?? ''}
            selectedStepId={selectedStepId}
            onSelect={setSelectedStepId}
          />
        </div>
      )}

      <Modal
        isOpen={confirmUnpublish}
        onClose={() => setConfirmUnpublish(false)}
        title="Saving will take this journey off duty"
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm font-semibold text-amber-800 mb-1" style={JAKARTA_FONT}>
              New leads will stop entering
            </p>
            <p className="text-sm text-amber-900/80 leading-relaxed">
              Saving returns “{name || 'this journey'}” to draft and releases the{' '}
              <strong>{TRIGGER_LABELS[triggerType]}</strong> trigger. Nothing will pick up new
              leads until you publish it again.
            </p>
          </div>

          <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-800 mb-1" style={JAKARTA_FONT}>
              Conversations already running are safe
            </p>
            <p className="text-sm text-gray-600 leading-relaxed">
              Leads mid-journey finish on the version they started on.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setConfirmUnpublish(false)}
              className="text-gray-600 font-medium px-4 py-2.5 rounded-xl text-sm hover:bg-gray-100 transition-colors"
            >
              Keep it live
            </button>
            <button
              type="button"
              onClick={confirmSaveAsDraft}
              className="px-4 py-2.5 text-sm bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 transition-colors"
            >
              Save as draft
            </button>
          </div>
        </div>
      </Modal>

      {view === 'steps' && !planMode && (
        <div className="bg-white rounded-2xl border border-black/5 p-6">
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
      )}
    </div>
  )
}
