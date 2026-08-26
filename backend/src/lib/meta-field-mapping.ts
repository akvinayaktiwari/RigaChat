// Turns a Meta Lead Ads submission into the normalized lead fields, using three
// sources of truth in descending order of authority.
//
//   1. THE FORM SCHEMA. Meta declares a type per question -- EMAIL, PHONE,
//      FULL_NAME -- and a lookup beats every heuristic below. This is what the
//      mapper should be doing almost all of the time; the other two exist for
//      when the schema cannot be fetched or the question is genuinely CUSTOM.
//
//   2. KEYWORD RULES on the key AND the human label. The label only exists when
//      we have the schema (the webhook payload carries the slug alone), and it
//      is the better input: 'WhatsApp Number' says more than 'whatsapp_number'.
//
//   3. VALUE SHAPE. What the answer LOOKS like, ignoring what it is called.
//      This is the layer that survives a label in Hindi or Marathi, where no
//      English keyword list can help, and it is why a custom-labelled phone
//      question still lands in `phone`.
//
// The order matters: a question is resolved by the most authoritative source
// that has an opinion, and unresolved questions fall through to customFields
// rather than being dropped.

import type { MetaFormQuestion } from '../types/index.js'

export interface MetaFieldDatum {
  name: string
  values: string[]
}

export interface MappedMetaFields {
  name?: string
  phone?: string
  email?: string
  propertyInterest?: string
  budgetRange?: string
  customFields: Record<string, string>
}

export type MappedFieldName = 'name' | 'phone' | 'email' | 'propertyInterest' | 'budgetRange'

// ---------------------------------------------------------------------------
// 1. Form schema
// ---------------------------------------------------------------------------

// Meta's own question types. WORK_EMAIL and WORK_PHONE_NUMBER are the same
// thing to us as their personal counterparts -- a lead has one email we will
// write to, and a B2B form asking for a work address does not change that.
const QUESTION_TYPE_TO_FIELD: Record<string, MappedFieldName> = {
  EMAIL: 'email',
  WORK_EMAIL: 'email',
  PHONE: 'phone',
  PHONE_NUMBER: 'phone',
  WORK_PHONE_NUMBER: 'phone',
  FULL_NAME: 'name',
}

// FIRST_NAME/LAST_NAME are resolved separately: neither is a whole name, so
// they are composed after every question has been read.
const FIRST_NAME_TYPES = new Set(['FIRST_NAME', 'GIVEN_NAME'])
const LAST_NAME_TYPES = new Set(['LAST_NAME', 'FAMILY_NAME', 'SURNAME'])

// ---------------------------------------------------------------------------
// 2. Keyword rules
// ---------------------------------------------------------------------------

// ORDER IS PRECEDENCE and is deliberate, because real question keys match more
// than one rule ('email_or_phone', 'budget_for_property'). It used to be an
// if/else chain, where the precedence was real but invisible and unstated.
//
//   email  first: the most specific token here, and it never appears in a
//          question that is really asking for something else.
//   phone  second, and the reason this list exists in its stated form. Indian
//          real-estate forms very often ask for a 'WhatsApp Number' rather than
//          a phone number, which slugifies to whatsapp_number and matched NO
//          rule under the old chain -- so the lead saved with an empty phone.
//          That is the one field the product cannot work without: lead
//          notifications, journey outreach and the WhatsApp agent are all
//          addressed by it.
//   name   third; exact keys only, because 'name' as a substring appears in
//          company_name, project_name and society_name.
//   budget before property, because 'budget_for_property' is a budget question.
const FIELD_RULES: { field: MappedFieldName; matches: (key: string) => boolean }[] = [
  { field: 'email', matches: (key) => /e_?mail/.test(key) },
  {
    field: 'phone',
    // 'contact' alone is deliberately NOT here: 'preferred_contact_time' is a
    // common question and is not a phone number.
    matches: (key) => /phone|whatsapp|whats_app|wa_?number|mobile|^cell$|cell_?(no|number)|contact_?(no|number)/.test(key),
  },
  {
    field: 'name',
    matches: (key) => key === 'full_name' || key === 'name' || key === 'your_name' || key === 'your_full_name',
  },
  { field: 'budgetRange', matches: (key) => /budget|price_?range/.test(key) },
  { field: 'propertyInterest', matches: (key) => /propert|interest|project|configuration|bhk|unit_?type/.test(key) },
]

