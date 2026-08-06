import {
  createJourneyBundle as createJourneyBundleRepo,
  deleteJourneyBundle as deleteJourneyBundleRepo,
  getJourneyBundleById,
  getJourneyBundlesByBotId,
  updateJourneyBundle as updateJourneyBundleRepo,
} from '../repositories/journey-repository.js'
import { compileJourneyToAsl, JourneyCompileError } from './journey-compiler-service.js'
import { getBotConfig } from './bot-service.js'
import { resolveOwningAgentId } from './agent-service.js'
import { findInvalidCapabilities, MCP_CAPABILITIES } from '../lib/mcp-capabilities.js'
import type { AgentConfig, JourneyBundle, JourneyDefinition } from '../types/index.js'

export class JourneyValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JourneyValidationError'
  }
}

// The palette check the type system cannot do for untrusted input: a request
// body is `unknown` at runtime whatever the route's interface claims, so a
// client can still POST `mcpToolbox: ['banana']`. Catching it here (400 via
// JourneyValidationError) means the client finds out while they are still
// editing, instead of the bad name surviving publish and throwing days later
// in journey-executor-service.ts's dispatch, mid-journey, on a real lead.
//
// Runs before validateToolboxCoverage, which is what makes that function's
// membership check transitively sufficient for step toolNames: a step whose
// toolName isn't a real capability cannot be in a palette-valid toolbox.
function validateToolboxPalette(agent: AgentConfig): void {
  if (!Array.isArray(agent.mcpToolbox)) {
    throw new JourneyValidationError('mcpToolbox must be an array of MCP capability names')
  }

  const invalid = findInvalidCapabilities(agent.mcpToolbox)
  if (invalid.length > 0) {
    throw new JourneyValidationError(
      `Unknown MCP ${invalid.length === 1 ? 'capability' : 'capabilities'} ${invalid
        .map((name) => `"${name}"`)
        .join(', ')} in mcpToolbox. Available: ${MCP_CAPABILITIES.join(', ')}`
    )
  }
}

// The compiler (journey-compiler-service.ts) only validates step-graph
// structure -- it has no notion of an agent's toolbox. Cross-referencing
// tool_call steps against AgentConfig.mcpToolbox is this layer's job
// because a JourneyBundle is the only place both pieces are known together
// (see the fused-bundle Decision #2 in the 2026-07-29 design addendum).
function validateToolboxCoverage(journey: JourneyDefinition, agent: AgentConfig): void {
  const toolbox = new Set(agent.mcpToolbox)
  for (const step of journey.steps) {
    if (step.type === 'tool_call' && !toolbox.has(step.toolName)) {
      throw new JourneyValidationError(
        `Step "${step.stepId}" calls tool "${step.toolName}", which is not in this Agent's mcpToolbox (bounded palette: ${agent.mcpToolbox.join(', ') || 'none'})`
      )
    }
  }
}

export interface CreateJourneyBundleInput {
  botId: string
  clientId: string
  name: string
  description?: string
  journey: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent: AgentConfig
  // Set ONLY by createJourneyBundleFromTemplate() below, never from a client
  // request body -- it records provenance, so letting a caller assert it would
  // let any client claim their hand-written bundle came from a platform
  // template. journey-routes.ts deliberately does not forward it.
  sourceTemplateId?: string
}

// Compiles (structure + toolbox validation) before persisting so a broken
// Journey never reaches DynamoDB as a draft that looks saved but can't
// actually publish -- fail fast at the point the client is still editing,
// not later when they try to activate it.
export async function createJourneyBundle(input: CreateJourneyBundleInput): Promise<JourneyBundle> {
  await getBotConfig(input.botId, input.clientId)

  const journey: JourneyDefinition = { ...input.journey, botId: input.botId, clientId: input.clientId }
  validateToolboxPalette(input.agent)
  validateToolboxCoverage(journey, input.agent)

  try {
    compileJourneyToAsl(journey)
  } catch (error) {
    if (error instanceof JourneyCompileError) {
      throw new JourneyValidationError(error.message)
    }
    throw error
  }

  // Stamp the owning cross-channel Agent (resolved from botId's binding) if the
  // bot is wrapped in one. Optional/additive -- undefined is omitted so the
  // record has no agentId attribute rather than an undefined one (the doc client
  // does not strip undefined by default).
  const agentId = await resolveOwningAgentId(input.botId, input.clientId)

  return createJourneyBundleRepo({
    botId: input.botId,
    ...(agentId ? { agentId } : {}),
    clientId: input.clientId,
    name: input.name,
    description: input.description,
    // Always false, never client-settable. Prebuilt agent templates are
    // code-defined seeds in lib/journey-templates/ (only committable by us,
    // and compiler-validated in CI) -- no stored bundle is ever a platform
    // template, so this flag can only be false on a persisted record. It was
    // previously read straight off the request body under client Cognito auth,
    // which let any authenticated client mint a bundle that claimed to be one.
    isPrebuiltTemplate: false,
    sourceTemplateId: input.sourceTemplateId,
    journey,
    agent: input.agent,
    status: 'draft',
  })
}

