// Tells a HUMAN that a lead needs them.
//
// Two things reach this service, and they are the same capability arrived at
// two different ways: a journey that ran out of moves (`hand_to_agent`), and a
// timer the lead themselves asked for (`lead_reminder`). Both end with a
// person who has to be told, which is why one send path serves both rather
// than each growing its own.
//
// Everything here is best-effort by construction. A handoff that fails to
// notify is bad; a handoff that fails to HAPPEN because the notification
// failed is worse -- the journey has already stopped talking to the lead by
// the time we get here, so throwing would strand them with nobody told and no
// agent working. Callers get a result they can log; they never get an
// exception.

import { getLeadEvents } from '../repositories/lead-event-repository.js'
import { readJourneyLead } from './lead-resolution-service.js'
import { sendWhatsAppTemplateToClientNumber } from './whatsapp-service.js'
import { templateLanguageOf } from '../lib/whatsapp-templates.js'
import type { LeadEvent, LeadRef } from '../types/index.js'

export const HANDOFF_ALERT_TEMPLATE = 'lead_handoff_alert_1'

// How many of the most recent events to fold into the summary line. Enough to
// show why the agent gave up, short enough to stay inside a template
// parameter -- Meta caps a body parameter at 1024 characters and rejects the
// whole send if any one exceeds it.
const SUMMARY_EVENT_LIMIT = 6
const SUMMARY_MAX_LENGTH = 700
const TURN_MAX_LENGTH = 120

export type HandoffTrigger = 'hand_to_agent' | 'lead_reminder'

export interface HandoffAlertInput {
  leadRef: LeadRef
  clientId: string
  reason: string
  trigger: HandoffTrigger
}

export interface HandoffAlertResult {
  notified: boolean
  // Present whenever notified is false. A machine-readable reason, because
  // "nobody was told" is the failure an operator most needs to search for.
  skipReason?: 'no_notification_number' | 'no_active_connection' | 'lead_not_found' | 'send_failed'
  error?: string
}

// WhatsApp template parameters cannot contain newlines, tabs, or four or more
// consecutive spaces. Meta rejects the SEND, not the template, so an unflattened
// transcript passes review and then fails in production against a real lead.
// Every value that reaches a {{n}} goes through here first.
export function flattenTemplateParam(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`
}

// Turns the tail of the event log into one line a human can read on a phone
// lock screen. Only actual messages -- delivery statuses and step records are
// noise to the person deciding whether to pick up the phone.
export function summarizeRecentMessages(events: LeadEvent[]): string {
  const turns = events
    .filter((event) => event.type === 'message_in' || event.type === 'message_out')
    .slice(-SUMMARY_EVENT_LIMIT)
    .map((event) => {
      const speaker = event.type === 'message_in' ? 'Lead' : 'Agent'
      return `${speaker}: ${truncate(flattenTemplateParam(event.body ?? ''), TURN_MAX_LENGTH)}`
    })
    .filter((line) => !line.endsWith(': '))

  if (turns.length === 0) return 'No messages exchanged yet.'
  return truncate(turns.join(' · '), SUMMARY_MAX_LENGTH)
}

// The deep link has to carry the whole LeadRef, not just the leadId: the three
// lead tables have three different partition keys, so leadId alone is not
// addressable. Mirrors frontend/src/lib/lead-ref.ts leadDetailPath, which is
// the thing that parses it back.
export function leadDetailUrl(leadRef: LeadRef): string {
  const baseUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')
  const params = new URLSearchParams({ source: leadRef.source })
  if (leadRef.source === 'chat') params.set('botId', leadRef.botId)
  if (leadRef.source === 'form') params.set('formId', leadRef.formId)
  if (leadRef.source === 'meta') params.set('pageId', leadRef.pageId)
  return `${baseUrl}/dashboard/leads/${leadRef.leadId}?${params.toString()}`
}

export async function sendHandoffAlert(input: HandoffAlertInput): Promise<HandoffAlertResult> {
  try {
    const lead = await readJourneyLead(input.leadRef)
    if (!lead) {
      console.log(
        `[notification] handoff alert skipped: lead_not_found client=${input.clientId} lead=${input.leadRef.leadId}`
      )
      return { notified: false, skipReason: 'lead_not_found' }
    }

    // A failed event read costs the summary, not the alert. The name, phone
    // and reason are the parts that make the message actionable.
    const events = await getLeadEvents(input.leadRef.leadId).catch(() => [] as LeadEvent[])

    const result = await sendWhatsAppTemplateToClientNumber(
      input.clientId,
      HANDOFF_ALERT_TEMPLATE,
      [
        flattenTemplateParam(lead.name || 'Unnamed lead'),
        flattenTemplateParam(lead.phone || 'Not on file'),
        flattenTemplateParam(input.reason) || 'No reason recorded',
        summarizeRecentMessages(events),
        leadDetailUrl(input.leadRef),
      ],
      templateLanguageOf(HANDOFF_ALERT_TEMPLATE)
    )

    if (result.success) return { notified: true }

    const skipReason = result.error?.includes('notificationNumber')
      ? 'no_notification_number'
      : result.error?.includes('No active WhatsApp connection')
        ? 'no_active_connection'
        : 'send_failed'

    console.log(
      `[notification] handoff alert not delivered: reason=${skipReason} trigger=${input.trigger} client=${input.clientId} lead=${input.leadRef.leadId} error="${result.error ?? ''}"`
    )
    return { notified: false, skipReason, ...(result.error ? { error: result.error } : {}) }
  } catch (error) {
    // The catch-all that makes the promise in this file's header true: no
    // failure mode reaches the journey execution or the scheduler.
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[notification] handoff alert threw: trigger=${input.trigger} client=${input.clientId} lead=${input.leadRef.leadId}`,
      message
    )
    return { notified: false, skipReason: 'send_failed', error: message }
  }
}
