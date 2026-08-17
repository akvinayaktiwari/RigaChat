import { getBotById } from '../repositories/bot-repository.js'
import { appendLeadEvent } from '../repositories/lead-event-repository.js'
import { getPendingReply } from '../repositories/journey-pending-reply-repository.js'
import { isOptedOut } from '../repositories/whatsapp-inbound-activity-repository.js'
import { resolveAgentPersona } from './agent-persona-service.js'
import { generateChatCompletion } from './openai-service.js'
import { retrieveAgentContext } from './rag-service.js'
import { sendWhatsAppMessageToLead } from './whatsapp-service.js'
import type { Agent, JourneyLead } from '../types/index.js'

// -------------------------------------------------------------------------
// One inbound message, one answer, grounded in the Agent's knowledge base.
//
// This is the gap that made the product a scripted drip rather than an agent:
// retrieveContext had exactly three callers (web chat, voice, indexing) and
// WhatsApp was not among them. A lead asking "what's the price of a 3 BHK?" got
// the next scripted line, or when no journey was parked, nothing at all.
//
// WHO SENDS (D12, the load-bearing decision):
//
//   journey parked  -> this handler does NOT send. It returns the composed text
//                      and the caller resolves the callback token; the journey's
//                      next send_message step does the sending.
//   no journey      -> this handler composes AND sends.
//
// Exactly one message per inbound turn, by construction. The earlier design
// (compose, send, then resolve the token) double-sends, because resuming wakes
// the state machine and its next send_message fires regardless of whether that
// step's text is scripted or composed.
// -------------------------------------------------------------------------

// Bounds the OpenAI call. This runs inside a webhook Meta retries when it is
// slow and disables when it keeps failing, so a hung completion is not a slow
// reply, it is a route to losing the integration.
const COMPOSE_TIMEOUT_MS = 12_000

// Deliberately plain. Reached only when the model itself did not answer in time,
// and a lead reading it should get a human, not an apology loop.
const COMPOSE_FALLBACK =
  "Thanks for your message. Let me get a colleague to help you with that."

export type TurnOutcome =
  | { status: 'sent'; text: string }
  | { status: 'composed_for_journey'; text: string }
  | { status: 'skipped'; reason: 'opted_out' | 'no_phone' | 'empty_message' | 'bot_missing' | 'scripted_only' }

export interface AgentTurnInput {
  agent: Agent
  botId: string
  clientId: string
  lead: JourneyLead
  message: string
}

// Everything this Agent can draw on. The union, per D4 and the 2026-07-29
// design: web namespace plus the voice binding when one exists, so a client who
// put pricing in their voice KB is not told "I don't have that information" on
// WhatsApp by what the dashboard calls the same Agent.
function namespacesFor(agent: Agent, botId: string): string[] {
  return [botId, agent.channels.voice?.resourceId].filter((id): id is string => Boolean(id))
}

async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function runAgentTurn(input: AgentTurnInput): Promise<TurnOutcome> {
  const { agent, botId, clientId, lead, message } = input

  const text = message.trim()
  if (text.length === 0) {
    return { status: 'skipped', reason: 'empty_message' }
  }

  // The kill switch, checked before the OpenAI call for the same reason opt-out
  // is: an Agent that has been switched back to scripted must not spend a
  // completion, and must not be able to say anything of its own.
  //
  // Skipping here is precisely "fully scripted", not "silent". The caller only
  // sets composedReply on 'composed_for_journey', so a skip leaves it undefined
  // and handleInboundLeadMessage still resumes the parked journey -- whose next
  // send_message then sends its authored messageHint. With no journey parked
  // nothing is sent at all, which is exactly what this Agent did before it
  // could compose.
  if (agent.scriptedOnly) {
    console.log(`[agent-turn] agent ${agent.agentId} is scripted-only; not composing for lead ${lead.leadId}`)
    return { status: 'skipped', reason: 'scripted_only' }
  }

  // Checked before anything else, including before spending an OpenAI call. A
  // lead who asked to stop must not be answered, and opt-out is the one piece of
  // lead-side hygiene this product already has.
  if (await isOptedOut(lead.leadId)) {
    return { status: 'skipped', reason: 'opted_out' }
  }

  const bot = await getBotById(botId, clientId)
  if (!bot) {
    console.error(`[agent-turn] bot ${botId} not found for client ${clientId}`)
    return { status: 'skipped', reason: 'bot_missing' }
  }

  const [persona, context] = await Promise.all([
    resolveAgentPersona(agent, botId, bot.name),
    retrieveAgentContext(namespacesFor(agent, botId), text),
  ])

  const composed = await withTimeout(
    compose(persona.systemPrompt, context, text),
    COMPOSE_TIMEOUT_MS,
    () => {
      console.error(`[agent-turn] compose timed out after ${COMPOSE_TIMEOUT_MS}ms for lead ${lead.leadId}`)
      return COMPOSE_FALLBACK
    }
  )

  // A journey parked on this lead owns the send. Returning the text lets the
  // caller resolve the token with it so the journey's next step can use what the
  // lead actually said, instead of this handler racing the state machine.
  const parked = await getPendingReply(lead.leadId)
  if (parked) {
    return { status: 'composed_for_journey', text: composed }
  }

  if (!lead.phone) {
    return { status: 'skipped', reason: 'no_phone' }
  }

  const result = await sendWhatsAppMessageToLead(clientId, lead.phone, composed)

  await appendLeadEvent({
    leadId: lead.leadId,
    clientId,
    botId,
    type: 'message_out',
    channel: 'whatsapp',
    mode: 'free_text',
    body: composed,
    ...(result.messageId ? { wamid: result.messageId } : {}),
    ...(result.success ? {} : { errorDetail: result.error }),
  })

  return { status: 'sent', text: composed }
}

// Kept separate so the eval suite can drive composition directly without a lead,
// a webhook, or a WhatsApp send.
export async function compose(
  systemPrompt: string,
  context: string[],
  userMessage: string
): Promise<string> {
  // An explicit empty marker rather than an absent section. Left implicit, the
  // model treats "no context" as "answer from what you know", which is exactly
  // the invention the guard exists to stop.
  const contextBlock =
    context.length > 0 ? context.join('\n\n---\n\n') : '(no relevant information found)'

  return generateChatCompletion({
    systemPrompt: `${systemPrompt}\n\nCONTEXT:\n${contextBlock}`,
    userPrompt: userMessage,
    // Short on purpose: this is WhatsApp, not email. The persona already asks
    // for two or three sentences; the cap is the backstop when it does not.
    maxTokens: 300,
    // Low but not zero. Grounded answers should be near-deterministic, while a
    // little variation stops repeated nudges reading like a copy-paste.
    temperature: 0.3,
  })
}
