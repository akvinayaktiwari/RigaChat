import {
  createJourneyBundle as createJourneyBundleRepo,
  deleteJourneyBundle as deleteJourneyBundleRepo,
  JourneyBundleStateConflictError,
  getJourneyBundleById,
  getJourneyBundlesByBotId,
  updateJourneyBundle as updateJourneyBundleRepo,
} from '../repositories/journey-repository.js'
import { compileJourneyToAsl, JourneyCompileError } from './journey-compiler-service.js'
import { getBotConfig } from './bot-service.js'
import { resolveOwningAgentId } from './agent-service.js'
import { findInvalidCapabilities, MCP_CAPABILITIES } from '../lib/mcp-capabilities.js'
import { findJourneyTemplate, listJourneyTemplates } from '../lib/journey-templates/index.js'
import { createOrUpdateStateMachine, deleteStateMachine, stateMachineNameFor } from '../lib/step-functions.js'
import {
  claimJourneyTrigger,
  releaseJourneyTrigger,
  triggerClaimKey,
} from '../repositories/journey-trigger-claim-repository.js'
import type {
  JourneyPlan, AgentConfig, JourneyBundle, JourneyDefinition, JourneyTemplate } from '../types/index.js'

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
  // Authoring state only. Stored so the plan builder can reopen what was
  // authored; `journey` and `agent` are still what executes, and are still
  // validated and compiled below regardless of what this says.
  plan?: JourneyPlan
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
    ...(input.plan ? { plan: input.plan } : {}),
    status: 'draft',
  })
}

// The prebuilt agent library. Read-only and identical for every client --
// templates are code, not per-client rows, so there is nothing to scope by
// clientId here and nothing a client can mutate.
export function getJourneyTemplates(): JourneyTemplate[] {
  return listJourneyTemplates()
}

export class JourneyTemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Journey template "${templateId}" not found`)
    this.name = 'JourneyTemplateNotFoundError'
  }
}

// Clone a prebuilt agent into an ordinary client-owned bundle. Routed through
// createJourneyBundle rather than writing to the repository directly, so a
// clone inherits the same bot-ownership check, palette validation, toolbox
// coverage check and ASL compile a hand-authored bundle gets -- a template is
// trusted, but the bot it's being attached to still isn't.
//
// journeyId and personaId are re-minted: the template's own ids identify the
// template, and reusing them would make two clones of the same template
// indistinguishable from each other. Provenance is carried by sourceTemplateId
// instead, which is the one field a client cannot set themselves.
export async function createJourneyBundleFromTemplate(input: {
  templateId: string
  botId: string
  clientId: string
  name?: string
}): Promise<JourneyBundle> {
  const template = findJourneyTemplate(input.templateId)
  if (!template) {
    throw new JourneyTemplateNotFoundError(input.templateId)
  }

  return createJourneyBundle({
    botId: input.botId,
    clientId: input.clientId,
    name: input.name?.trim() || template.name,
    description: template.description,
    sourceTemplateId: template.templateId,
    journey: { ...template.journey, journeyId: crypto.randomUUID() },
    agent: { ...template.agent, personaId: crypto.randomUUID() },
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
  plan?: JourneyPlan
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

  // Editing a published bundle drops it back to draft, and a draft is not
  // handling its trigger any more -- so it must not keep holding the claim.
  // Leaving it held would block the client from publishing any other journey on
  // that trigger while this one sits half-edited. In-flight executions are
  // unaffected: they keep running the version they started on, so releasing
  // here only governs which bundle NEW leads ignite into.
  if (existing.status === 'published') {
    await releaseJourneyTrigger(
      triggerClaimKey({ agentId: existing.agentId, botId }, existing.journey.triggerType),
      bundleId
    ).catch((error) => {
      console.error(`[journey] failed to release trigger claim while editing bundle ${bundleId}:`, error)
    })
  }

  return updateJourneyBundleRepo(botId, bundleId, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    journey: nextJourney,
    agent: nextAgent,
    ...(updates.plan !== undefined ? { plan: updates.plan } : {}),
    // Any edit invalidates a previously published state machine's shape --
    // publishing again is a separate, explicit action (publishJourneyBundle
    // below), not an implicit side effect of saving edits.
    status: 'draft',
  })
}

// Releases the trigger claim and tears down the state machine before dropping
// the record, so deleting a bundle doesn't leave its trigger permanently held
// by a bundle that no longer exists -- which would block the client from ever
// publishing another journey on it.
//
// Both cleanups are best-effort and deliberately do not block the delete: if
// AWS is unavailable, the client's delete should still succeed rather than
// failing on a resource they cannot see.
//
// CAVEAT, verified live 2026-08-06: deleting the state machine can FAIL leads
// currently running that journey (`States.Runtime: State machine ... has been
// deleted`) rather than letting them finish. A client deleting a published
// journey therefore drops anyone mid-flight. The dashboard now warns before
// that click and points at pauseJourneyBundle instead (JourneysPage.tsx),
// which is the whole reason pause keeps the state machine alive.
export async function deleteJourneyBundle(botId: string, bundleId: string, clientId: string): Promise<void> {
  const existing = await getOwnedJourneyBundle(botId, bundleId, clientId)

  await releaseJourneyTrigger(
    triggerClaimKey({ agentId: existing.agentId, botId }, existing.journey.triggerType),
    bundleId
  ).catch((error) => {
    console.error(`[journey] failed to release trigger claim for bundle ${bundleId}:`, error)
  })

  if (existing.compiledStateMachineArn) {
    await deleteStateMachine(existing.compiledStateMachineArn).catch((error) => {
      console.error(`[journey] failed to delete state machine for bundle ${bundleId}:`, error)
    })
  }

  await deleteJourneyBundleRepo(botId, bundleId)
}

