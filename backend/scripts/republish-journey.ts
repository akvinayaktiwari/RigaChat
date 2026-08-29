// Recompiles and republishes an existing journey bundle, for when its compiled
// ASL has fallen behind the compiler. Same code path as
// POST /api/journeys/:botId/:bundleId/publish, minus the Cognito hop -- the
// route needs an ID token, and the account this is run against is
// Google-federated, so there is no programmatic sign-in to script.
//
// Safe to re-run: publishJourneyBundle re-claims its OWN trigger
// (attribute_not_exists(claimKey) OR bundleId = :bundleId), and Step Functions
// mints a new version only when the definition actually changed.
//
// Written for bundle 8308655c on 2026-08-25, compiled before the lastResult
// passthrough existed, whose send_message steps therefore ignored every
// composed reply and sent the authored line instead.
//
// Run from the backend/ directory:
//   TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/republish-journey.ts <botId> <bundleId> <clientId> [--dry-run]

import { getJourneyBundleById } from '../src/repositories/journey-repository.js'
import { compileJourneyToAsl } from '../src/services/journey-compiler-service.js'
import { publishJourneyBundle } from '../src/services/journey-service.js'

const [botId, bundleId, clientId] = process.argv.slice(2)
const dryRun = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  const bundle = await getJourneyBundleById(botId, bundleId)
  if (!bundle) throw new Error(`bundle not found: ${botId}/${bundleId}`)
  console.log(`bundle: ${bundle.name} status=${bundle.status} version=${bundle.publishedVersion}`)

  const asl = compileJourneyToAsl(bundle.journey)
  const states = asl.States as Record<
    string,
    { Type?: string; Parameters?: Record<string, unknown>; Catch?: { ErrorEquals: string[]; Next: string }[]; End?: boolean; Next?: string }
  >

  // What the recompile is FOR, printed so a dry run proves it rather than
  // implying it. Updated 2026-08-29: the original diagnostic checked the
  // lastResult passthrough (the 2026-08-25 fix); the reason to republish now is
  // that terminal states did not exist when this bundle was last compiled, so
  // it can never record how a journey ended.
  const terminals = Object.keys(states).filter((name) => name.startsWith('__journey_'))
  console.log(`  terminal states: ${terminals.length ? terminals.join(', ') : 'NONE — this journey cannot record an ending'}`)

  const tasks = Object.entries(states).filter(([, state]) => state.Type === 'Task')
  const uncaught = tasks.filter(([name, state]) => !name.startsWith('__journey_') && !state.Catch?.length)
  console.log(`  tasks: ${tasks.length}, without a catch-all: ${uncaught.length}${uncaught.length ? ` (${uncaught.map(([n]) => n).join(', ')})` : ''}`)

  const strandedEnds = Object.entries(states).filter(([name, state]) => state.End === true && !name.startsWith('__journey_'))
  console.log(`  steps still ending in place (should be 0): ${strandedEnds.length}${strandedEnds.length ? ` (${strandedEnds.map(([n]) => n).join(', ')})` : ''}`)

  for (const [name, state] of Object.entries(states)) {
    const params = state.Parameters ?? {}
    if ('operation' in params && params.operation === 'send_message') {
      console.log(`  send_message step "${name}": lastResult.$ = ${'lastResult.$' in params ? 'PRESENT' : 'MISSING'}`)
    }
  }

  if (dryRun) {
    console.log('\nDry run - nothing published.')
    return
  }

  const published = await publishJourneyBundle(botId, bundleId, clientId)
  console.log(`\npublished version=${published.publishedVersion}`)
  console.log(`versionArn=${published.compiledStateMachineVersionArn}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