export async function getJourneyBundles(botId: string, clientId: string): Promise<JourneyBundle[]> {
  await getBotConfig(botId, clientId)
  return getJourneyBundlesByBotId(botId)
}

// 404 either way (missing vs. owned by someone else) -- don't reveal
// existence to a non-owner. Mirrors kb-service.ts's updateKBEntry() and
// voice-service.ts's getOwnedVoiceAgent().
async function getOwnedJourneyBundle(botId: string, bundleId: string, clientId: string): Promise<JourneyBundle> {
  const bundle = await getJourneyBundleById(botId, bundleId)
  if (!bundle || bundle.clientId !== clientId) {
    throw new Error('Journey bundle not found')
  }
  return bundle
}

export async function getJourneyBundle(botId: string, bundleId: string, clientId: string): Promise<JourneyBundle> {
  return getOwnedJourneyBundle(botId, bundleId, clientId)
}

interface UpdateJourneyBundleInput {
  name?: string
  description?: string
  journey?: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent?: AgentConfig
}

export async function updateJourneyBundle(
  botId: string,
  bundleId: string,
  clientId: string,
  updates: UpdateJourneyBundleInput
): Promise<JourneyBundle> {
  const existing = await getOwnedJourneyBundle(botId, bundleId, clientId)

  const nextJourney: JourneyDefinition = updates.journey
    ? { ...updates.journey, botId, clientId }
    : existing.journey
  const nextAgent = updates.agent ?? existing.agent

  // Re-validate whenever either half of the bundle changes, since toolbox
  // coverage and step-graph structure are only meaningful together --
  // editing just the agent's toolbox down could orphan an existing
  // tool_call step just as easily as editing the journey could.
  if (updates.journey || updates.agent) {
    validateToolboxPalette(nextAgent)
    validateToolboxCoverage(nextJourney, nextAgent)
    try {
      compileJourneyToAsl(nextJourney)
    } catch (error) {
      if (error instanceof JourneyCompileError) {
        throw new JourneyValidationError(error.message)
      }
      throw error
    }
  }

  return updateJourneyBundleRepo(botId, bundleId, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    journey: nextJourney,
    agent: nextAgent,
    // Any edit invalidates a previously published state machine's shape --
    // publishing again is a separate, explicit action (publishJourneyBundle
    // below), not an implicit side effect of saving edits.
    status: 'draft',
  })
}

export async function deleteJourneyBundle(botId: string, bundleId: string, clientId: string): Promise<void> {
  await getOwnedJourneyBundle(botId, bundleId, clientId)
  await deleteJourneyBundleRepo(botId, bundleId)
}

// Compiles and stores the resulting ASL's shape as published -- deliberately
// does NOT call AWS to create or update a real Step Functions state machine.
// Provisioning real infrastructure (CreateStateMachine, the IAM execution
// role, wiring journeyExecutorLambdaArn to a real deployed Lambda) is its
// own deployment decision, out of scope for this pass per the approved
// "data model + compiler only" scope. compiledStateMachineArn stays unset
// until that follow-up work lands.
export async function publishJourneyBundle(botId: string, bundleId: string, clientId: string): Promise<JourneyBundle> {
  const existing = await getOwnedJourneyBundle(botId, bundleId, clientId)

  try {
    compileJourneyToAsl(existing.journey)
  } catch (error) {
    if (error instanceof JourneyCompileError) {
      throw new JourneyValidationError(error.message)
    }
    throw error
  }

  return updateJourneyBundleRepo(botId, bundleId, { status: 'published' })
}
