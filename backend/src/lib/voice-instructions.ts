// The one place that turns an agent record into what the model is told to be.
//
// WHY THIS IS NOT IN voice-relay/relay.ts, WHERE IT USED TO LIVE
//
// Two paths describe the same agent to OpenAI:
//
//   telephony  relay.ts -> buildInstructions(agent) -> session.update
//   browser    the widget fetches GET /api/voice-agents/context/:agentId and
//              sends the instructions back over the relay socket, where
//              applyContext OVERRIDES whatever the relay built
//
// So the relay's copy does not govern the browser at all, and the two had
// already drifted: the route appended the "keep responses concise" line and the
// relay did not, and a whitespace-only systemPrompt was used verbatim by one
// and replaced with the generated persona by the other. Anything added to only
// one of them is silently absent from the other half of the product.
//
// Dependency-free on purpose, like lib/voice-token.ts: the relay is a separate
// esbuild bundle resolved against the box's own node_modules, so a module both
// builds import must pull in no AWS SDK and no service.

// The narrow shape this needs, rather than the whole VoiceAgent. The route
// reads an agent through getVoiceAgentContext, which returns a Pick -- taking
// the full record here would force that projection to widen for no reason.
export interface VoiceInstructionSource {
  name: string
  greetingMessage: string
  systemPrompt?: string
  // The call-recording disclosure. ABSENT MEANS ABSENT: no line is added and
  // the instructions are byte-identical to what they were before this field
  // existed, which is what keeps it safe to ship while the legal question is
  // still open (see the P0 GATE item in TODOS.md).
  recordingDisclosure?: string
}

const CONCISE = 'Keep responses concise — this is a voice conversation, 2-3 sentences max.'

// Prepended, not appended, and worded as an absolute. A model handed a persona
// ending in "be warm and conversational" and then asked to read a legal line
// will soften it; put first and marked as non-negotiable, it is the opening
// turn. It is still an instruction to a model rather than a guarantee -- which
// is exactly why Part 2 of the consent gate (what happens when a caller
// declines) is a separate decision and not implied by this.
function disclosureDirective(disclosure: string): string {
  return [
    'BEFORE ANYTHING ELSE, your very first words on this call must be exactly:',
    `"${disclosure}"`,
    'Say it word for word, before any greeting and before answering anything.',
    'Do not paraphrase it, shorten it, or skip it, even if the caller speaks first.',
  ].join('\n')
}

export function buildVoiceInstructions(agent: VoiceInstructionSource): string {
  const persona =
    agent.systemPrompt?.trim() ||
    `You are ${agent.name}, a helpful voice assistant. Start the call by greeting the caller with: "${agent.greetingMessage}"`

  const disclosure = agent.recordingDisclosure?.trim()
  const parts = disclosure ? [disclosureDirective(disclosure), persona] : [persona]

  return `${parts.join('\n\n')}\n${CONCISE}`
}
