import { AlertCircle, AlertTriangle, BellRing, Bot, Check, CheckCheck, Clock, PhoneForwarded, Play, User, Wrench } from 'lucide-react'
import type { LeadEvent, MessageDeliveryStatus } from '../../types/index'

// -------------------------------------------------------------------------
// What the agent actually did, in order.
//
// Deliberately NOT a chat transcript. Comparable products present a shared team
// inbox, which is a support-tool shape built around the conversation. The
// primary object here is the LEAD, and the thing a B2B buyer needs before
// trusting an autonomous agent on their pipeline is "what did it do, and did it
// work" -- so agent actions are interleaved with messages rather than hidden
// behind them. That interleaving is the part competitors do not show.
// -------------------------------------------------------------------------

const JAKARTA_FONT = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

function formatTime(ts: string): string {
  // The sort key is `${iso}#${uuid}`; only the ISO half is a timestamp.
  const iso = ts.split('#')[0] ?? ts
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '--:--'
    : date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Delivery state, shown the way WhatsApp itself shows it, because that is the
// vocabulary the client already reads every day.
function DeliveryTicks({ status }: { status?: MessageDeliveryStatus }) {
  if (!status) return null

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600" title="Failed to deliver">
        <AlertCircle size={13} />
        <span className="text-[11px] font-medium">failed</span>
      </span>
    )
  }
  if (status === 'read') {
    return <CheckCheck size={14} className="text-sky-500" aria-label="read" />
  }
  if (status === 'delivered') {
    return <CheckCheck size={14} className="text-gray-400" aria-label="delivered" />
  }
  return <Check size={14} className="text-gray-400" aria-label="sent" />
}

