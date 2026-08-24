// Turns any inbound WhatsApp message into the text the rest of the system
// reasons about.
//
// This exists because a quick-reply button tap is NOT a text message. Meta
// delivers it as `type: 'button'` with the label under `button.text`, and an
// interactive reply as `type: 'interactive'` with the label nested two levels
// down. Every consumer here -- the agent turn, the journey resume, the lead
// transcript -- previously read `message.text.body` and only that, so a tap
// arrived as an empty string: the lead pressed a button, the agent was asked to
// answer "", and the journey resumed on nothing.
//
// That made buttons strictly worse than no buttons, which matters because
// lead_followup_nudge_1 and site_visit_reminder_1 already ship quick replies.
// Nothing had sent them in production yet, so it never bit -- this landed
// before the first one went out, not after.
//
// The button's PAYLOAD is deliberately ignored in favour of its visible label.
// The label is what the lead believes they said, and it is what the agent and
// the transcript should see. A payload is an internal id; putting it in a
// conversation transcript makes the transcript a lie.

export type InboundMessageKind = 'text' | 'button' | 'interactive' | 'unsupported'

export interface InboundText {
  text: string
  kind: InboundMessageKind
}

// Meta Cloud API inbound shapes. Only what we read is typed.
export interface MetaInboundMessageShape {
  id?: string
  from?: string
  type?: string
  text?: { body?: string }
  // A tap on a template quick-reply button.
  button?: { text?: string; payload?: string }
  // A tap on an interactive (non-template) button or list row.
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string; description?: string }
  }
}

function clean(value: string | undefined): string {
  return (value ?? '').trim()
}

export function extractMetaInboundText(message: MetaInboundMessageShape): InboundText {
  const asText = clean(message.text?.body)
  if (message.type === 'text' && asText) return { text: asText, kind: 'text' }

  const asButton = clean(message.button?.text)
  if (message.type === 'button' && asButton) return { text: asButton, kind: 'button' }

  if (message.type === 'interactive') {
    const asButtonReply = clean(message.interactive?.button_reply?.title)
    if (asButtonReply) return { text: asButtonReply, kind: 'interactive' }

    const asListReply = clean(message.interactive?.list_reply?.title)
    if (asListReply) return { text: asListReply, kind: 'interactive' }
  }

  // Reactions, media, stickers, location, system notices. Not something a
  // person said in words, and the caller decides what to do about it.
  return { text: '', kind: 'unsupported' }
}

// Gupshup normalises Meta's shapes into its own before delivering them, so the
// button label arrives under a different key again. Gupshup sends
// `type: 'button_reply'` / `'list_reply'` with the label in `title`, and plain
// text under `text`.
export interface GupshupInboundPayloadShape {
  type?: string
  text?: string
  title?: string
  postbackText?: string
}

export function extractGupshupInboundText(payload: GupshupInboundPayloadShape): InboundText {
  const asText = clean(payload.text)
  if (asText && (payload.type === 'text' || payload.type === undefined)) {
    return { text: asText, kind: 'text' }
  }

  if (payload.type === 'button_reply' || payload.type === 'list_reply' || payload.type === 'quick_reply') {
    // `title` is the visible label; postbackText is Gupshup's payload
    // equivalent and only used when a button carried no title at all.
    const label = clean(payload.title) || clean(payload.postbackText)
    if (label) return { text: label, kind: 'button' }
  }

  // Some Gupshup app configurations deliver a button tap with the label in
  // `text` and a non-text type. Falling through to it beats dropping a real
  // reply over a shape difference.
  if (asText) return { text: asText, kind: 'button' }

  return { text: '', kind: 'unsupported' }
}
