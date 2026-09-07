// Packs a whole LeadRef into ONE URL-safe path segment, so a lead's deep link
// can ride a WhatsApp URL button.
//
// The constraint this exists for: Meta only allows a URL button's variable as a
// trailing path SUFFIX, and percent-encodes it. A LeadRef needs three values
// (source, scope, leadId) and the query-string form notification-service used
// -- /dashboard/leads/<id>?source=chat&botId=... -- therefore cannot be a
// button at all. Flattening the ref into a single opaque segment is what turns
// "Open the lead: https://very-long-url" in the message body into a button.
//
// Length does not matter here and is deliberately not optimised: the token
// lives behind a button label, so nobody ever reads it. Legibility of the
// ENCODING matters more than brevity, which is why this is base64url of a
// delimited string rather than something bit-packed.
//
// Mirrored by frontend/src/lib/lead-ref.ts, which does the unpacking for the
// /l/:token route. The two must stay in step; lead-link.test.ts and
// lead-ref.test.ts assert the same vectors on both sides.

import type { LeadRef } from '../types/index.js'

// '|' is safe as the delimiter because every field it separates is an id --
// a UUID, or a Meta numeric page id -- and none of them can contain one.
const DELIMITER = '|'

// The second field of a ref is a different key per source, and which one it is
// carries meaning: a Meta lead's pageId is NOT a botId (see the LeadRef comment
// in types/index.ts). Naming it 'scope' here keeps the packed form source-
// agnostic without pretending the four are the same thing.
export function leadRefScopeId(ref: LeadRef): string {
  switch (ref.source) {
    case 'chat':
      return ref.botId
    case 'form':
      return ref.formId
    case 'meta':
      return ref.pageId
    case 'voice':
      return ref.agentId
  }
}

export function packLeadRef(ref: LeadRef): string {
  const packed = [ref.source, leadRefScopeId(ref), ref.leadId].join(DELIMITER)
  return Buffer.from(packed, 'utf8').toString('base64url')
}

// Returns null rather than throwing on anything malformed. The only caller that
// matters is a public route reached from a link in a message -- a truncated or
// hand-edited token is an expected input there, not an exceptional one.
export function unpackLeadRef(token: string): LeadRef | null {
  let decoded: string
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const parts = decoded.split(DELIMITER)
  if (parts.length !== 3) return null

  const [source, scopeId, leadId] = parts
  if (!scopeId || !leadId) return null

  if (source === 'chat') return { source, botId: scopeId, leadId }
  if (source === 'form') return { source, formId: scopeId, leadId }
  if (source === 'meta') return { source, pageId: scopeId, leadId }
  // Voice was packable before it was unpackable: leadRefScopeId gained its
  // voice case, so packLeadRef happily produced `voice|<agentId>|<leadId>`,
  // and this function had no branch to read it back. The round trip broke at
  // the worst possible moment -- a caller asks for a human, the handoff alert
  // goes out with a link button, and the staff member who taps it lands on
  // nothing. Every source packLeadRef can write must appear here.
  if (source === 'voice') return { source, agentId: scopeId, leadId }

  return null
}