// A message the agent sent, or the lead sent. Bubbles, because these are the
// events a human reads as a conversation.
function MessageRow({ event, status }: { event: LeadEvent; status?: MessageDeliveryStatus }) {
  const outbound = event.type === 'message_out'

  return (
    <div className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[78%]">
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
            outbound ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-900'
          }`}
        >
          {event.body || <span className="opacity-60">(no text)</span>}
        </div>
        <div
          className={`mt-1 flex items-center gap-2 text-[11px] text-gray-400 ${
            outbound ? 'justify-end' : 'justify-start'
          }`}
        >
          <span>{formatTime(event.ts)}</span>
          {/* Template vs free text is not cosmetic: a template costs money and is
              the only thing that can send outside the 24h window, so a client
              reading their own spend needs to tell them apart. */}
          {outbound && event.mode === 'template' && (
            <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-px">
              template{event.templateName ? ` · ${event.templateName}` : ''}
            </span>
          )}
          {outbound && <DeliveryTicks status={status} />}
        </div>
        {event.errorDetail && (
          <p className={`mt-1 text-[11px] text-red-600 ${outbound ? 'text-right' : ''}`}>{event.errorDetail}</p>
        )}
      </div>
    </div>
  )
}

// Everything the machine did. Rendered as an inline system row rather than a
// bubble, so it reads as activity around the conversation instead of pretending
// to be part of it.
function SystemRow({ event }: { event: LeadEvent }) {
  const { icon, label } = describeSystemEvent(event)

  return (
    <div className="flex items-center gap-2 text-[12px] text-gray-500">
      <span className="shrink-0 text-gray-400">{icon}</span>
      <span className="min-w-0 truncate">{label}</span>
      <span className="ml-auto shrink-0 text-gray-400 text-[11px]">{formatTime(event.ts)}</span>
    </div>
  )
}

function describeSystemEvent(event: LeadEvent): { icon: JSX.Element; label: string } {
  switch (event.type) {
    case 'lead_captured':
      return { icon: <User size={13} />, label: `Lead captured${event.body ? ` from ${event.body}` : ''}` }
    case 'journey_started':
      return { icon: <Play size={13} />, label: `Journey started${event.body ? `: ${event.body}` : ''}` }
    case 'journey_step':
      return { icon: <Clock size={13} />, label: describeStep(event) }
    case 'tool_call':
      return { icon: <Wrench size={13} />, label: `Used ${event.toolName ?? 'a tool'}` }
    case 'handoff':
      return {
        icon: <PhoneForwarded size={13} />,
        label: `Handed to a human${event.reason ? `: ${event.reason}` : ''}`,
      }
    case 'notification_out':
      return { icon: <BellRing size={13} />, label: event.body ?? 'You were alerted about this lead' }
    // The outcome is the whole point of the event. A flat "finished" here would
    // put a CRASHED journey and a completed one under the same words, in the one
    // timeline a client actually reads — which is the exact ambiguity the
    // terminal event was added to remove.
    case 'journey_ended':
      if (event.outcome === 'failed') {
        return {
          icon: <AlertTriangle size={13} />,
          label: `Journey stopped on an error${event.errorDetail ? `: ${event.errorDetail}` : ''}`,
        }
      }
      if (event.outcome === 'handed_off') {
        return { icon: <PhoneForwarded size={13} />, label: 'Journey ended — handed to a human' }
      }
      return { icon: <Bot size={13} />, label: 'Journey finished' }
    case 'state_change':
      return { icon: <Bot size={13} />, label: event.body ?? 'State changed' }
    default:
      return { icon: <Bot size={13} />, label: event.type }
  }
}

// Turns the operation name into something a client reads without knowing the
// engine's vocabulary. "await_reply" means nothing to them; "waiting for a
// reply" is the whole story.
function describeStep(event: LeadEvent): string {
  if (event.body === 'await_reply') return 'Waiting for a reply'
  if (event.body === 'wait_and_recheck_check') return 'Checking whether a visit was booked'
  return event.stepId ? `Step: ${event.stepId}` : 'Journey step'
}

export interface LeadTimelineProps {
  events: LeadEvent[]
  loading: boolean
  error: string | null
}

export default function LeadTimeline({ events, loading, error }: LeadTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" data-testid="lead-timeline" data-state="loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    )
  }

  // A failed load and an empty timeline are different things and must look
  // different. Conflating them is the app-wide data-load bug in TODOS.md: an
  // error rendered as "nothing happened yet" tells the client their agent is
  // idle when it may be working fine.
  if (error) {
    return (
      <div
        className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        data-testid="lead-timeline"
        data-state="error"
      >
        {error}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-500" data-testid="lead-timeline" data-state="empty">
        Nothing has happened on this lead yet. Messages, journey steps and handoffs will appear here.
      </p>
    )
  }

  // Delivery statuses arrive as their own events keyed by wamid, because Meta's
  // status callbacks carry no leadId. Folding them onto the message they belong
  // to is what turns two unrelated rows into a tick on a bubble.
  const latestStatusByWamid = new Map<string, MessageDeliveryStatus>()
  for (const event of events) {
    if (event.type === 'message_status' && event.wamid && event.status) {
      latestStatusByWamid.set(event.wamid, event.status)
    }
  }

  const visible = events.filter((event) => event.type !== 'message_status')

  // data-state carries which of the four branches rendered. The e2e spec
  // asserts on it so a run that finds an error card fails with "error" instead
  // of "the timeline never appeared", which is the same distinction the error
  // branch above exists to preserve for the client.
  return (
    <div className="space-y-4" data-testid="lead-timeline" data-state="ready">
      {visible.map((event) => {
        const key = `${event.leadId}-${event.ts}`
        const isMessage = event.type === 'message_in' || event.type === 'message_out'

        return isMessage ? (
          <MessageRow
            key={key}
            event={event}
            status={event.wamid ? latestStatusByWamid.get(event.wamid) : undefined}
          />
        ) : (
          <SystemRow key={key} event={event} />
        )
      })}

      <p className="pt-2 text-[11px] text-gray-400" style={JAKARTA_FONT}>
        {visible.length} event{visible.length === 1 ? '' : 's'}
      </p>
    </div>
  )
}