// Takes a published journey off the air without destroying anything.
//
// Pausing is only the trigger claim being released: new leads stop igniting
// into this bundle, and the client is free to publish a different journey on
// the same trigger. The compiled state machine and its published version arn
// are deliberately KEPT, which is what separates pause from delete --
// in-flight executions keep running to completion instead of failing with
// `States.Runtime: State machine has been deleted`, and resuming is a
// republish of the same definition rather than a rebuild.
//
// Resuming is publishJourneyBundle: it re-claims the trigger and re-publishes
// the (unchanged) definition, which Step Functions answers with the existing
// version rather than minting a new one.
export async function pauseJourneyBundle(botId: string, bundleId: string, clientId: string): Promise<JourneyBundle> {
  const existing = await getOwnedJourneyBundle(botId, bundleId, clientId)

  if (existing.status !== 'published') {
    throw new JourneyValidationError('Only a published journey can be paused')
  }

  // Ordered so a failure leaves no state that lies. The status write is
  // conditional on the bundle STILL being published, which is what makes the
  // pair safe against a concurrent publish of the same bundle: without it, the
  // interleaving (publish claims -> pause releases -> pause writes paused ->
  // publish writes published) ends with status 'published' and no trigger
  // claim, i.e. a journey the dashboard shows as Live that no lead can ever
  // enter. Losing the race now fails as a 400 and leaves the winner's state.
  await releaseJourneyTrigger(
    triggerClaimKey({ agentId: existing.agentId, botId }, existing.journey.triggerType),
    bundleId
  )

  const claimKey = triggerClaimKey({ agentId: existing.agentId, botId }, existing.journey.triggerType)

  try {
    return await updateJourneyBundleRepo(botId, bundleId, { status: 'paused' }, 'published')
  } catch (error) {
    if (error instanceof JourneyBundleStateConflictError) {
      // Someone else moved this bundle first (a republish, an edit, a delete).
      // The claim is deliberately NOT restored: whoever won owns the trigger
      // now, and re-claiming here would either steal it back or resurrect a
      // claim for a bundle that no longer exists.
      throw new JourneyValidationError('Only a published journey can be paused')
    }
    // A real infrastructure failure. The bundle is still 'published' but its
    // claim is gone, which is the one combination that lies: the dashboard
    // shows Live while ignition finds nothing. Put the claim back so the
    // failed pause is a no-op rather than a silent outage, then surface the
    // original error -- best-effort, because if Dynamo is down this fails too.
    await claimJourneyTrigger(claimKey, { bundleId, botId, clientId }).catch((restoreError) => {
      console.error(
        `[journey] pause failed for bundle ${bundleId} AND its trigger claim could not be restored; ` +
          `the bundle reads as published but no lead will ignite into it:`,
        restoreError
      )
    })
    throw error
  }
}