// Meta slugifies question text inconsistently -- spaces, hyphens and camelCase
// all appear -- and a human label is free text. Normalizing both through the
// same function means a rule is written once instead of once per spelling.
export function normalizeFieldKey(name: string): string {
  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveByKeyword(rawName: string, label?: string): MappedFieldName | null {
  // The label first when we have one: it is what a human wrote, where the key
  // is whatever Meta's slugifier produced from it.
  for (const candidate of [label, rawName]) {
    if (!candidate) continue

    const key = normalizeFieldKey(candidate)
    const hits = FIELD_RULES.filter((rule) => rule.matches(key))
    if (hits.length === 0) continue

    // The complaint this answers: under the old if/else chain a key matching
    // two rules was resolved by source order with nothing recorded, so a client
    // whose form used an ambiguous label had no way to find out why their CRM
    // column was wrong.
    if (hits.length > 1) {
      console.warn(
        `[meta-lead] "${candidate}" matched ${hits.length} rules (${hits.map((hit) => hit.field).join(', ')}); using "${hits[0].field}"`
      )
    }
    return hits[0].field
  }

  return null
}

// ---------------------------------------------------------------------------
// 3. Value shape
// ---------------------------------------------------------------------------

// Deliberately narrow. This runs only after the schema and the keywords have
// both declined to answer, and a false positive here is worse than no answer:
// it would put the wrong string in the field the WhatsApp agent sends to.
//
// The bound that matters is the digit count. A budget answer is the realistic
// false positive ('5000000' is 7 digits), so the floor is 10 -- the length of
// an Indian mobile number -- and any alphabetic character disqualifies the
// value outright, which is what rules out '1-2 Cr' and '50 Lakh'.
function looksLikePhone(value: string): boolean {
  if (/[a-z]/i.test(value)) return false

  const digits = value.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

function looksLikeEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())
}

function resolveByValueShape(values: string[]): MappedFieldName | null {
  const value = values[0]
  if (!value) return null

  if (looksLikeEmail(value)) return 'email'
  if (looksLikePhone(value)) return 'phone'
  return null
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

// A lead has one phone number and one email, so these take the first value.
// A lead can genuinely pick several areas of interest, so those keep all of
// them. Either way nothing is discarded -- see the _additional note below.
const SINGLE_VALUED: ReadonlySet<MappedFieldName> = new Set<MappedFieldName>(['name', 'phone', 'email'])

type Resolution = { field: MappedFieldName } | { field: 'firstName' | 'lastName' } | null

function resolveQuestion(datum: MetaFieldDatum, question: MetaFormQuestion | undefined): Resolution {
  const declaredType = question?.type?.toUpperCase()

  if (declaredType) {
    if (FIRST_NAME_TYPES.has(declaredType)) return { field: 'firstName' }
    if (LAST_NAME_TYPES.has(declaredType)) return { field: 'lastName' }

    const fromType = QUESTION_TYPE_TO_FIELD[declaredType]
    if (fromType) return { field: fromType }
  }

  // Split-name keys, for a form whose schema we could not fetch.
  const key = normalizeFieldKey(datum.name)
  if (key === 'first_name' || key === 'given_name') return { field: 'firstName' }
  if (key === 'last_name' || key === 'family_name' || key === 'surname') return { field: 'lastName' }

  const fromKeyword = resolveByKeyword(datum.name, question?.label)
  if (fromKeyword) return { field: fromKeyword }

  const fromShape = resolveByValueShape(datum.values)
  if (fromShape) {
    console.log(`[meta-lead] "${datum.name}" resolved to ${fromShape} by value shape, not by name`)
    return { field: fromShape }
  }

  return null
}

// `schema` is the form's questions when they could be fetched. Absent, the
// mapper falls back to the keyword and value-shape layers, which is exactly
// what it did before the schema fetch existed -- so a Graph API failure
// degrades the mapping rather than failing the lead.
export function mapMetaFieldData(fieldData: MetaFieldDatum[], schema?: MetaFormQuestion[]): MappedMetaFields {
  const mapped: MappedMetaFields = { customFields: {} }
  const byKey = new Map((schema ?? []).map((question) => [normalizeFieldKey(question.key), question]))

  let firstName: string | undefined
  let lastName: string | undefined

  for (const datum of fieldData) {
    const { name, values } = datum
    const resolution = resolveQuestion(datum, byKey.get(normalizeFieldKey(name)))

    if (resolution?.field === 'firstName') {
      firstName = values[0] ?? ''
      continue
    }
    if (resolution?.field === 'lastName') {
      lastName = values[0] ?? ''
      continue
    }

    if (!resolution) {
      // Unmatched questions land in customFields, the same fallback FormLead
      // uses. Joined rather than truncated: a multi-select custom question is
      // the most likely place for several answers.
      mapped.customFields[name] = values.join(', ')
      continue
    }

    const field = resolution.field

    if (!SINGLE_VALUED.has(field)) {
      mapped[field] = values.join(', ')
      continue
    }

    mapped[field] = values[0] ?? ''

    // The old code took values[0] and dropped the rest with no trace. A second
    // phone number on a lead is unlikely, but 'unlikely' is not a reason to
    // lose a buyer's contact detail -- parking it keeps the normalized field
    // usable (phonesMatch and the WhatsApp send both need ONE number) while
    // still surfacing the extras to whoever reads the lead.
    if (values.length > 1) {
      console.warn(`[meta-lead] field "${name}" carried ${values.length} values; kept the first, parked the rest`)
      mapped.customFields[`${name}_additional`] = values.slice(1).join(', ')
    }
  }

  // Only when the form used the split keys AND had no whole-name question.
  const composed = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (composed && !mapped.name) mapped.name = composed

  return mapped
}
