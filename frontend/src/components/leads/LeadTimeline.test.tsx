import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LeadTimeline from './LeadTimeline'
import type { LeadEvent } from '../../types/index'

// frontend vitest runs without globals, so @testing-library's auto-cleanup never
// registers and renders stack in one document.
afterEach(cleanup)

function event(partial: Partial<LeadEvent> & Pick<LeadEvent, 'type' | 'ts'>): LeadEvent {
  return {
    leadId: 'lead-1',
    clientId: 'client-1',
    botId: 'bot-1',
    ...partial,
  } as LeadEvent
}

describe('LeadTimeline states', () => {
  it('shows a skeleton while loading', () => {
    const { container } = render(<LeadTimeline events={[]} loading error={null} />)

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  // A failed load and an empty timeline must not look the same. Rendering an
  // error as "nothing happened yet" tells a client their agent is idle when it
  // may be working fine.
  it('shows an error distinctly from an empty timeline', () => {
    render(<LeadTimeline events={[]} loading={false} error="Could not load activity." />)

    expect(screen.getByText('Could not load activity.')).toBeTruthy()
    expect(screen.queryByText(/Nothing has happened/)).toBeNull()
  })

  it('shows an empty state when there genuinely are no events', () => {
    render(<LeadTimeline events={[]} loading={false} error={null} />)

    expect(screen.getByText(/Nothing has happened on this lead yet/)).toBeTruthy()
  })
})

describe('messages and delivery', () => {
  // Meta's status callbacks carry a wamid and no leadId, so they arrive as their
  // own events. Folding them onto the message they belong to is what turns two
  // unrelated rows into a tick on a bubble.
  it('folds a delivery status onto its message instead of listing it', () => {
    render(
      <LeadTimeline
        loading={false}
        error={null}
        events={[
          event({ type: 'message_out', ts: '2026-08-16T16:17:05.000Z#a', body: 'Hello there', wamid: 'w1' }),
          event({ type: 'message_status', ts: '2026-08-16T16:17:10.000Z#b', wamid: 'w1', status: 'read' }),
        ]}
      />
    )

    expect(screen.getByText('Hello there')).toBeTruthy()
    expect(screen.getByLabelText('read')).toBeTruthy()
    // One event shown, not two: the status is a property of the message.
    expect(screen.getByText('1 event')).toBeTruthy()
  })

  it('shows the latest status when several arrive for one message', () => {
    render(
      <LeadTimeline
        loading={false}
        error={null}
        events={[
          event({ type: 'message_out', ts: '2026-08-16T16:17:05.000Z#a', body: 'Hi', wamid: 'w1' }),
          event({ type: 'message_status', ts: '2026-08-16T16:17:08.000Z#b', wamid: 'w1', status: 'sent' }),
          event({ type: 'message_status', ts: '2026-08-16T16:17:10.000Z#c', wamid: 'w1', status: 'delivered' }),
          event({ type: 'message_status', ts: '2026-08-16T16:17:15.000Z#d', wamid: 'w1', status: 'read' }),
        ]}
      />
    )

    expect(screen.getByLabelText('read')).toBeTruthy()
    expect(screen.queryByLabelText('sent')).toBeNull()
  })

  // A template costs money and is the only thing that can send outside the 24h
  // window, so a client reading their own spend needs to tell them apart.
  it('marks a template send', () => {
    render(
      <LeadTimeline
        loading={false}
        error={null}
        events={[
          event({
            type: 'message_out',
            ts: '2026-08-16T14:00:00.000Z#a',
            body: 'Hi Ravi',
            mode: 'template',
            templateName: 'lead_welcome_qualify_1',
          }),
        ]}
      />
    )

    expect(screen.getByText(/template · lead_welcome_qualify_1/)).toBeTruthy()
  })

  it('surfaces Meta failure detail on a failed send', () => {
    render(
      <LeadTimeline
        loading={false}
        error={null}
        events={[
          event({ type: 'message_out', ts: '2026-08-16T14:00:00.000Z#a', body: 'Hi', wamid: 'w1' }),
          event({
            type: 'message_status',
            ts: '2026-08-16T14:00:05.000Z#b',
            wamid: 'w1',
            status: 'failed',
            errorDetail: 'code=131047 Re-engagement message',
          }),
        ]}
      />
    )

    expect(screen.getByText('failed')).toBeTruthy()
  })
})

describe('agent actions', () => {
  // The part competitors do not show: what the machine did, interleaved with
  // what was said.
  it('renders journey steps in language a client understands', () => {
    render(
      <LeadTimeline
        loading={false}
        error={null}
        events={[
          event({ type: 'journey_step', ts: '2026-08-16T14:00:00.000Z#a', body: 'await_reply' }),
          event({ type: 'journey_step', ts: '2026-08-16T14:01:00.000Z#b', body: 'wait_and_recheck_check' }),
        ]}
      />
    )

    // Not "await_reply", which means nothing to a client.
    expect(screen.getByText('Waiting for a reply')).toBeTruthy()
    expect(screen.getByText('Checking whether a visit was booked')).toBeTruthy()
  })

  it('renders capture, journey start, tool calls and handoff', () => {
    render(
      <LeadTimeline
        loading={false}
        error={null}
        events={[
          event({ type: 'lead_captured', ts: '2026-08-16T14:00:00.000Z#a', body: 'whatsapp:+91 70070 28001' }),
          event({ type: 'journey_started', ts: '2026-08-16T14:00:01.000Z#b', body: 'Real estate lead qualification' }),
          event({ type: 'tool_call', ts: '2026-08-16T14:00:02.000Z#c', toolName: 'booking' }),
          event({ type: 'handoff', ts: '2026-08-16T14:00:03.000Z#d', reason: 'No booking after three checks' }),
        ]}
      />
    )

    expect(screen.getByText(/Lead captured from whatsapp:\+91 70070 28001/)).toBeTruthy()
    expect(screen.getByText(/Journey started: Real estate lead qualification/)).toBeTruthy()
    expect(screen.getByText('Used booking')).toBeTruthy()
    expect(screen.getByText(/Handed to a human: No booking after three checks/)).toBeTruthy()
  })

  // The sort key is `${iso}#${uuid}`; rendering it raw would show a uuid to the
  // client.
  it('formats the composite sort key as a readable time', () => {
    render(
      <LeadTimeline
        loading={false}
        error={null}
        events={[event({ type: 'journey_step', ts: '2026-08-16T14:00:00.000Z#abc-def', body: 'await_reply' })]}
      />
    )

    expect(screen.queryByText(/abc-def/)).toBeNull()
  })
})

// REGRESSION. journey_ended used to render a flat "Journey finished" for every
// outcome, which was harmless while nothing ever wrote the event. Now that the
// engine writes one with an outcome, a CRASHED journey would have read as
// "finished" in the one timeline a client actually sees — reproducing the exact
// ambiguity the terminal event was added to remove.
describe('how a journey ended', () => {
  it('says a failed journey stopped on an error, and names the error', () => {
    render(
      <LeadTimeline
        events={[
          event({
            type: 'journey_ended',
            ts: '2026-08-29T10:00:00.000Z#1',
            outcome: 'failed',
            errorDetail: 'States.TaskFailed: booking blew up',
          }),
        ]}
        loading={false}
        error={null}
      />
    )

    expect(screen.getByText(/Journey stopped on an error/)).toBeTruthy()
    expect(screen.getByText(/booking blew up/)).toBeTruthy()
    expect(screen.queryByText('Journey finished')).toBeNull()
  })

  it('distinguishes a handoff ending from a completion', () => {
    render(
      <LeadTimeline
        events={[event({ type: 'journey_ended', ts: '2026-08-29T10:00:00.000Z#1', outcome: 'handed_off' })]}
        loading={false}
        error={null}
      />
    )

    expect(screen.getByText('Journey ended — handed to a human')).toBeTruthy()
  })

  it('still reads as finished when it completed normally', () => {
    render(
      <LeadTimeline
        events={[event({ type: 'journey_ended', ts: '2026-08-29T10:00:00.000Z#1', outcome: 'completed' })]}
        loading={false}
        error={null}
      />
    )

    expect(screen.getByText('Journey finished')).toBeTruthy()
  })
})