// Compiles, claims the trigger, provisions a real Step Functions state machine,
// and records the immutable version executions will target.
//
// The ordering is the important part, and each step is placed so that failing
// it leaves nothing behind:
//
//   1. compile        -- a broken journey must never reach AWS, so no orphan
//                        state machine can be created by an invalid bundle
//   2. claim trigger  -- before provisioning, so losing the race to another
//                        bundle doesn't leave a machine nobody will ever start
//   3. create/update  -- publishes an immutable version in the same call
//   4. persist        -- the arns and the new version number
//
// Step 3 is the only one that can strand state (crash before step 4), and
// lib/step-functions.ts recovers from exactly that on the next attempt via the
// deterministic name.
export async function publishJourneyBundle(botId: string, bundleId: string, clientId: string): Promise<JourneyBundle> {
  const existing = await getOwnedJourneyBundle(botId, bundleId, clientId)

  let asl
  try {
    asl = compileJourneyToAsl(existing.journey)
  } catch (error) {
    if (error instanceof JourneyCompileError) {
      throw new JourneyValidationError(error.message)
    }
    throw error
  }

  await claimJourneyTrigger(
    triggerClaimKey({ agentId: existing.agentId, botId }, existing.journey.triggerType),
    { bundleId, botId, clientId }
  )

  const published = await createOrUpdateStateMachine(
    stateMachineNameFor(clientId, bundleId),
    JSON.stringify(asl),
    existing.compiledStateMachineArn
  )

  // Conditional on the status this call READ, not on a fixed value, because
  // publish is legitimately entered from draft, paused, and published (a
  // republish). Guarding only the pause side is not enough: with an unguarded
  // write here, the interleaving `publish claims -> pause releases -> pause
  // writes paused -> publish writes published` still ends at 'published' with
  // no trigger claim, which is a journey the dashboard shows as Live that no
  // lead can enter. Codex caught exactly this against the first fix.
  try {
    return await updateJourneyBundleRepo(
      botId,
      bundleId,
      {
        status: 'published',
        compiledStateMachineArn: published.stateMachineArn,
        compiledStateMachineVersionArn: published.versionArn,
        // Taken from the version AWS actually published, never incremented locally.
        // Step Functions does not mint a new version for an unchanged definition, so
        // a counter drifts from reality the first time someone republishes without
        // editing -- verified live on 2026-08-06 (record said 2, arn said :1).
        publishedVersion: published.version,
      },
      existing.status
    )
  } catch (error) {
    if (error instanceof JourneyBundleStateConflictError) {
      // We already hold the claim but lost the status write, so releasing it is
      // mandatory rather than tidy: leaving it held would let a PAUSED bundle
      // keep the trigger and block every other journey from claiming it.
      await releaseJourneyTrigger(
        triggerClaimKey({ agentId: existing.agentId, botId }, existing.journey.triggerType),
        bundleId
      ).catch((releaseError) => {
        console.error(`[journey] failed to release trigger claim after a lost publish race on ${bundleId}:`, releaseError)
      })
      throw new JourneyValidationError(
        'This journey changed while it was being published. Reload it and try again.'
      )
    }
    throw error
  }
}
