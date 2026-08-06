import { realEstateLeadQualification } from './real-estate-lead-qualification.js'
import type { JourneyTemplate } from '../../types/index.js'

// The prebuilt agent library. Adding a template means adding it here and
// committing -- which is the whole enforcement mechanism for "authored by us
// only": no runtime API can add one, so no auth-check regression can expose
// authoring to clients. journey-templates.test.ts compiles every entry, so a
// malformed template fails CI rather than a client's first publish.
const TEMPLATES: readonly JourneyTemplate[] = [realEstateLeadQualification]

// Frozen copy per call: a template is module-level shared state, and handing
// the same object to every clone would let one client's edits (or any
// accidental mutation downstream) leak into the next client's clone.
export function listJourneyTemplates(): JourneyTemplate[] {
  return TEMPLATES.map((template) => structuredClone(template))
}

export function findJourneyTemplate(templateId: string): JourneyTemplate | null {
  const template = TEMPLATES.find((candidate) => candidate.templateId === templateId)
  return template ? structuredClone(template) : null
}
