// Creates the WhatsApp message templates defined in
// src/lib/whatsapp-templates.ts on a WABA, and reports what Meta did with
// each one.
//
// Idempotent: existing templates are listed first and any name already present
// is skipped, so a re-run after a partial failure creates nothing extra. Meta
// rejects a duplicate name outright, so skipping is the correct behaviour
// rather than a convenience.
//
// The token needs whatsapp_business_management (NOT the _messaging scope used
// for sending). Get one from App Dashboard -> WhatsApp -> API Setup, or from
// the Graph API Explorer.
//
// Run from the backend/ directory:
//   META_WABA_ID=... META_WHATSAPP_ACCESS_TOKEN=... \
//     TS_NODE_TRANSPILE_ONLY=true node --env-file=.env --loader ts-node/esm \
//     scripts/create-whatsapp-templates.ts [--dry-run]

import { metaWhatsAppProvider } from '../src/providers/meta-whatsapp-provider.js'
import {
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_LANGUAGE,
  type WhatsAppTemplateDefinition,
} from '../src/lib/whatsapp-templates.js'

// A template's identity on a WABA is name + language, not name alone: the
// same name in two languages is two separate templates, and Meta only rejects
// a duplicate when BOTH match. Keying the skip check on name alone would
// wrongly skip a template that exists only in another language.
function templateKey(name: string, language: string): string {
  return `${name}::${language}`
}

function languageOf(definition: WhatsAppTemplateDefinition): string {
  return definition.language ?? WHATSAPP_TEMPLATE_LANGUAGE
}

interface ScriptConfig {
  wabaId: string
  accessToken: string
  dryRun: boolean
}

function readConfig(): ScriptConfig {
  const wabaId = process.env.META_WABA_ID
  const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN

  if (!wabaId || !accessToken) {
    throw new Error(
      'Set META_WABA_ID and META_WHATSAPP_ACCESS_TOKEN. The token needs the whatsapp_business_management scope.'
    )
  }

  return { wabaId, accessToken, dryRun: process.argv.includes('--dry-run') }
}

function printPlan(existingKeys: Set<string>): void {
  console.log(`\n=== Plan (default language: ${WHATSAPP_TEMPLATE_LANGUAGE}) ===`)
  for (const template of WHATSAPP_TEMPLATES) {
    const language = languageOf(template)
    const exists = existingKeys.has(templateKey(template.name, language))
    const action = exists ? 'SKIP (already exists)' : `CREATE as ${template.category}`
    console.log(`  ${template.name.padEnd(26)} [${language}] ${action}`)
    console.log(`  ${' '.repeat(26)} sent by: ${template.sentBy}`)
  }
}

interface RunSummary {
  created: number
  skipped: number
  failed: { name: string; error: string }[]
  reclassified: { name: string; requested: string; assigned: string }[]
}

async function createMissing(config: ScriptConfig, existingKeys: Set<string>): Promise<RunSummary> {
  const summary: RunSummary = { created: 0, skipped: 0, failed: [], reclassified: [] }

  for (const template of WHATSAPP_TEMPLATES) {
    if (existingKeys.has(templateKey(template.name, languageOf(template)))) {
      summary.skipped++
      continue
    }

    const result = await metaWhatsAppProvider.createMessageTemplate(config.wabaId, config.accessToken, template)

    if (!result.success) {
      summary.failed.push({ name: template.name, error: result.error })
      console.log(`  ✗ ${template.name}: ${result.error}`)
      continue
    }

    summary.created++
    console.log(`  ✓ ${template.name} -> id ${result.id}, status ${result.status}, category ${result.category}`)

    if (result.category !== template.category) {
      summary.reclassified.push({ name: template.name, requested: template.category, assigned: result.category })
    }
  }

  return summary
}

function printSummary(summary: RunSummary): void {
  console.log('\n=== Summary ===')
  console.log(`Created: ${summary.created}`)
  console.log(`Skipped (already existed): ${summary.skipped}`)
  console.log(`Failed: ${summary.failed.length}`)
  for (const { name, error } of summary.failed) {
    console.log(`  - ${name}: ${error}`)
  }

  if (summary.reclassified.length > 0) {
    console.log('\nMeta RECLASSIFIED these (a pricing change, not an error):')
    for (const { name, requested, assigned } of summary.reclassified) {
      console.log(`  - ${name}: requested ${requested}, assigned ${assigned}`)
    }
  }

  console.log('\nTemplates are created as PENDING and must be APPROVED before they can send.')
  console.log('Re-run with --dry-run to check approval status.')
}

async function main(): Promise<void> {
  const config = readConfig()
  console.log(`WABA: ${config.wabaId}${config.dryRun ? ' (dry run)' : ''}`)

  const existing = await metaWhatsAppProvider.listMessageTemplates(config.wabaId, config.accessToken)
  console.log(`Found ${existing.length} existing template(s).`)
  for (const template of existing) {
    console.log(`  - ${template.name} [${template.status}, ${template.category}, ${template.language}]`)
  }

  const existingKeys = new Set(existing.map((template) => templateKey(template.name, template.language)))
  printPlan(existingKeys)

  if (config.dryRun) {
    console.log('\nDry run - nothing created.')
    return
  }

  console.log('\n=== Creating ===')
  printSummary(await createMissing(config, existingKeys))
}

main().catch((error) => {
  console.error('Template creation script failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
