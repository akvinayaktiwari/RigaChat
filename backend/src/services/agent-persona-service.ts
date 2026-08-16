import { getJourneyBundleById } from '../repositories/journey-repository.js'
import {
  getJourneyTriggerClaim,
  triggerClaimKey,
} from '../repositories/journey-trigger-claim-repository.js'
import type { Agent } from '../types/index.js'

// -------------------------------------------------------------------------
// Which persona answers a message, and the guard that is never optional.
//
// Settled as D14 in the 2026-08-16 eng review. Three persona sources existed and
// none of them lived on the Agent:
//   web chat  -> derived at runtime in chat-service.ts from the bot's name
//   journey   -> AgentConfig.systemPrompt, authored in the bundle
//   voice     -> built in voice-relay from name + greeting
//
// The failure being avoided is the voice flipping mid-conversation. A lead can
// message while a journey is parked (the journey supplies the persona) or when
// nothing is running (it finished, timed out, or they tapped the WhatsApp button
// cold). If those two paths use different personas, the same lead on the same
// thread gets a different personality depending on whether an execution happens
// to be parked.
//
// So: the Agent's published bundle persona wins, and the derived prompt is the
// fallback for an Agent that has no published journey yet.
// -------------------------------------------------------------------------

export type PersonaSource = 'published_bundle' | 'derived'

export interface ResolvedPersona {
  systemPrompt: string
  source: PersonaSource
}

// Non-negotiable, and appended by CODE rather than trusted to the persona text.
//
// AgentConfig.systemPrompt is client-authored: someone can write a bundle
// persona with no grounding instruction at all, and then the agent would invent
// prices and possession dates to a real buyer. The project's RAG standards in
// CLAUDE.md say this instruction must always be present and must never be
// removed, so it is enforced here instead of hoped for.
const HALLUCINATION_GUARD = [
  'Answer using ONLY the provided context.',
  'If the context does not contain the answer, say exactly:',
  '"I don\'t have that information right now. Would you like to speak with our team?"',
  'Never invent prices, availability, floor plans, possession dates, or legal or approval status.',
  'Never add information that is not in the context.',
].join('\n')

// Mirrors the shape chat-service.ts builds for the web widget, so an Agent with
// no published journey sounds like its own web bot rather than like nothing.
function derivedPersona(botName: string): string {
  return [
    `You are ${botName}, an AI assistant talking to a prospective customer on WhatsApp.`,
    'Keep replies short and conversational, two or three sentences at most.',
  ].join('\n')
}

// The trigger whose bundle defines the Agent's voice when several exist.
// Today every client has at most one published bundle (verified 2026-08-16: two
// bundles total, one published, one claim), so this only matters later.
const PERSONA_TRIGGER = 'lead_captured' as const

export async function resolveAgentPersona(
  agent: Agent,
  botId: string,
  botName: string
): Promise<ResolvedPersona> {
  const authored = await findPublishedPersona(agent, botId)

  const base = authored ?? derivedPersona(botName)

  return {
    // Guard last so it cannot be overridden by anything the persona said
    // earlier. Models weight later instructions heavily, and this is the one
    // instruction that must win.
    systemPrompt: `${base}\n\n${HALLUCINATION_GUARD}`,
    source: authored ? 'published_bundle' : 'derived',
  }
}

async function findPublishedPersona(agent: Agent, botId: string): Promise<string | null> {
  try {
    const claim = await getJourneyTriggerClaim(
      triggerClaimKey({ agentId: agent.agentId, botId }, PERSONA_TRIGGER)
    )
    if (!claim) return null

    const bundle = await getJourneyBundleById(claim.botId, claim.bundleId)
    if (!bundle || bundle.status !== 'published') return null

    const prompt = bundle.agent?.systemPrompt?.trim()
    return prompt && prompt.length > 0 ? prompt : null
  } catch (error) {
    // Falling back to the derived persona is strictly better than failing the
    // turn: the lead still gets a grounded answer, just a less characterful one.
    console.error(
      `[persona] could not read the published persona for agent ${agent.agentId}:`,
      error instanceof Error ? error.message : error
    )
    return null
  }
}

// Exported for the eval suite, which asserts the guard survives a persona that
// deliberately omits it.
export const HALLUCINATION_GUARD_TEXT = HALLUCINATION_GUARD
