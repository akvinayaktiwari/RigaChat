import type { JourneyLead } from '../types/index.js'

const FALLBACK_PARAM_VALUE = 'there'

// Template parameters may be literals or `{{lead.field}}` references. Only a
// fixed set of lead fields is resolvable -- deliberately not arbitrary property
// access, because these values are client-authored and go straight into a
// message sent on the client's behalf.
//
// An unresolved reference never renders as the literal "{{lead.name}}", which
// would otherwise be delivered to a real person. It also never renders as an
// empty string: Meta rejects an empty or whitespace-only parameter (error
// 132000), so a missing value falls back to a neutral word and the message
// still goes out. "Hi there," is a far better outcome than a failed send.
const RESOLVABLE_LEAD_FIELDS = ['name', 'phone', 'email', 'propertyInterest', 'budgetRange'] as const

type ResolvableLeadField = (typeof RESOLVABLE_LEAD_FIELDS)[number]

function isResolvableLeadField(field: string): field is ResolvableLeadField {
  return (RESOLVABLE_LEAD_FIELDS as readonly string[]).includes(field)
}

export function resolveTemplateParams(params: string[], lead: JourneyLead): string[] {
  return params.map((param) => {
    const match = /^\{\{lead\.([a-zA-Z]+)\}\}$/.exec(param.trim())
    if (!match) return param
    if (!isResolvableLeadField(match[1])) return FALLBACK_PARAM_VALUE

    const value = lead[match[1]]
    const resolved = typeof value === 'string' ? value.trim() : ''
    return resolved.length > 0 ? resolved : FALLBACK_PARAM_VALUE
  })
}
