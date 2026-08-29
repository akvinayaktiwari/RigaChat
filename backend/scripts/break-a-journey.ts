// The /office-hours assignment, made runnable: deliberately break a journey,
// push a lead through it, and measure how long it takes to find out what went
// wrong. The number this produces is the thing the observability work has to
// beat, and before this nobody had measured it -- including the person who
// built the system.
//
// Deliberately runs against a TEST bot, never a client's live journey. The
// measurement is about the tooling, not about that particular journey, and an
// experiment that risks a real client's lead follow-up is not worth it.
//
// The break is a booking tool_call whose requestedAt is garbage. That is a real
// failure mode (the MCP booking server rejects it), not a synthetic throw, so
// it exercises the same path a genuine production break would: Task fails ->
// Retry exhausts -> States.ALL Catch -> __journey_failed records the outcome ->
// Fail state ends the execution.
//
// Run from backend/:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/break-a-journey.ts <botId> <clientId>

import { createJourneyBundle, publishJourneyBundle } from '../src/services/journey-service.js'
import { startExecution, executionNameFor } from '../src/lib/step-functions.js'

const [botId, clientId] = process.argv.slice(2)

async function main(): Promise<void> {
  const leadId = `broken-lead-${Date.now()}`

  console.log('=== 1. Creating a journey with a deliberately broken booking step')
  const bundle = await createJourneyBundle({
    botId,
    clientId,
    name: 'DELIBERATELY BROKEN — observability drill',
    description: 'Created by scripts/break-a-journey.ts. Safe to delete.',
    journey: {
      journeyId: `drill-${Date.now()}`,
      name: 'Observability drill',
      triggerType: 'lead_captured',
      startStepId: 'book',
      steps: [
        // Straight to the tool call. No send_message first, so the drill cannot
        // message anyone even if the lead somehow resolves.
        {
          stepId: 'book',
          name: 'Book a site visit',
          type: 'tool_call',
          toolName: 'booking',
          toolInput: { requestedAt: 'THIS-IS-NOT-A-DATE' },
        },
      ],
    },
    agent: {
      personaId: `drill-${Date.now()}`,
      name: 'Drill agent',
      systemPrompt: 'Drill.',
      mcpToolbox: ['booking'],
      channelConfig: {},
    },
  })
  console.log(`    bundleId=${bundle.bundleId}`)

  console.log('=== 2. Publishing it')
  const published = await publishJourneyBundle(botId, bundle.bundleId, clientId)
  console.log(`    version=${published.publishedVersion}`)
  console.log(`    versionArn=${published.compiledStateMachineVersionArn}`)

  console.log('=== 3. Pushing a lead through it')
  const startedAt = new Date()
  const result = await startExecution(
    published.compiledStateMachineVersionArn as string,
    executionNameFor(leadId, bundle.bundleId, published.publishedVersion ?? 1),
    {
      botId,
      bundleId: bundle.bundleId,
      clientId,
      leadId,
      channel: 'web_widget',
      leadSource: 'chat',
      leadParentId: botId,
      journeyVersion: published.publishedVersion ?? 1,
      lastResult: {},
    }
  )

  console.log(`    started=${result.started} at ${startedAt.toISOString()}`)
  console.log()
  console.log('BREAK_AT=' + startedAt.toISOString())
  console.log('BUNDLE_ID=' + bundle.bundleId)
  console.log('LEAD_ID=' + leadId)
  console.log('BOT_ID=' + botId)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
