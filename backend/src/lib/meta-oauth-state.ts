import crypto from 'node:crypto'

// Meta only accepts redirect URIs that are allowlisted in the App Dashboard,
// and only ONE is: the Lead Ads callback. So the WhatsApp connect reuses it
// and the two flows are told apart by a marker on the OAuth `state`.
//
// Safety of the discriminator: a Lead Ads state is `${clientId}:${hex}`. Hex
// contains no 'w', so no Lead Ads state can ever end in ':wa'. That is what
// makes it safe to branch on this before any Lead Ads logic runs -- and Lead
// Ads is the flow currently pending App Review, so a false positive there
// would be expensive.
export const WHATSAPP_STATE_MARKER = ':wa'

export function buildWhatsAppOAuthState(clientId: string): string {
  return `${clientId}:${crypto.randomBytes(16).toString('hex')}${WHATSAPP_STATE_MARKER}`
}

export function buildLeadAdsOAuthState(clientId: string): string {
  return `${clientId}:${crypto.randomBytes(16).toString('hex')}`
}

// Deliberately NOT a `state is string` type guard: a Lead Ads state is a
// string too, so that signature would narrow the *else* branch to `never` and
// break the Lead Ads path. Callers narrow with a plain `state &&` instead.
export function isWhatsAppOAuthState(state: string | undefined): boolean {
  return state?.endsWith(WHATSAPP_STATE_MARKER) ?? false
}

export function clientIdFromState(state: string): string {
  return state.split(':')[0]
}
