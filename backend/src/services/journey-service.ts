import {
  createJourneyBundle as createJourneyBundleRepo,
  deleteJourneyBundle as deleteJourneyBundleRepo,
  getJourneyBundleById,
  getJourneyBundlesByBotId,
  updateJourneyBundle as updateJourneyBundleRepo,
} from '../repositories/journey-repository.js'
import { compileJourneyToAsl, JourneyCompileError } from './journey-compiler-service.js'
import { getBotConfig } from './bot-service.js'
import type { AgentConfig, JourneyBundle, JourneyDefinition } from '../types/index.js'

export class JourneyValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JourneyValidationError'
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

interface CreateJourneyBundleInput {
  botId: string
  clientId: string
  name: string
  description?: string
  isPrebuiltTemplate: boolean
  sourceTemplateId?: string
  journey: Omit<JourneyDefinition, 'botId' | 'clientId'>
  agent: AgentConfig
}

// Compiles (structure + toolbox validation) before persisting so a broken
// Journey never reaches DynamoDB as a draft that looks saved but can't
// actually publish -- fail fast at the point the client is still editing,
// not later when they try to activate it.
export async function createJourneyBundle(input: CreateJourneyBundleInput): Promise<JourneyBundle> {
  await getBotConfig(input.botId, input.clientId)

  const journey: JourneyDefinition = { ...input.journey, botId: input.botId, clientId: input.clientId }
  validateToolboxCoverage(journey, input.agent)

  try {
    compileJourneyToAsl(journey)
  } catch (error) {
    if (error instanceof JourneyCompileError) {
      throw new JourneyValidationError(error.message)
    }
    throw error
  }

  return createJourneyBundleRepo({
    botId: input.botId,
    clientId: input.clientId,
    name: input.name,
    description: input.description,
    isPrebuiltTemplate: input.isPrebuiltTemplate,
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
